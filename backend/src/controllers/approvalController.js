const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { pushNotification } = require('../services/sseService');
const { resolvePresetLine } = require('../services/approvalLine');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/approval');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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

// 진행 대상(참조 제외) 그룹 수 = 최대 stepOrder
function countFlowGroups(steps) {
  const orders = steps.filter(s => s.type !== 'reference').map(s => s.stepOrder);
  return orders.length ? Math.max(...orders) : 0;
}

// 알림 발송 헬퍼
async function sendApprovalNotification(userId, type, documentId, message, actorId = null) {
  try {
    const notif = await prisma.notification.create({
      data: { userId, type, actorId, link: `/approvals/${documentId}`, message },
    });
    pushNotification(userId, notif);
  } catch (e) {
    console.error('결재 알림 발송 실패:', e.message);
  }
}

// GET /api/approvals  (query: tab=mine|pending|all, status, page, limit)
const list = async (req, res, next) => {
  try {
    const { tab = 'mine', status, page = 1, limit = 20, q, formTypeId, from, to } = req.query;
    const userId = req.user.id;

    let where = { delYn: '0' };
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
    // 양식종류 필터
    if (formTypeId) where.template = { formTypeId: Number(formTypeId) };
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
    } else if (tab === 'all' && req.user.role === 'admin') {
      // admin 전체 목록 - 필터 없음
    } else {
      where.createdBy = userId;
    }

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
          include: { uploader: { select: { id: true, displayName: true } } },
        },
        comments: {
          include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!doc) return res.status(404).json({ error: '결재 문서를 찾을 수 없습니다.' });

    // 접근 권한: 작성자 or 결재자 or admin
    const isApprover = doc.steps.some(s => s.approverId === req.user.id);
    if (req.user.role !== 'admin' && doc.createdBy !== req.user.id && !isApprover) {
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
    const { templateId, title, formData, steps, isUrgent, dueDate } = req.body;
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

    const { title, formData, steps, isUrgent, dueDate } = req.body;

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
      include: { steps: { orderBy: { stepOrder: 'asc' } }, creator: true, template: { select: { code: true, lineJson: true } } },
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
        data: { status: 'pending', currentStep: firstGroup, docNo, totalSteps: countFlowGroups(flowSteps) },
      });
    });

    // 첫 그룹 결재자 전원에게 알림 (병렬이면 여러 명)
    const firstGroupSteps = flowSteps.filter(s => s.stepOrder === firstGroup);
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
      include: { steps: { orderBy: { stepOrder: 'asc' } }, creator: true },
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

    // 현재 그룹의 진행 대상(승인/합의/전결) 중 나 외 잔여 미처리 여부
    const groupSteps = doc.steps.filter(s => s.stepOrder === doc.currentStep && s.type !== 'reference');
    const othersPending = groupSteps.some(s => s.id !== myStep.id && s.status === 'pending');
    // 다음 그룹(참조 제외, 현재보다 큰 최소 stepOrder)
    const nextOrders = doc.steps.filter(s => s.type !== 'reference' && s.stepOrder > doc.currentStep).map(s => s.stepOrder);
    const nextGroup = nextOrders.length ? Math.min(...nextOrders) : null;

    let outcome = 'waiting'; // waiting | advanced | finalApproved

    await prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: myStep.id },
        data: {
          status: 'approved', comment: comment ?? null, actionAt: new Date(),
          approverNameSnap: approver?.displayName ?? null,
          approverTitleSnap: approver?.position || approver?.jobGrade || null,
          signImagePath: approver?.sealImagePath || approver?.signImagePath || null,
          signedIp: req.ip ?? null,
          actingType: isDelegation ? '전결' : '본인',
        },
      });

      if (isDelegation) {
        // 전결: 이후 잔여 결재 단계를 건너뛰고 최종 승인 확정
        await tx.approvalStep.updateMany({
          where: { documentId: id, status: 'pending', type: { not: 'reference' }, stepOrder: { gt: doc.currentStep } },
          data: { status: 'skipped' },
        });
        await tx.approvalDocument.update({ where: { id }, data: { status: 'approved' } });
        outcome = 'finalApproved';
      } else if (othersPending) {
        // 병렬: 같은 그룹의 다른 결재자를 기다림
        outcome = 'waiting';
      } else if (nextGroup === null) {
        await tx.approvalDocument.update({ where: { id }, data: { status: 'approved' } });
        outcome = 'finalApproved';
      } else {
        await tx.approvalDocument.update({ where: { id }, data: { currentStep: nextGroup } });
        outcome = 'advanced';
      }
    });

    if (outcome === 'finalApproved') {
      await sendApprovalNotification(
        doc.createdBy, 'approval_approved', id,
        `결재 문서 "${doc.title}"이(가) 최종 승인되었습니다.`, req.user.id,
      );
    } else if (outcome === 'advanced') {
      const nextGroupSteps = doc.steps.filter(s => s.stepOrder === nextGroup && s.type !== 'reference');
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
const reject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { comment } = req.body;

    const doc = await prisma.approvalDocument.findFirst({
      where: { id, delYn: '0' },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, creator: true },
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

    await prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: myStep.id },
        data: {
          status: 'rejected', comment: comment ?? null, actionAt: new Date(),
          approverNameSnap: approver?.displayName ?? null,
          approverTitleSnap: approver?.position || approver?.jobGrade || null,
          signedIp: req.ip ?? null, actingType: '본인',
        },
      });
      // rejectedStep 기록 — 부분 반려 재상신(Phase 3)에서 이 지점부터 재개한다.
      await tx.approvalDocument.update({ where: { id }, data: { status: 'rejected', rejectedStep: doc.currentStep } });
    });

    await sendApprovalNotification(
      doc.createdBy, 'approval_rejected', id,
      `결재 문서 "${doc.title}"이(가) 반려되었습니다.`,
      req.user.id
    );

    res.json({ message: '반려되었습니다.' });
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

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const attachment = await prisma.approvalAttachment.create({
      data: {
        documentId,
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
    });
    if (!attachment) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

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
      include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    next(err);
  }
};

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
        data: { status: 'draft', currentStep: 0, rejectedStep: null },
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
        data: { status: 'pending', currentStep: resumeGroup, rejectedStep: null },
      });
    });

    // 재개 그룹 결재자에게 알림
    const groupSteps = doc.steps.filter(s => s.stepOrder === resumeGroup && s.type !== 'reference');
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
        steps: { some: { approverId: req.user.id, status: 'pending', type: { not: 'reference' } } },
      },
      select: {
        currentStep: true,
        steps: {
          where: { approverId: req.user.id, status: 'pending', type: { not: 'reference' } },
          select: { stepOrder: true },
        },
      },
    });
    const count = docs.filter(d => d.steps.some(s => s.stepOrder === d.currentStep)).length;
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list, get, create, update, submit, approve, reject, cancel, resubmit, resume, remove, pendingCount,
  uploadAttachment, downloadAttachment, removeAttachment,
  listComments, createComment, updateComment, removeComment,
};
