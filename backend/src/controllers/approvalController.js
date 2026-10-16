const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { pushNotification } = require('../services/sseService');
const { resolvePresetLine } = require('../services/approvalLine');
const { sendApprovalStyledEmail } = require('../services/emailService');
const { isEmailOptedOut } = require('../services/emailPreference');
const automation = require('../services/automationService');
const { canViewApprovalDoc, myPendingStepWhere, isMyTurnNow } = require('../services/approvalAccess');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/approval');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 위임(수동/휴가 자동)으로 재배정된 단계는 delegate()/applyAutoDelegation()이 approverId를
// 바꾸면서 actingType에 '위임' 또는 '휴가 자동위임' 마커를 미리 남겨둔다. 실제 승인/반려가
// 일어날 때 이 마커를 '본인'으로 덮어써버리면 "이 결재가 원래 결재자가 아니라 위임받은
// 사람이 처리했다"는 이력이 최종 결재란에서 사라진다 — 승인/반려 양쪽에서 공유해 동일하게 보존한다.
const DELEGATION_MARKERS = new Set(['위임', '휴가 자동위임']);
function resolveActingType(step, isDelegationStep) {
  if (isDelegationStep) return '전결';
  if (DELEGATION_MARKERS.has(step.actingType)) return step.actingType;
  return '본인';
}

// 문서번호 채번 헬퍼 — {양식코드}-{연도}-{4자리 일련번호}, 양식별·연도별 리셋
// 이미 채번된 문서(재상신 등)는 기존 번호를 유지한다.
async function assignDocNo(tx, doc) {
  if (doc.docNo) return doc.docNo;
  const code = doc.template?.code || 'DOC';
  const year = new Date().getFullYear();
  const row = await tx.approvalDocSeq.upsert({
    where: { formCode_year: { formCode: code, year } },
    create: { formCode: code, year, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return `${code}-${year}-${String(row.seq).padStart(4, '0')}`;
}

// 결재선 정규화 — 역할(type)·그룹(stepOrder) 부여.
// reference(참조/공람)는 진행에 영향을 주지 않으므로 stepOrder=0으로 둔다.
// 나머지(approval/agreement/delegation)는 stepOrder(그룹) 기준으로 순차/병렬을 표현한다.
function normalizeSteps(stepsArr) {
  const VALID = new Set(['approval', 'agreement', 'reference', 'delegation']);
  return (Array.isArray(stepsArr) ? stepsArr : []).map((s, i) => {
    const type = VALID.has(s.type) ? s.type : 'approval';
    const stepOrder = type === 'reference' ? 0 : (Number(s.stepOrder) || i + 1);
    return { approverId: Number(s.approverId), type, stepOrder, status: 'pending' };
  });
}

// 병렬결재 완료조건 — ApprovalDocument.groupPolicyJson: {"<stepOrder>": {"mode":"all"|"any"|"quorum","n"?}}
// 값이 없는 차수는 기존 동작과 동일한 'all'(전원 동의)로 취급해 하위호환을 보장한다.
function parseGroupPolicies(json) {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}
function policyForGroup(policies, stepOrder) {
  return policies[String(stepOrder)] || { mode: 'all' };
}

// 진행 대상(참조 제외) 그룹 수 = distinct stepOrder 개수.
// Math.max(stepOrder)를 쓰면 차수에 공백(gap)이 있을 때 totalSteps가 부풀려져 진행률이
// 틀어진다 — gap은 조건부 결재자용으로 의도적으로 비워둔 경우(approvalLine.js resolvePresetLine
// 참조)도 있어 gap 자체를 없애는 대신, 여기서는 "진행 분모"만 실제 그룹 수로 바로잡는다.
function countFlowGroups(steps) {
  const orders = new Set(steps.filter(s => s.type !== 'reference').map(s => s.stepOrder));
  return orders.size;
}

// 알림 발송 헬퍼
async function sendApprovalNotification(userId, type, documentId, message, actorId = null) {
  try {
    const notif = await prisma.notification.create({
      data: { userId, type, actorId, link: `/approvals/${documentId}`, message },
    });
    pushNotification(userId, notif);

    // 결재 요청(최초 상신·순차 진행·재개·중간 추가·기한초과 리마인더 전부 이 type을 공유)은
    // 인앱 알림만으로는 앱을 안 열어본 결재자가 놓치기 쉬워 이메일도 함께 보낸다.
    // SMTP 미설정 환경에서는 sendApprovalStyledEmail이 조용히 false를 반환하므로 안전하다.
    if (type === 'approval_requested' || type === 'mention') {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });
      if (target && !(await isEmailOptedOut(userId))) {
        // username을 이메일로 사용 — notificationService.generateNotifications와 동일한 기존 관례
        // (이 프로젝트에 별도 email 컬럼이 없음)
        sendApprovalStyledEmail(target.username, `[FlowDesk] ${message}`, target.displayName, message).catch(() => {});
      }
    }
  } catch (e) {
    console.error('결재 알림 발송 실패:', e.message);
  }
}

// 결재자가 오늘 '휴가'로 일정(F-55)에 등록돼 있고 사전에 자동위임 대상을 지정해뒀으면, 새로
// 차례가 된 단계를 그 대상에게 자동으로 넘긴다(기존 수동 위임과 동일하게 approverId를 바꾸고
// actingType을 남김). 베스트에포트 후처리 — 실패해도 원래 결재자에게 정상적으로 알림이 가는
// 기존 흐름을 해치지 않는다(호출부는 이 함수가 반환한 배열로 알림을 보낸다).
async function applyAutoDelegation(documentId, groupSteps, docTitle) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const resolved = [];
  // "이미 같은 문서 결재선에 포함된 사람" 조회는 step과 무관하게 항상 같은 결과라, 그룹 인원수(N)에
  // 비례해 매번 반복문 안에서 다시 날리는 건 순수 낭비였다 — 루프 밖에서 한 번만 조회하고, 이번
  // 호출에서 자동위임이 성사될 때마다(아래 approverIdsInFlow.add) 메모리에서 갱신해 같은 호출 내
  // 뒤따르는 반복에서도 "방금 위임된 대상과 충돌" 감지가 그대로 유지되도록 한다.
  const allFlowSteps = await prisma.approvalStep.findMany({ where: { documentId, type: { not: 'reference' } } });
  const approverIdsInFlow = new Set(allFlowSteps.map(s => s.approverId));

  for (const step of groupSteps) {
    try {
      const onVacation = await prisma.scheduleEventAssignee.findFirst({
        where: { userId: step.approverId, event: { type: 'vacation', startDate: { lte: today }, endDate: { gte: today } } },
      });
      if (!onVacation) { resolved.push(step); continue; }

      const pref = await prisma.appSetting.findUnique({ where: { key: `approval_auto_delegate_${step.approverId}` } });
      let toUserId = null;
      try { toUserId = pref?.value ? JSON.parse(pref.value)?.toUserId : null; } catch { toUserId = null; }
      if (!toUserId || toUserId === step.approverId) { resolved.push(step); continue; }

      const target = await prisma.user.findFirst({ where: { id: toUserId, isActive: true } });
      if (!target) { resolved.push(step); continue; }

      // 이미 같은 문서 결재선에 포함된 사람이면 충돌 방지를 위해 자동위임을 건너뜀(수동 위임과 동일 규칙)
      if (approverIdsInFlow.has(toUserId)) { resolved.push(step); continue; }

      await prisma.approvalStep.update({ where: { id: step.id }, data: { approverId: toUserId, actingType: '휴가 자동위임' } });
      approverIdsInFlow.add(toUserId);
      await sendApprovalNotification(
        step.approverId, 'approval_requested', documentId,
        `휴가 중으로 등록되어 있어 "${docTitle}" 결재가 ${target.displayName}님에게 자동 위임되었습니다.`, null,
      );
      resolved.push({ ...step, approverId: toUserId });
    } catch (e) {
      console.error('휴가 자동위임 처리 실패:', e.message);
      resolved.push(step);
    }
  }
  return resolved;
}

// 결재문서 목록/트리 공통 가시성·필터 where절 — 탭(mine/pending/reference/all)·상태·검색어·기간.
// list()의 templateId/formTypeId 필터만 이 함수 밖에서 별도로 얹는다(트리 자체 선택 축이라 트리 쪽엔 없음).
// 두 엔드포인트가 이 규칙을 각자 재구현하면 트리의 건수 롤업이 실제 목록과 어긋날 수 있어 반드시 공유한다.
function buildApprovalWhere({ tab, status, q, from, to, userId, role }) {
  const where = { delYn: '0' };
  if (status) where.status = status;

  // 키워드 검색: 제목 · 문서번호 · 기안자명
  if (q && String(q).trim()) {
    const kw = String(q).trim();
    where.OR = [
      { title: { contains: kw, mode: 'insensitive' } },
      { docNo: { contains: kw, mode: 'insensitive' } },
      { creator: { displayName: { contains: kw, mode: 'insensitive' } } },
    ];
  }
  // 기안일 기간 필터
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
  }

  if (tab === 'mine') {
    where.createdBy = userId;
  } else if (tab === 'pending') {
    where.steps = { some: { approverId: userId, status: 'pending', type: { not: 'reference' } } };
    where.status = 'pending';
  } else if (tab === 'reference') {
    where.steps = { some: { approverId: userId, type: 'reference' } };
    where.status = { not: 'draft' };
  } else if (tab === 'all' && role === 'admin') {
    // admin 전체 목록 - 필터 없음
  } else {
    where.createdBy = userId;
  }
  return where;
}

// GET /api/approvals  (query: tab=mine|pending|all, status, page, limit)
const list = async (req, res, next) => {
  try {
    const { tab = 'mine', status, page = 1, limit = 20, q, formTypeId, templateId, from, to } = req.query;
    const userId = req.user.id;

    const where = buildApprovalWhere({ tab, status, q, from, to, userId, role: req.user.role });
    // 양식(템플릿) / 양식종류 필터 — 트리 노드 선택 연동
    if (templateId) where.templateId = Number(templateId);
    else if (formTypeId) where.template = { formTypeId: Number(formTypeId) };

    const [total, documents] = await Promise.all([
      prisma.approvalDocument.count({ where }),
      prisma.approvalDocument.findMany({
        where,
        include: {
          template: {
            select: {
              id: true, name: true,
              formType: { select: { id: true, name: true } },
            },
          },
          creator: { select: { id: true, displayName: true, avatarColor: true } },
          steps: {
            include: { approver: { select: { id: true, displayName: true } } },
            orderBy: { stepOrder: 'asc' },
          },
          _count: { select: { attachments: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
    ]);

    res.json({ total, documents });
  } catch (err) {
    next(err);
  }
};

// GET /api/approvals/tree  (query: tab, status, q, from, to)
// 결재종류(트리) → 양식 계층 + 현재 탭 가시성 기준 문서 건수 롤업
const tree = async (req, res, next) => {
  try {
    const { tab = 'mine', status, q, from, to } = req.query;
    const userId = req.user.id;

    // 목록(list)과 동일한 가시성/필터 조건을 공유 헬퍼로 계산(양식·종류 필터만 트리 자체 축이라 제외)
    const where = buildApprovalWhere({ tab, status, q, from, to, userId, role: req.user.role });

    const [formTypes, templates, grouped] = await Promise.all([
      prisma.approvalFormType.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, icon: true, color: true, parentId: true },
      }),
      prisma.approvalTemplate.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, formTypeId: true, code: true },
      }),
      prisma.approvalDocument.groupBy({ by: ['templateId'], where, _count: { _all: true } }),
    ]);

    const countByTemplate = Object.fromEntries(grouped.map((g) => [g.templateId, g._count._all]));
    const templatesByType = {};
    for (const t of templates) {
      (templatesByType[t.formTypeId] ||= []).push({ id: t.id, name: t.name, code: t.code, count: countByTemplate[t.id] || 0 });
    }

    const nodeById = {};
    formTypes.forEach((ft) => { nodeById[ft.id] = { ...ft, templates: templatesByType[ft.id] || [], children: [] }; });
    const roots = [];
    formTypes.forEach((ft) => {
      const node = nodeById[ft.id];
      if (ft.parentId && nodeById[ft.parentId]) nodeById[ft.parentId].children.push(node);
      else roots.push(node);
    });
    const rollup = (node) => {
      let sum = node.templates.reduce((a, t) => a + t.count, 0);
      node.children.forEach((c) => { sum += rollup(c); });
      node.count = sum;
      return sum;
    };
    roots.forEach(rollup);

    res.json({ tree: roots });
  } catch (err) {
    next(err);
  }
};

// GET /api/approvals/:id
const get = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: {
        template: {
          include: { formType: { select: { id: true, name: true } } },
        },
        creator: { select: { id: true, displayName: true, avatarColor: true } },
        steps: {
          include: { approver: { select: { id: true, displayName: true, avatarColor: true } } },
          orderBy: { stepOrder: 'asc' },
        },
        attachments: {
          where: { commentId: null }, // 문서 전체 첨부만 — 의견(댓글) 첨부는 comments.attachments로 따로 내려간다
          include: { uploader: { select: { id: true, displayName: true } } },
        },
        comments: {
          include: {
            user: { select: { id: true, displayName: true, avatarColor: true } },
            attachments: { include: { uploader: { select: { id: true, displayName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
        histories: {
          include: { user: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });

    // 접근 권한: 작성자 or 결재자 or admin
    if (req.user.role !== 'admin' && !canViewApprovalDoc(doc, req.user.id)) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals  — 임시저장(draft)
const create = async (req, res, next) => {
  try {
    const { templateId, title, formData, steps, isUrgent, dueDate, groupPolicies } = req.body;
    if (!templateId || !title) {
      return res.status(400).json({ error: '템플릿과 제목은 필수입니다.' });
    }

    const template = await prisma.approvalTemplate.findUnique({ where: { id: Number(templateId) } });
    if (!template || !template.isActive) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

    const stepsArr = normalizeSteps(steps);

    const doc = await prisma.approvalDocument.create({
      data: {
        templateId: Number(templateId),
        title,
        formData: typeof formData === 'string' ? formData : JSON.stringify(formData ?? {}),
        status: 'draft',
        totalSteps: countFlowGroups(stepsArr),
        currentStep: 0,
        isUrgent: !!isUrgent,
        dueDate: dueDate ? new Date(dueDate) : null,
        groupPolicyJson: groupPolicies ? JSON.stringify(groupPolicies) : null,
        createdBy: req.user.id,
        steps: { create: stepsArr },
      },
      include: {
        steps: { include: { approver: { select: { id: true, displayName: true } } }, orderBy: { stepOrder: 'asc' } },
        template: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
      },
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/approvals/:id  — draft 상태만 수정 가능
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.approvalDocument.findFirst({ where: { id, delYn: '0' } });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    if (doc.status !== 'draft') {
      return res.status(400).json({ error: '임시저장 상태의 문서만 수정할 수 있습니다.' });
    }

    const { title, formData, steps, isUrgent, dueDate, groupPolicies } = req.body;

    await prisma.$transaction(async (tx) => {
      const normalized = steps !== undefined ? normalizeSteps(steps) : undefined;

      await tx.approvalDocument.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(formData !== undefined && {
            formData: typeof formData === 'string' ? formData : JSON.stringify(formData),
          }),
          ...(normalized !== undefined && { totalSteps: countFlowGroups(normalized) }),
          ...(isUrgent !== undefined && { isUrgent: !!isUrgent }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(groupPolicies !== undefined && { groupPolicyJson: groupPolicies ? JSON.stringify(groupPolicies) : null }),
        },
      });

      if (normalized !== undefined) {
        await tx.approvalStep.deleteMany({ where: { documentId: id } });
        if (normalized.length > 0) {
          await tx.approvalStep.createMany({
            data: normalized.map(s => ({ documentId: id, ...s })),
          });
        }
      }
    });

    const updated = await prisma.approvalDocument.findUnique({
      where: { id },
      include: {
        steps: { include: { approver: { select: { id: true, displayName: true } } }, orderBy: { stepOrder: 'asc' } },
        template: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/submit  — 상신 (draft → pending)
const submit = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, creator: true, template: { select: { code: true, lineJson: true, formTypeId: true, fieldsJson: true } } },
    });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id) return res.status(403).json({ error: '상신 권한이 없습니다.' });
    if (doc.status !== 'draft') return res.status(400).json({ error: '임시저장 상태의 문서만 상신할 수 있습니다.' });

    if (doc.steps.filter(s => s.type !== 'reference').length === 0) {
      return res.status(400).json({ error: '결재자(승인/합의)를 1명 이상 지정해야 합니다.' });
    }

    // 기능별 자동 결재라인 — 프리셋의 조건부 결재자를 formData 기준으로 평가해 자동 주입
    let formData = {};
    try { formData = doc.formData ? JSON.parse(doc.formData) : {}; } catch {}
    const { steps: resolved } = await resolvePresetLine(prisma, doc.template, formData, req.user.id);
    const conditionalSteps = resolved.filter(s => s.conditional);
    const toInject = conditionalSteps.filter(cs =>
      !doc.steps.some(s => s.approverId === cs.approverId && s.stepOrder === cs.stepOrder && s.type === cs.type));

    // 주입 후 최종 결재선으로 첫 그룹/총 그룹 계산
    const allSteps = [...doc.steps, ...toInject];
    const flowSteps = allSteps.filter(s => s.type !== 'reference');
    const firstGroup = Math.min(...flowSteps.map(s => s.stepOrder));

    await prisma.$transaction(async (tx) => {
      if (toInject.length > 0) {
        await tx.approvalStep.createMany({
          data: toInject.map(s => ({
            documentId: id, stepOrder: s.stepOrder, approverId: s.approverId, type: s.type, status: 'pending',
          })),
        });
      }
      const docNo = await assignDocNo(tx, doc);
      await tx.approvalDocument.update({
        where: { id },
        // fieldsJsonSnap — 상신 시점의 양식 필드 구조를 문서에 고정한다. 이후 관리자가 템플릿의
        // 필드를 수정/삭제해도 이미 상신된(결재 진행 중이거나 완료된) 문서는 당시 모습 그대로
        // 보여야 하는 기록물이므로, 상세화면은 이 스냅샷을 우선 사용한다(없으면 라이브 템플릿 폴백
        // — 이 필드 추가 이전에 이미 제출된 과거 문서용 하위호환).
        data: {
          status: 'pending', currentStep: firstGroup, docNo, totalSteps: countFlowGroups(flowSteps),
          fieldsJsonSnap: doc.template?.fieldsJson ?? null,
        },
      });
    });

    // 첫 그룹 결재자 전원에게 알림 (병렬이면 여러 명) — 휴가 중이면 자동위임 먼저 적용.
    // toInject로 막 추가된 조건부 스텝은 메모리상 객체에 DB id가 없다(createMany는 생성된
    // row를 반환하지 않음) — applyAutoDelegation은 approverId를 바꾸려고 id로 update()를
    // 호출하므로, id 없는 객체를 그대로 넘기면 그 호출만 조용히 실패해(try/catch로 삼켜짐)
    // 조건부로 추가된 첫 그룹 결재자의 휴가 자동위임이 무력화됐다. 커밋된 실제 row를 다시
    // 읽어 항상 id가 있는 상태로 넘긴다.
    const firstGroupStepsFromDb = await prisma.approvalStep.findMany({
      where: { documentId: id, stepOrder: firstGroup, type: { not: 'reference' } },
    });
    const firstGroupSteps = await applyAutoDelegation(id, firstGroupStepsFromDb, doc.title);
    await Promise.all(firstGroupSteps.map(s => sendApprovalNotification(
      s.approverId, 'approval_requested', id,
      `${doc.creator.displayName}님이 결재를 요청했습니다.`, req.user.id,
    )));

    // 참조/공람자에게 열람 통보
    const refSteps = allSteps.filter(s => s.type === 'reference');
    await Promise.all(refSteps.map(s => sendApprovalNotification(
      s.approverId, 'approval_requested', id,
      `${doc.creator.displayName}님의 문서를 참조로 받았습니다.`, req.user.id,
    )));

    res.json({ message: toInject.length > 0 ? `상신되었습니다. (조건부 결재자 ${toInject.length}명 자동 추가)` : '상신되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/approve
const approve = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { comment } = req.body;

    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, creator: true, template: { select: { code: true } } },
    });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.status !== 'pending') return res.status(400).json({ error: '결재 진행 중인 문서만 승인할 수 있습니다.' });

    // 현재 그룹에서 내게 배정된 미처리 단계 (참조 제외)
    const myStep = doc.steps.find(s =>
      s.stepOrder === doc.currentStep && s.approverId === req.user.id &&
      s.status === 'pending' && s.type !== 'reference');
    if (!myStep) return res.status(403).json({ error: '현재 결재 차례가 아닙니다.' });

    // 승인 시점 서명 스냅샷 — 이후 사용자 정보가 바뀌어도 문서엔 당시 값이 보존된다.
    const approver = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { displayName: true, position: true, jobGrade: true, signImagePath: true, sealImagePath: true },
    });
    const isDelegation = myStep.type === 'delegation';

    // 다음 그룹(참조 제외, 현재보다 큰 최소 stepOrder) — 스텝의 구조(stepOrder/approverId/type)는
    // 동시 요청 중에도 바뀌지 않으므로 doc 스냅샷에서 가져와도 안전하다. 반면 각 스텝의 status는
    // 동시에 바뀔 수 있어, 그 판정(othersPending/groupDone)은 아래 트랜잭션 내부에서 잠근 뒤
    // 다시 읽어 수행한다 — pre-tx 스냅샷으로 판정하면 같은 그룹의 두 승인자가 거의 동시에
    // 승인할 때 서로의 커밋을 보지 못해 둘 다 "그룹 미완료"로 착각하고 문서가 영구 결재대기로
    // 멈추는 레이스가 있었다.
    const nextOrders = doc.steps.filter(s => s.type !== 'reference' && s.stepOrder > doc.currentStep).map(s => s.stepOrder);
    const nextGroup = nextOrders.length ? Math.min(...nextOrders) : null;

    // 병렬그룹 완료조건(전원/임의1인/과반수) — 기안자가 결재선 작성 시 그룹별로 지정 가능.
    // 지정하지 않은 그룹은 'all'(전원 동의, 기존 동작과 동일)로 처리해 하위호환을 보장한다.
    const policy = policyForGroup(parseGroupPolicies(doc.groupPolicyJson), doc.currentStep);

    let outcome = 'waiting'; // waiting | advanced | finalApproved

    try {
      await prisma.$transaction(async (tx) => {
        // 문서 row를 잠가 같은 그룹의 동시 승인 요청을 직렬화한다 — 이 트랜잭션이 끝나기 전까지
        // 같은 문서에 대한 다른 approve/reject 트랜잭션은 이 지점에서 대기한다.
        await tx.$queryRaw`SELECT id FROM approval_documents WHERE id = ${id} FOR UPDATE`;

        const updated = await tx.approvalStep.updateMany({
          where: { id: myStep.id, status: 'pending' },
          data: {
            status: 'approved', comment: comment ?? null, actionAt: new Date(),
            approverNameSnap: approver?.displayName ?? null,
            approverTitleSnap: approver?.position || approver?.jobGrade || null,
            signImagePath: approver?.sealImagePath || approver?.signImagePath || null,
            signedIp: req.ip ?? null,
            actingType: resolveActingType(myStep, isDelegation),
          },
        });
        if (updated.count === 0) throw new Error('ALREADY_PROCESSED');

        if (isDelegation) {
          // 전결: 이후 잔여 결재 단계를 건너뛰고 최종 승인 확정
          await tx.approvalStep.updateMany({
            where: { documentId: id, status: 'pending', type: { not: 'reference' }, stepOrder: { gt: doc.currentStep } },
            data: { status: 'skipped' },
          });
          await tx.approvalDocument.update({ where: { id }, data: { status: 'approved' } });
          outcome = 'finalApproved';
          return;
        }

        // 잠금을 획득한 뒤 그룹 현황을 다시 읽어 판정 — 방금 커밋된 내 승인을 포함한 최신 상태.
        const freshGroupSteps = await tx.approvalStep.findMany({
          where: { documentId: id, stepOrder: doc.currentStep, type: { not: 'reference' } },
        });
        const othersPending = freshGroupSteps.some(s => s.id !== myStep.id && s.status === 'pending');
        const approvedInGroup = freshGroupSteps.filter(s => s.status === 'approved').length;

        let groupDone;
        if (policy.mode === 'any') groupDone = true;
        else if (policy.mode === 'quorum') {
          // policy.n이 없을 때의 "과반수" 기본값 — floor(n/2)+1이어야 짝수 인원에서도 정확한
          // 과반수(예: 4명 중 3명)가 된다. ceil(n/2)는 짝수일 때 정확히 절반(4명 중 2명)만으로도
          // 통과시켜버려 "과반수"라는 이름과 실제 동작이 맞지 않았다.
          const need = Math.max(1, Number(policy.n) || (Math.floor(freshGroupSteps.length / 2) + 1));
          groupDone = approvedInGroup >= need;
        } else {
          groupDone = !othersPending; // 'all' (기본값)
        }

        if (!groupDone) {
          // 병렬: 완료조건(전원/임의1인/과반수)을 아직 못 채움 — 같은 그룹의 다른 결재자를 기다림
          outcome = 'waiting';
          return;
        }

        // 완료조건을 충족했는데 아직 응답 안 한 동료가 있으면(any/quorum) 더 이상 의미 없으니 skip 처리
        if (othersPending) {
          await tx.approvalStep.updateMany({
            where: { documentId: id, stepOrder: doc.currentStep, status: 'pending', type: { not: 'reference' } },
            data: { status: 'skipped' },
          });
        }
        if (nextGroup === null) {
          await tx.approvalDocument.update({ where: { id }, data: { status: 'approved' } });
          outcome = 'finalApproved';
        } else {
          await tx.approvalDocument.update({ where: { id }, data: { currentStep: nextGroup } });
          outcome = 'advanced';
        }
      });
    } catch (err) {
      if (err.message === 'ALREADY_PROCESSED') {
        return res.status(409).json({ error: '이미 처리된 결재입니다.' });
      }
      throw err;
    }

    if (outcome === 'finalApproved') {
      await sendApprovalNotification(
        doc.createdBy, 'approval_approved', id,
        `결재 문서 "${doc.title}"이(가) 최종 승인되었습니다.`, req.user.id,
      );
      automation.fire('approval.approved', {
        title: doc.title, docNo: doc.docNo, templateCode: doc.template?.code, authorId: doc.createdBy,
        link: `/approvals/${id}`, actorId: req.user.id,
      });
    } else if (outcome === 'advanced') {
      const nextGroupSteps = await applyAutoDelegation(
        id, doc.steps.filter(s => s.stepOrder === nextGroup && s.type !== 'reference'), doc.title,
      );
      await Promise.all(nextGroupSteps.map(s => sendApprovalNotification(
        s.approverId, 'approval_requested', id,
        `${doc.creator.displayName}님의 결재를 요청받았습니다.`, req.user.id,
      )));
    }

    res.json({ message: isDelegation ? '전결 처리되었습니다.' : '승인되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/reject
// 반려 사유 카테고리 — 자유 텍스트(comment)와 별개로 통계 집계가 가능하도록 분류한다.
const REJECT_CATEGORIES = new Set(['단가초과', '서류미비', '중복신청', '정책위반', '내용오류', '기타']);

const reject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { comment, category } = req.body;
    const rejectReasonCategory = REJECT_CATEGORIES.has(category) ? category : null;

    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, creator: true, template: { select: { code: true } } },
    });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.status !== 'pending') return res.status(400).json({ error: '결재 진행 중인 문서만 반려할 수 있습니다.' });

    const myStep = doc.steps.find(s =>
      s.stepOrder === doc.currentStep && s.approverId === req.user.id &&
      s.status === 'pending' && s.type !== 'reference');
    if (!myStep) return res.status(403).json({ error: '현재 결재 차례가 아닙니다.' });

    // 반려자 서명 스냅샷도 남긴다 (누가 반려했는지 결재란에 표시)
    const approver = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { displayName: true, position: true, jobGrade: true, signImagePath: true, sealImagePath: true },
    });

    // 병렬그룹 완료조건(전원/임의1인/과반수) — approve()와 동일한 정책을 반려에도 적용한다.
    // 'all'은 기존 동작과 동일하게 1인 반려 즉시 문서 반려 확정. any/quorum 그룹은 남은
    // 인원(이미 승인+아직 대기 중)으로 여전히 조건을 채울 가능성이 있으면 이 사람의 반려만
    // 기록하고 문서는 pending을 유지한 채 다른 결재자의 응답을 기다린다.
    const policy = policyForGroup(parseGroupPolicies(doc.groupPolicyJson), doc.currentStep);

    let outcome = 'waiting'; // waiting | rejected

    try {
      await prisma.$transaction(async (tx) => {
        // approve()와 동일하게 문서 row를 잠가 동시 반려/승인 레이스를 직렬화한다.
        await tx.$queryRaw`SELECT id FROM approval_documents WHERE id = ${id} FOR UPDATE`;

        const updated = await tx.approvalStep.updateMany({
          where: { id: myStep.id, status: 'pending' },
          data: {
            status: 'rejected', comment: comment ?? null, actionAt: new Date(),
            approverNameSnap: approver?.displayName ?? null,
            approverTitleSnap: approver?.position || approver?.jobGrade || null,
            signedIp: req.ip ?? null, actingType: resolveActingType(myStep, false),
          },
        });
        if (updated.count === 0) throw new Error('ALREADY_PROCESSED');

        const freshGroupSteps = await tx.approvalStep.findMany({
          where: { documentId: id, stepOrder: doc.currentStep, type: { not: 'reference' } },
        });
        const approvedInGroup = freshGroupSteps.filter(s => s.status === 'approved').length;
        const pendingInGroup = freshGroupSteps.filter(s => s.status === 'pending').length;

        let groupFailed;
        if (policy.mode === 'any') {
          groupFailed = approvedInGroup === 0 && pendingInGroup === 0;
        } else if (policy.mode === 'quorum') {
          const need = Math.max(1, Number(policy.n) || (Math.floor(freshGroupSteps.length / 2) + 1));
          groupFailed = (approvedInGroup + pendingInGroup) < need;
        } else {
          groupFailed = true; // 'all' (기본값)
        }

        if (!groupFailed) {
          outcome = 'waiting';
          return;
        }

        // rejectedStep 기록 — 부분 반려 재상신(Phase 3)에서 이 지점부터 재개한다.
        await tx.approvalDocument.update({
          where: { id },
          data: { status: 'rejected', rejectedStep: doc.currentStep, rejectReasonCategory },
        });
        outcome = 'rejected';
      });
    } catch (err) {
      if (err.message === 'ALREADY_PROCESSED') {
        return res.status(409).json({ error: '이미 처리된 결재입니다.' });
      }
      throw err;
    }

    if (outcome === 'rejected') {
      await sendApprovalNotification(
        doc.createdBy, 'approval_rejected', id,
        `결재 문서 "${doc.title}"이(가) 반려되었습니다.`,
        req.user.id
      );
      automation.fire('approval.rejected', {
        title: doc.title, docNo: doc.docNo, templateCode: doc.template?.code, authorId: doc.createdBy,
        link: `/approvals/${id}`, actorId: req.user.id,
      });
    }

    res.json({
      message: outcome === 'rejected'
        ? '반려되었습니다.'
        : '반려 의견이 기록되었습니다. 그룹 내 다른 결재자의 응답을 기다립니다.',
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/cancel
const cancel = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.approvalDocument.findFirst({ where: { id, delYn: '0' } });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '취소 권한이 없습니다.' });
    }
    if (!['draft', 'pending'].includes(doc.status)) {
      return res.status(400).json({ error: '이미 처리된 문서는 취소할 수 없습니다.' });
    }

    await prisma.approvalDocument.update({ where: { id }, data: { status: 'cancelled' } });
    res.json({ message: '취소되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/delegate — 현재 결재 단계를 다른 사용자에게 위임(대결)
const delegate = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { toUserId, comment } = req.body;
    if (!toUserId) return res.status(400).json({ error: '위임할 대상을 선택하세요.' });

    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: { steps: true },
    });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.status !== 'pending') return res.status(400).json({ error: '결재 진행 중인 문서만 위임할 수 있습니다.' });

    // 현재 차수에서 내게 배정된 미처리 단계
    const myStep = doc.steps.find(s =>
      s.stepOrder === doc.currentStep && s.approverId === req.user.id &&
      s.status === 'pending' && s.type !== 'reference');
    if (!myStep) return res.status(403).json({ error: '현재 결재 차례가 아닙니다.' });

    const toId = Number(toUserId);
    if (toId === req.user.id) return res.status(400).json({ error: '본인에게는 위임할 수 없습니다.' });
    const to = await prisma.user.findFirst({ where: { id: toId, isActive: true } });
    if (!to) return res.status(404).json({ error: '위임 대상 사용자를 찾을 수 없습니다.' });
    if (doc.steps.some(s => s.approverId === toId && s.type !== 'reference')) {
      return res.status(400).json({ error: '이미 결재선에 포함된 사용자입니다.' });
    }

    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { displayName: true } });

    await prisma.approvalStep.update({
      where: { id: myStep.id },
      data: { approverId: toId, actingType: '위임' },
    });

    const notifyMsg = `${me?.displayName || ''}님이 "${doc.title}" 결재를 위임했습니다.${comment ? ` — ${comment}` : ''}`;
    await sendApprovalNotification(
      toId, 'approval_requested', id,
      notifyMsg.length > 500 ? notifyMsg.slice(0, 497) + '...' : notifyMsg,
      req.user.id,
    );

    const updated = await prisma.approvalDocument.findUnique({
      where: { id },
      include: { steps: { include: { approver: { select: { id: true, displayName: true } } }, orderBy: { stepOrder: 'asc' } } },
    });
    res.json({ message: '위임되었습니다.', document: updated });
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/steps — 진행 중인 문서에 참조자/결재자를 추가(상신 후 자유도 확대)
// 안전을 위해 두 가지만 허용한다:
//  ① 참조(열람) 추가 — 진행에 영향이 없으므로 언제나 허용
//  ② 승인/합의/전결 추가 — 아직 아무도 투표하지 않은 "미래 차수(stepOrder > currentStep)"에만 허용.
//     이미 진행 중이거나 지난 차수에 끼워 넣으면 이미 확정된 결과를 사후에 바꾸는 셈이라 금지한다.
const addStep = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { approverId, type, stepOrder } = req.body;

    const doc = await prisma.approvalDocument.findFirst({ where: { id, delYn: '0' }, include: { steps: true } });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '기안자 또는 관리자만 결재자를 추가할 수 있습니다.' });
    }
    if (doc.status !== 'pending') return res.status(400).json({ error: '진행 중인 문서에만 추가할 수 있습니다.' });

    const uid = Number(approverId);
    const target = await prisma.user.findFirst({ where: { id: uid, isActive: true } });
    if (!target) return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });

    const VALID = new Set(['approval', 'agreement', 'delegation', 'reference']);
    const t = VALID.has(type) ? type : 'reference';

    let targetOrder;
    if (t === 'reference') {
      targetOrder = 0;
      if (doc.steps.some(s => s.approverId === uid && s.type === 'reference')) {
        return res.status(400).json({ error: '이미 참조로 등록된 사용자입니다.' });
      }
    } else {
      targetOrder = Number(stepOrder);
      if (!targetOrder || targetOrder <= doc.currentStep) {
        return res.status(400).json({ error: '현재 진행 중이거나 이미 지난 차수에는 추가할 수 없습니다. 이후 차수를 지정하세요.' });
      }
      if (doc.steps.some(s => s.approverId === uid && s.type !== 'reference')) {
        return res.status(400).json({ error: '이미 결재선에 포함된 사용자입니다.' });
      }
    }

    // totalSteps 재계산(참조 제외 distinct 차수 수) — 새 차수를 만든 경우 분모가 늘어난다
    const allFlow = [...doc.steps, { type: t, stepOrder: targetOrder }].filter(s => s.type !== 'reference');

    const [created] = await prisma.$transaction([
      prisma.approvalStep.create({
        data: { documentId: id, approverId: uid, type: t, stepOrder: targetOrder, status: 'pending' },
        include: { approver: { select: { id: true, displayName: true } } },
      }),
      prisma.approvalDocument.update({ where: { id }, data: { totalSteps: countFlowGroups(allFlow) } }),
      prisma.approvalDocumentHistory.create({
        data: {
          documentId: id, userId: req.user.id, action: 'step_added', field: target.displayName,
          newValue: JSON.stringify({ type: t, stepOrder: targetOrder }),
        },
      }),
    ]);

    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { displayName: true } });
    await sendApprovalNotification(
      uid, 'approval_requested', id,
      t === 'reference'
        ? `${me?.displayName || ''}님의 결재 문서 "${doc.title}"에 참조로 추가되었습니다.`
        : `${me?.displayName || ''}님이 결재 문서 "${doc.title}"의 ${targetOrder}차 결재자로 추가했습니다.`,
      req.user.id,
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/approvals/:id/steps/:stepId — 상신 후 추가했던 참조/미래 차수 결재자를 제거
// (이미 처리됐거나 현재 진행 중인 단계는 승인/반려 이력 보존을 위해 제거 불가)
const removeStep = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const stepId = Number(req.params.stepId);

    const doc = await prisma.approvalDocument.findFirst({ where: { id, delYn: '0' }, include: { steps: true } });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '기안자 또는 관리자만 제거할 수 있습니다.' });
    }
    if (doc.status !== 'pending') return res.status(400).json({ error: '진행 중인 문서에서만 제거할 수 있습니다.' });

    const step = doc.steps.find(s => s.id === stepId);
    if (!step) return res.status(404).json({ error: '결재 단계를 찾을 수 없습니다.' });
    if (step.type !== 'reference' && step.stepOrder <= doc.currentStep) {
      return res.status(400).json({ error: '현재 진행 중이거나 이미 지난 차수는 제거할 수 없습니다.' });
    }
    if (step.status !== 'pending') {
      return res.status(400).json({ error: '이미 처리된 단계는 제거할 수 없습니다.' });
    }

    const remainFlow = doc.steps.filter(s => s.id !== stepId && s.type !== 'reference');

    // 정족수(quorum) 그룹에서 인원을 빼면 "필요 인원 > 남은 인원"이 되어 그 차수가 영원히
    // 완료될 수 없는 상태(deadlock)가 될 수 있다 — 제거 후 남은 인원수에 맞춰 정족수를 함께 낮춘다.
    const policies = parseGroupPolicies(doc.groupPolicyJson);
    let policiesChanged = false;
    if (step.type !== 'reference') {
      const key = String(step.stepOrder);
      const pol = policies[key];
      if (pol?.mode === 'quorum') {
        const remainInGroup = remainFlow.filter(s => s.stepOrder === step.stepOrder).length;
        if (remainInGroup > 0 && Number(pol.n) > remainInGroup) {
          policies[key] = { mode: 'quorum', n: remainInGroup };
          policiesChanged = true;
        }
      }
    }

    const removedUser = await prisma.user.findUnique({ where: { id: step.approverId }, select: { displayName: true } });

    await prisma.$transaction([
      prisma.approvalStep.delete({ where: { id: stepId } }),
      prisma.approvalDocument.update({
        where: { id },
        data: {
          totalSteps: countFlowGroups(remainFlow),
          ...(policiesChanged && { groupPolicyJson: JSON.stringify(policies) }),
        },
      }),
      prisma.approvalDocumentHistory.create({
        data: {
          documentId: id, userId: req.user.id, action: 'step_removed',
          field: removedUser?.displayName || `사용자 ${step.approverId}`,
          oldValue: JSON.stringify({ type: step.type, stepOrder: step.stepOrder }),
        },
      }),
    ]);

    res.json({ message: '제거되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/approvals/:id  — draft 상태만 삭제
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.approvalDocument.findFirst({ where: { id, delYn: '0' } });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    if (doc.status !== 'draft') {
      return res.status(400).json({ error: '임시저장 상태의 문서만 삭제할 수 있습니다.' });
    }

    await prisma.approvalDocument.update({ where: { id }, data: { delYn: '1' } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// 첨부파일 ────────────────────────────────────────────────────────────

const uploadAttachment = async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const doc = await prisma.approvalDocument.findFirst({ where: { id: documentId, delYn: '0' } });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });

    // commentId가 오면 "의견(댓글) 첨부"로 연결 — 같은 문서의 댓글인지 확인(다른 문서 댓글에 몰래 묶이는 것 방지)
    let commentId = null;
    if (req.body.commentId) {
      const cid = Number(req.body.commentId);
      const comment = await prisma.approvalComment.findFirst({ where: { id: cid, documentId } });
      if (!comment) return res.status(404).json({ error: '의견을 찾을 수 없습니다.' });
      commentId = cid;
    }

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const attachment = await prisma.approvalAttachment.create({
      data: {
        documentId,
        commentId,
        uploadedBy: req.user.id,
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      include: { uploader: { select: { id: true, displayName: true } } },
    });
    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
};

const downloadAttachment = async (req, res, next) => {
  try {
    const attachment = await prisma.approvalAttachment.findUnique({
      where: { id: Number(req.params.aid) },
      include: { document: { select: { createdBy: true, delYn: true, steps: { select: { approverId: true } } } } },
    });
    if (!attachment) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    // 접근 권한: 작성자·결재자·admin만 (get과 동일 규칙)
    const doc = attachment.document;
    if (!doc || doc.delYn !== '0') return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && !canViewApprovalDoc(doc, req.user.id)) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 서버에 존재하지 않습니다.' });

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
    res.setHeader('Content-Type', attachment.mimeType);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

const removeAttachment = async (req, res, next) => {
  try {
    const attachment = await prisma.approvalAttachment.findUnique({
      where: { id: Number(req.params.aid) },
    });
    if (!attachment) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && attachment.uploadedBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.approvalAttachment.delete({ where: { id: attachment.id } });
    res.json({ message: '파일이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// 의견(댓글) ──────────────────────────────────────────────────────────

const listComments = async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const comments = await prisma.approvalComment.findMany({
      where: { documentId },
      include: {
        user: { select: { id: true, displayName: true, avatarColor: true } },
        attachments: { include: { uploader: { select: { id: true, displayName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    next(err);
  }
};

// 댓글 내용의 "@표시이름" 멘션을 찾아 해당 사용자에게 알림(+이메일)을 보낸다.
// 문서 접근 권한과 무관하게 활성 사용자 전원을 대상으로 매칭한다 — 권한이 없는 사용자가
// 멘션되면 알림 링크를 클릭해도 기존 접근제어(canViewApprovalDoc)에서 그대로 막히므로 안전하다.
async function notifyMentions(content, documentId, actorId, docTitle) {
  const names = [...new Set((content.match(/@([^\s@]{1,50})/g) || []).map((s) => s.slice(1)))];
  if (names.length === 0) return;
  const users = await prisma.user.findMany({ where: { displayName: { in: names }, isActive: true } });
  // 멘션된 사람 수(M)만큼 순차 await 하던 것을 동시 발송으로 전환 — 각 알림은 서로 독립적이라
  // 직렬화할 이유가 없고, 순차로 두면 멘션이 많은 댓글일수록 응답이 M배 느려졌다.
  await Promise.all(
    users
      .filter((u) => u.id !== actorId)
      .map((u) => sendApprovalNotification(u.id, 'mention', documentId, `"${docTitle}" 결재 의견에서 회원님을 언급했습니다.`, actorId)),
  );
}

const createComment = async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '내용은 필수입니다.' });

    const doc = await prisma.approvalDocument.findFirst({ where: { id: documentId, delYn: '0' } });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });

    const comment = await prisma.approvalComment.create({
      data: { documentId, userId: req.user.id, content },
      include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
    });
    notifyMentions(content, documentId, req.user.id, doc.title).catch((e) => console.error('멘션 알림 실패:', e.message));
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

const updateComment = async (req, res, next) => {
  try {
    const cid = Number(req.params.cid);
    const comment = await prisma.approvalComment.findUnique({ where: { id: cid } });
    if (!comment) return res.status(404).json({ error: '의견을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && comment.userId !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const { content } = req.body;
    const updated = await prisma.approvalComment.update({
      where: { id: cid },
      data: { content },
      include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

const removeComment = async (req, res, next) => {
  try {
    const cid = Number(req.params.cid);
    const comment = await prisma.approvalComment.findUnique({ where: { id: cid } });
    if (!comment) return res.status(404).json({ error: '의견을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && comment.userId !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    await prisma.approvalComment.delete({ where: { id: cid } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/resubmit — 재기안 (rejected/cancelled → draft)
const resubmit = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id) return res.status(403).json({ error: '재기안 권한이 없습니다.' });
    if (!['rejected', 'cancelled'].includes(doc.status)) {
      return res.status(400).json({ error: '반려 또는 취소된 문서만 재기안할 수 있습니다.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.approvalStep.updateMany({
        where: { documentId: id },
        data: {
          status: 'pending', comment: null, actionAt: null,
          approverNameSnap: null, approverTitleSnap: null,
          signImagePath: null, signedIp: null, actingType: null,
        },
      });
      await tx.approvalDocument.update({
        where: { id },
        data: { status: 'draft', currentStep: 0, rejectedStep: null, rejectReasonCategory: null },
      });
    });

    res.json({ message: '재기안되었습니다. 내용을 수정 후 다시 상신하세요.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/resume — 반려 지점부터 재상신 (부분 반려 재개)
// 반려된 그룹 이전의 승인은 유지하고, 반려 그룹부터 다시 결재를 진행한다.
const resume = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, creator: true },
    });
    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });
    if (doc.createdBy !== req.user.id) return res.status(403).json({ error: '재상신 권한이 없습니다.' });
    if (doc.status !== 'rejected') return res.status(400).json({ error: '반려된 문서만 재상신할 수 있습니다.' });
    if (!doc.rejectedStep) return res.status(400).json({ error: '재상신 지점을 찾을 수 없습니다. 처음부터 재기안하세요.' });

    const resumeGroup = doc.rejectedStep;

    await prisma.$transaction(async (tx) => {
      // 반려 그룹 이후(>=)의 단계만 초기화, 그 이전 승인은 보존
      await tx.approvalStep.updateMany({
        where: { documentId: id, stepOrder: { gte: resumeGroup } },
        data: {
          status: 'pending', comment: null, actionAt: null,
          approverNameSnap: null, approverTitleSnap: null,
          signImagePath: null, signedIp: null, actingType: null,
        },
      });
      await tx.approvalDocument.update({
        where: { id },
        data: { status: 'pending', currentStep: resumeGroup, rejectedStep: null, rejectReasonCategory: null },
      });
    });

    // 재개 그룹 결재자에게 알림 — 휴가 중이면 자동위임 먼저 적용
    const groupSteps = await applyAutoDelegation(
      id, doc.steps.filter(s => s.stepOrder === resumeGroup && s.type !== 'reference'), doc.title,
    );
    await Promise.all(groupSteps.map(s => sendApprovalNotification(
      s.approverId, 'approval_requested', id,
      `${doc.creator.displayName}님이 결재를 재요청했습니다.`, req.user.id,
    )));

    res.json({ message: `${resumeGroup}차부터 재상신되었습니다.` });
  } catch (err) {
    next(err);
  }
};

// GET /api/approvals/pending-count — 내가 결재해야 할 문서 수
const pendingCount = async (req, res, next) => {
  try {
    // 참조는 제외하고, "현재 그룹이 내 차례"인 문서만 정확히 집계 (병렬/순차 대응)
    const docs = await prisma.approvalDocument.findMany({
      where: {
        delYn: '0',
        status: 'pending',
        steps: { some: myPendingStepWhere(req.user.id) },
      },
      select: {
        currentStep: true,
        steps: { where: myPendingStepWhere(req.user.id), select: { stepOrder: true } },
      },
    });
    const count = docs.filter(d => isMyTurnNow(d, d.steps)).length;
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

// GET /api/approvals/stats (admin only) — 양식별 처리 현황 + 결재자별 응답 현황
// 소규모 팀(2~10인) 규모 전제로 DB 집계 대신 전량 로드 후 JS에서 계산한다(건수가 많지 않아
// 성능 문제 없음 — 데이터가 크게 늘면 그때 SQL GROUP BY로 전환).
// GET /api/approvals/reject-categories — 반려 사유 분류 선택지(프론트와 단일 진실 원천 공유)
const getRejectCategories = (req, res) => {
  res.json([...REJECT_CATEGORIES]);
};

const stats = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { delYn: '0' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }
    const docs = await prisma.approvalDocument.findMany({
      where,
      select: {
        id: true, status: true, createdAt: true, updatedAt: true, dueDate: true, rejectReasonCategory: true,
        template: { select: { id: true, name: true, formType: { select: { name: true } } } },
        steps: { where: { type: { not: 'reference' } }, select: { approverId: true, status: true, actionAt: true, createdAt: true } },
      },
    });

    const now = new Date();
    const byTemplate = {};
    const byApprover = {};
    const byRejectCategory = {};

    for (const d of docs) {
      const tKey = d.template?.id ?? 0;
      if (!byTemplate[tKey]) {
        byTemplate[tKey] = {
          templateId: d.template?.id ?? null,
          templateName: d.template?.name || '(삭제된 양식)',
          formTypeName: d.template?.formType?.name || '-',
          total: 0, approved: 0, rejected: 0, pending: 0, overdue: 0,
          turnaroundSumHours: 0, turnaroundCount: 0,
        };
      }
      const t = byTemplate[tKey];
      t.total++;
      if (d.status === 'approved') {
        t.approved++;
        t.turnaroundSumHours += (new Date(d.updatedAt) - new Date(d.createdAt)) / 3600000;
        t.turnaroundCount++;
      } else if (d.status === 'rejected') {
        t.rejected++;
        const cat = d.rejectReasonCategory || '미분류';
        byRejectCategory[cat] = (byRejectCategory[cat] || 0) + 1;
      }
      else if (d.status === 'pending') {
        t.pending++;
        if (d.dueDate && new Date(d.dueDate) < now) t.overdue++;
      }

      for (const s of d.steps) {
        if (!byApprover[s.approverId]) {
          byApprover[s.approverId] = {
            userId: s.approverId, pendingNow: 0, approvedCount: 0, rejectedCount: 0,
            responseSumHours: 0, responseCount: 0,
          };
        }
        const a = byApprover[s.approverId];
        if (s.status === 'pending') a.pendingNow++;
        else if (s.status === 'approved') {
          a.approvedCount++;
          a.responseSumHours += (new Date(s.actionAt) - new Date(s.createdAt)) / 3600000;
          a.responseCount++;
        } else if (s.status === 'rejected') a.rejectedCount++;
      }
    }

    const approverIds = Object.keys(byApprover).map(Number);
    const users = approverIds.length
      ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, displayName: true } })
      : [];
    const nameById = Object.fromEntries(users.map(u => [u.id, u.displayName]));

    res.json({
      byTemplate: Object.values(byTemplate).map(t => ({
        ...t,
        avgTurnaroundHours: t.turnaroundCount ? Math.round((t.turnaroundSumHours / t.turnaroundCount) * 10) / 10 : null,
      })),
      byApprover: Object.values(byApprover).map(a => ({
        ...a,
        displayName: nameById[a.userId] || `사용자 ${a.userId}`,
        avgResponseHours: a.responseCount ? Math.round((a.responseSumHours / a.responseCount) * 10) / 10 : null,
      })),
      byRejectCategory: Object.entries(byRejectCategory).map(([category, count]) => ({ category, count })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list, tree, get, create, update, submit, approve, reject, cancel, delegate, resubmit, resume, remove, pendingCount,
  stats, getRejectCategories,
  addStep, removeStep,
  uploadAttachment, downloadAttachment, removeAttachment,
  listComments, createComment, updateComment, removeComment,
};
