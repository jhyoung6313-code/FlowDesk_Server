/**
 * approvalController 단위 테스트 (F-52 전자결재)
 * Prisma를 mock 처리하여 DB 없이 순차/병렬/전결/재상신 흐름을 검증한다.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    approvalDocument: {
      findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
      count: jest.fn(), create: jest.fn(), update: jest.fn(),
    },
    approvalTemplate: { findUnique: jest.fn() },
    approvalStep: {
      update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), deleteMany: jest.fn(), createMany: jest.fn(),
      create: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
    },
    approvalDocSeq: { upsert: jest.fn() },
    approvalAttachment: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    approvalComment: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    approvalFormType: { findUnique: jest.fn() },
    approvalDocumentHistory: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    scheduleEventAssignee: { findFirst: jest.fn().mockResolvedValue(null) },
    appSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  // $transaction: 콜백을 mock prisma(tx=m)로 즉시 실행
  m.$transaction = jest.fn(async (cb) => (typeof cb === 'function' ? cb(m) : Promise.all(cb)));
  // approve()/reject()가 동시성 레이스 방지를 위해 거는 행 잠금(SELECT ... FOR UPDATE) — 테스트에선 no-op
  m.$queryRaw = jest.fn().mockResolvedValue([]);
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/sseService', () => ({ pushNotification: jest.fn() }));
jest.mock('../src/services/approvalLine', () => ({
  resolvePresetLine: jest.fn().mockResolvedValue({ steps: [], unresolved: [] }),
}));
jest.mock('../src/services/emailService', () => ({
  sendGenericEmail: jest.fn().mockResolvedValue(false),
  sendApprovalStyledEmail: jest.fn().mockResolvedValue(false),
}));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/approvalController');
const { sendApprovalStyledEmail } = require('../src/services/emailService');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; req.ip = '127.0.0.1'; next(); });
  a.get('/approvals', ctrl.list);
  a.get('/approvals/pending-count', ctrl.pendingCount);
  a.get('/approvals/stats', ctrl.stats);
  a.get('/approvals/reject-categories', ctrl.getRejectCategories);
  a.get('/approvals/:id', ctrl.get);
  a.post('/approvals', ctrl.create);
  a.post('/approvals/:id/submit', ctrl.submit);
  a.post('/approvals/:id/approve', ctrl.approve);
  a.post('/approvals/:id/reject', ctrl.reject);
  a.post('/approvals/:id/cancel', ctrl.cancel);
  a.post('/approvals/:id/delegate', ctrl.delegate);
  a.post('/approvals/:id/resume', ctrl.resume);
  a.post('/approvals/:id/resubmit', ctrl.resubmit);
  a.post('/approvals/:id/steps', ctrl.addStep);
  a.delete('/approvals/:id/steps/:stepId', ctrl.removeStep);
  a.get('/approvals/:id/attachments/:aid/download', ctrl.downloadAttachment);
  a.post('/approvals/:id/attachments', (req, res, next) => {
    req.file = { originalname: 'test.png', filename: 'stored.png', mimetype: 'image/png', size: 123 };
    next();
  }, ctrl.uploadAttachment);
  a.get('/approvals/:id/comments', ctrl.listComments);
  a.post('/approvals/:id/comments', ctrl.createComment);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.notification.create.mockResolvedValue({ id: 1 });
  prisma.$transaction.mockImplementation(async (cb) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb)));
});

describe('POST /approvals (임시저장)', () => {
  test('템플릿/제목 누락 → 400', async () => {
    const res = await request(app()).post('/approvals').send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('비활성 템플릿 → 404', async () => {
    prisma.approvalTemplate.findUnique.mockResolvedValue({ id: 1, isActive: false });
    const res = await request(app()).post('/approvals').send({ templateId: 1, title: '휴가' });
    expect(res.status).toBe(404);
  });

  test('정상 → 201, totalSteps는 참조 제외 그룹 수', async () => {
    prisma.approvalTemplate.findUnique.mockResolvedValue({ id: 1, isActive: true });
    prisma.approvalDocument.create.mockImplementation(async ({ data }) => ({ id: 5, ...data }));
    const res = await request(app()).post('/approvals').send({
      templateId: 1, title: '휴가',
      steps: [
        { approverId: 2, type: 'approval', stepOrder: 1 },
        { approverId: 3, type: 'agreement', stepOrder: 2 },
        { approverId: 4, type: 'reference' },
      ],
    });
    expect(res.status).toBe(201);
    const created = prisma.approvalDocument.create.mock.calls[0][0].data;
    expect(created.status).toBe('draft');
    expect(created.totalSteps).toBe(2); // reference 제외
  });
});

describe('POST /approvals/:id/submit (상신)', () => {
  test('결재자 없이 상신 → 400', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, createdBy: 10, status: 'draft',
      steps: [{ approverId: 4, type: 'reference', stepOrder: 0 }],
      creator: { displayName: '나' }, template: { code: 'VAC' },
    });
    const res = await request(app()).post('/approvals/5/submit').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1명 이상/);
  });

  test('작성자 아님 → 403', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, createdBy: 99, status: 'draft', steps: [], creator: {}, template: {} });
    const res = await request(app()).post('/approvals/5/submit').send({});
    expect(res.status).toBe(403);
  });

  test('정상 상신 → pending + 첫 그룹으로 currentStep 세팅 + 문서번호 채번', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, createdBy: 10, status: 'draft',
      steps: [
        { approverId: 2, type: 'approval', stepOrder: 1, status: 'pending' },
        { approverId: 3, type: 'approval', stepOrder: 2, status: 'pending' },
      ],
      creator: { displayName: '나' }, template: { code: 'VAC', lineJson: null, formTypeId: null }, formData: '{}',
    });
    prisma.approvalDocSeq.upsert.mockResolvedValue({ seq: 7 });
    prisma.approvalDocument.update.mockResolvedValue({});
    // submit()이 트랜잭션 커밋 후 첫 그룹 스텝을 DB에서 다시 읽어온다(toInject로 추가된
    // 조건부 스텝은 createMany가 id를 돌려주지 않아, 메모리 객체 대신 항상 이 재조회 결과를
    // applyAutoDelegation에 넘긴다 — 아래 "휴가 자동위임" 테스트의 조건부 주입 케이스 참고).
    prisma.approvalStep.findMany.mockResolvedValue([{ id: 201, approverId: 2, type: 'approval', stepOrder: 1 }]);
    const res = await request(app()).post('/approvals/5/submit').send({});
    expect(res.status).toBe(200);
    const upd = prisma.approvalDocument.update.mock.calls.find(c => c[0].data.status === 'pending');
    expect(upd[0].data.status).toBe('pending');
    expect(upd[0].data.currentStep).toBe(1);
    expect(upd[0].data.docNo).toBe('VAC-' + new Date().getFullYear() + '-0007');
    // 첫 그룹(stepOrder=1) 결재자에게만 알림
    const notifTargets = prisma.notification.create.mock.calls.map(c => c[0].data.userId);
    expect(notifTargets).toContain(2);
    expect(notifTargets).not.toContain(3);
  });

  test("결재 요청 알림 — 이메일 수신거부(opt-out) 사용자에게는 이메일을 보내지 않음(인앱 알림은 그대로 감)", async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, createdBy: 10, status: 'draft',
      steps: [{ approverId: 2, type: 'approval', stepOrder: 1, status: 'pending' }],
      creator: { displayName: '나' }, template: { code: 'VAC', lineJson: null, formTypeId: null }, formData: '{}',
    });
    prisma.approvalDocSeq.upsert.mockResolvedValue({ seq: 1 });
    prisma.approvalDocument.update.mockResolvedValue({});
    prisma.approvalStep.findMany.mockResolvedValue([{ id: 202, approverId: 2, type: 'approval', stepOrder: 1 }]);
    prisma.appSetting.findUnique.mockResolvedValueOnce({ value: 'true' }); // approverId=2가 이메일 수신거부
    prisma.user.findUnique.mockResolvedValue({ username: 'approver2', displayName: '결재자2' });

    const res = await request(app()).post('/approvals/5/submit').send({});
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r)); // sendApprovalNotification 내부 비동기 이메일 분기 대기
    expect(sendApprovalStyledEmail).not.toHaveBeenCalled();
    // 인앱 알림(Notification.create)은 opt-out과 무관하게 정상 발송
    expect(prisma.notification.create.mock.calls.some(c => c[0].data.userId === 2)).toBe(true);
  });

  test('상신 시점의 템플릿 fieldsJson을 fieldsJsonSnap으로 고정 저장', async () => {
    const fieldsJson = JSON.stringify([{ id: 'content', type: 'textarea', label: '내용' }]);
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, createdBy: 10, status: 'draft',
      steps: [{ approverId: 2, type: 'approval', stepOrder: 1, status: 'pending' }],
      creator: { displayName: '나' }, template: { code: 'VAC', lineJson: null, formTypeId: null, fieldsJson }, formData: '{}',
    });
    prisma.approvalDocSeq.upsert.mockResolvedValue({ seq: 1 });
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app()).post('/approvals/5/submit').send({});
    expect(res.status).toBe(200);
    const upd = prisma.approvalDocument.update.mock.calls.find(c => c[0].data.status === 'pending');
    expect(upd[0].data.fieldsJsonSnap).toBe(fieldsJson);
  });

  test('첫 결재자가 휴가 중 + 자동위임 등록 → 위임 대상에게 알림, 원 결재자 approverId 교체', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, createdBy: 10, status: 'draft',
      steps: [{ id: 101, approverId: 2, type: 'approval', stepOrder: 1, status: 'pending' }],
      creator: { displayName: '나' }, template: { code: 'VAC', lineJson: null, formTypeId: null, fieldsJson: null }, formData: '{}',
    });
    prisma.approvalDocSeq.upsert.mockResolvedValue({ seq: 1 });
    prisma.approvalDocument.update.mockResolvedValue({});
    // approverId=2가 오늘 휴가 중
    prisma.scheduleEventAssignee.findFirst.mockResolvedValueOnce({ userId: 2, eventId: 1 });
    // approverId=2의 자동위임 대상 = userId 3
    prisma.appSetting.findUnique.mockResolvedValueOnce({ value: JSON.stringify({ toUserId: 3 }) });
    prisma.user.findFirst.mockResolvedValueOnce({ id: 3, isActive: true, displayName: '대리인' });
    prisma.approvalStep.findMany.mockResolvedValue([{ id: 101, approverId: 2, type: 'approval' }]);
    prisma.approvalStep.update.mockResolvedValue({});

    const res = await request(app()).post('/approvals/5/submit').send({});
    expect(res.status).toBe(200);
    // 원 단계의 approverId가 위임 대상(3)으로 교체됨
    expect(prisma.approvalStep.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { approverId: 3, actingType: '휴가 자동위임' } });
    // 알림은 교체된 대상(3)에게 가고, 원 결재자(2)에게는 "자동 위임되었습니다" 안내만 감
    const notifTargets = prisma.notification.create.mock.calls.map(c => c[0].data.userId);
    expect(notifTargets).toContain(3);
    expect(notifTargets).toContain(2);
    const toOriginal = prisma.notification.create.mock.calls.find(c => c[0].data.userId === 2);
    expect(toOriginal[0].data.message).toMatch(/자동 위임/);
  });
});

describe('POST /approvals/:id/approve (승인)', () => {
  test('내 차례 아님 → 403', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      steps: [{ id: 1, approverId: 99, type: 'approval', stepOrder: 1, status: 'pending' }],
      creator: { displayName: 'x' },
    });
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(403);
  });

  test("위임/자동위임으로 재배정된 단계를 승인해도 actingType 마커('위임'/'휴가 자동위임')가 '본인'으로 덮어써지지 않음", async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      steps: [{ id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending', actingType: '휴가 자동위임' }],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '대리인' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(200);
    expect(prisma.approvalStep.updateMany.mock.calls[0][0].data.actingType).toBe('휴가 자동위임');
  });

  test('일반 승인(위임 이력 없음)은 그대로 본인으로 기록', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      steps: [{ id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending', actingType: null }],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '본인' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(200);
    expect(prisma.approvalStep.updateMany.mock.calls[0][0].data.actingType).toBe('본인');
  });

  test('순차 승인 → 다음 그룹으로 진행(advanced)', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 20, type: 'approval', stepOrder: 2, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자', position: '팀장' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({ comment: 'ok' });
    expect(res.status).toBe(200);
    const docUpd = prisma.approvalDocument.update.mock.calls[0][0];
    expect(docUpd.data.currentStep).toBe(2);
  });

  test('병렬 그룹: 다른 결재자 미처리면 대기(waiting), 문서상태 변경 없음', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 11, type: 'approval', stepOrder: 1, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자' });
    prisma.approvalStep.update.mockResolvedValue({});
    // 트랜잭션 내부에서 다시 조회하는 "최신 그룹 현황" — 동료(id:2)가 아직 pending임을 반영
    prisma.approvalStep.findMany.mockResolvedValue([{ id: 1, status: 'approved' }, { id: 2, status: 'pending' }]);
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(200);
    // 문서 자체(status/currentStep) 업데이트는 호출되지 않아야 함
    expect(prisma.approvalDocument.update).not.toHaveBeenCalled();
  });

  test("병렬 그룹: groupPolicy='any'면 1인 승인만으로 즉시 완료(동료는 skip)", async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      groupPolicyJson: JSON.stringify({ 1: { mode: 'any' } }),
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 11, type: 'approval', stepOrder: 1, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalStep.updateMany.mockResolvedValue({});
    prisma.approvalStep.findMany.mockResolvedValue([{ id: 1, status: 'approved' }, { id: 2, status: 'pending' }]);
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(200);
    // 동료(approverId 11)의 남은 pending 단계가 skip 처리되어야 함
    expect(prisma.approvalStep.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ documentId: 5, stepOrder: 1 }),
      data: { status: 'skipped' },
    }));
    expect(prisma.approvalDocument.update.mock.calls[0][0].data.status).toBe('approved');
  });

  test("병렬 그룹: groupPolicy='quorum' n=2 — 2번째 승인에서 완료, 1번째는 대기", async () => {
    const baseDoc = {
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      groupPolicyJson: JSON.stringify({ 1: { mode: 'quorum', n: 2 } }),
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 11, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 3, approverId: 12, type: 'approval', stepOrder: 1, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    };
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalStep.updateMany.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});

    // 1번째 승인(10번) — 정족수(2) 미달이므로 대기. 트랜잭션 내부 재조회 결과: 내 승인 1건 + 2명 대기.
    prisma.approvalDocument.findFirst.mockResolvedValueOnce(baseDoc);
    prisma.approvalStep.findMany.mockResolvedValueOnce([
      { id: 1, status: 'approved' }, { id: 2, status: 'pending' }, { id: 3, status: 'pending' },
    ]);
    const res1 = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res1.status).toBe(200);
    expect(prisma.approvalDocument.update).not.toHaveBeenCalled();

    // 2번째 승인(11번) — 정족수 충족, 남은 1명(12번)은 skip. 재조회 결과: 2건 승인 + 1명 대기.
    prisma.approvalDocument.findFirst.mockResolvedValueOnce({
      ...baseDoc,
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'approved' },
        { id: 2, approverId: 11, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 3, approverId: 12, type: 'approval', stepOrder: 1, status: 'pending' },
      ],
    });
    prisma.approvalStep.findMany.mockResolvedValueOnce([
      { id: 1, status: 'approved' }, { id: 2, status: 'approved' }, { id: 3, status: 'pending' },
    ]);
    const res2 = await request(app('member', 11)).post('/approvals/5/approve').send({});
    expect(res2.status).toBe(200);
    expect(prisma.approvalStep.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'skipped' },
    }));
  });

  test('마지막 그룹 승인 → 최종 승인(approved) + 기안자 알림', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 2, createdBy: 77, title: '휴가',
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'approved' },
        { id: 2, approverId: 10, type: 'approval', stepOrder: 2, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(200);
    expect(prisma.approvalDocument.update.mock.calls[0][0].data.status).toBe('approved');
    const notif = prisma.notification.create.mock.calls[0][0].data;
    expect(notif.userId).toBe(77);
    expect(notif.type).toBe('approval_approved');
  });

  test('전결(delegation) → 잔여 단계 skip + 즉시 최종 승인', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 77, title: '휴가',
      steps: [
        { id: 1, approverId: 10, type: 'delegation', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 20, type: 'approval', stepOrder: 2, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '임원' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalStep.updateMany.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/전결/);
    expect(prisma.approvalStep.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'skipped' },
    }));
    expect(prisma.approvalDocument.update.mock.calls[0][0].data.status).toBe('approved');
  });
});

describe('POST /approvals/:id/reject (반려)', () => {
  test("병렬 그룹 groupPolicy='any' — 1명 반려해도 다른 1명이 아직 pending이면 문서는 반려 확정 안 됨(대기)", async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      groupPolicyJson: JSON.stringify({ 1: { mode: 'any' } }),
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 11, type: 'approval', stepOrder: 1, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자' });
    // 트랜잭션 내부 재조회: 내 반려 1건 + 동료(id:2) 아직 pending → 'any' 정책상 아직 승인 가능성이 남음
    prisma.approvalStep.findMany.mockResolvedValue([{ id: 1, status: 'rejected' }, { id: 2, status: 'pending' }]);
    const res = await request(app('member', 10)).post('/approvals/5/reject').send({ comment: '보류' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/기다립니다/);
    // 'any' 그룹에서 1명 반려만으로는 문서 전체가 반려 확정되지 않아야 함
    expect(prisma.approvalDocument.update).not.toHaveBeenCalled();
  });

  test("병렬 그룹 groupPolicy='any' — 마지막 남은 1명까지 반려하면 문서 반려 확정", async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1, title: '출장',
      groupPolicyJson: JSON.stringify({ 1: { mode: 'any' } }),
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'rejected' },
        { id: 2, approverId: 11, type: 'approval', stepOrder: 1, status: 'pending' },
      ],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자2' });
    // 재조회: 둘 다 반려 — 더 이상 승인 가능성이 없으므로 문서 반려 확정
    prisma.approvalStep.findMany.mockResolvedValue([{ id: 1, status: 'rejected' }, { id: 2, status: 'rejected' }]);
    const res = await request(app('member', 11)).post('/approvals/5/reject').send({ comment: '불가' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('반려되었습니다.');
    expect(prisma.approvalDocument.update.mock.calls[0][0].data.status).toBe('rejected');
  });

  test("위임으로 재배정된 단계가 반려해도 actingType '위임' 마커 보존", async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 77, title: '휴가',
      steps: [{ id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending', actingType: '위임' }],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '대리인' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/reject').send({ comment: '반려' });
    expect(res.status).toBe(200);
    expect(prisma.approvalStep.updateMany.mock.calls[0][0].data.actingType).toBe('위임');
  });

  test('반려 시 rejectedStep에 현재 그룹 기록', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 2, createdBy: 77, title: '휴가',
      steps: [{ id: 2, approverId: 10, type: 'approval', stepOrder: 2, status: 'pending' }],
      creator: { displayName: 'x' },
    });
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/reject').send({ comment: '보완' });
    expect(res.status).toBe(200);
    const upd = prisma.approvalDocument.update.mock.calls[0][0].data;
    expect(upd.status).toBe('rejected');
    expect(upd.rejectedStep).toBe(2);
    expect(upd.rejectReasonCategory).toBe(null);
  });

  test('반려 사유 카테고리 — 유효한 값은 저장, 목록에 없는 값은 null로 무시', async () => {
    const baseDoc = {
      id: 5, status: 'pending', currentStep: 2, createdBy: 77, title: '휴가',
      steps: [{ id: 2, approverId: 10, type: 'approval', stepOrder: 2, status: 'pending' }],
      creator: { displayName: 'x' },
    };
    prisma.user.findUnique.mockResolvedValue({ displayName: '결재자' });
    prisma.approvalStep.update.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});

    prisma.approvalDocument.findFirst.mockResolvedValueOnce(baseDoc);
    await request(app('member', 10)).post('/approvals/5/reject').send({ comment: '단가 확인 필요', category: '단가초과' });
    expect(prisma.approvalDocument.update.mock.calls[0][0].data.rejectReasonCategory).toBe('단가초과');

    prisma.approvalDocument.findFirst.mockResolvedValueOnce(baseDoc);
    await request(app('member', 10)).post('/approvals/5/reject').send({ comment: '기타', category: '없는카테고리' });
    expect(prisma.approvalDocument.update.mock.calls[1][0].data.rejectReasonCategory).toBe(null);
  });
});

describe('POST /approvals/:id/resume (부분 재상신)', () => {
  test('반려 아님 → 400', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, status: 'pending', createdBy: 10, steps: [], creator: {} });
    const res = await request(app('member', 10)).post('/approvals/5/resume').send({});
    expect(res.status).toBe(400);
  });

  test('rejectedStep 없으면 → 400', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, status: 'rejected', createdBy: 10, rejectedStep: null, steps: [], creator: {} });
    const res = await request(app('member', 10)).post('/approvals/5/resume').send({});
    expect(res.status).toBe(400);
  });

  test('반려 지점부터 재개 → 해당 그룹 이상만 초기화', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'rejected', createdBy: 10, rejectedStep: 2,
      steps: [
        { id: 1, approverId: 2, type: 'approval', stepOrder: 1, status: 'approved' },
        { id: 2, approverId: 3, type: 'approval', stepOrder: 2, status: 'rejected' },
      ],
      creator: { displayName: '나' },
    });
    prisma.approvalStep.updateMany.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/approvals/5/resume').send({});
    expect(res.status).toBe(200);
    expect(prisma.approvalStep.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { documentId: 5, stepOrder: { gte: 2 } },
    }));
    expect(prisma.approvalDocument.update.mock.calls[0][0].data.currentStep).toBe(2);
  });
});

describe('POST /approvals/:id/delegate (위임/대결)', () => {
  test('본인에게 위임 → 400', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1,
      steps: [{ id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' }],
    });
    const res = await request(app('member', 10)).post('/approvals/5/delegate').send({ toUserId: 10 });
    expect(res.status).toBe(400);
  });

  test('이미 결재선에 있는 사용자 → 400', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1,
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 20, type: 'approval', stepOrder: 2, status: 'pending' },
      ],
    });
    prisma.user.findFirst.mockResolvedValue({ id: 20, isActive: true });
    const res = await request(app('member', 10)).post('/approvals/5/delegate').send({ toUserId: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/이미 결재선/);
  });
});

describe('POST /approvals/:id/steps (상신 후 결재자/참조자 추가)', () => {
  const pendingDoc = (overrides = {}) => ({
    id: 5, status: 'pending', currentStep: 1, createdBy: 1,
    steps: [{ id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' }],
    ...overrides,
  });

  test('기안자/관리자 아니면 → 403', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue(pendingDoc());
    const res = await request(app('member', 99)).post('/approvals/5/steps').send({ approverId: 20, type: 'reference' });
    expect(res.status).toBe(403);
  });

  test('현재/과거 차수에 승인자 추가 시도 → 400', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue(pendingDoc());
    prisma.user.findFirst.mockResolvedValue({ id: 20, isActive: true });
    const res = await request(app('member', 1)).post('/approvals/5/steps').send({ approverId: 20, type: 'approval', stepOrder: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/이후 차수/);
  });

  test('미래 차수에 승인자 추가 → 201 + totalSteps 재계산 + 변경이력 기록', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue(pendingDoc());
    prisma.user.findFirst.mockResolvedValue({ id: 20, isActive: true, displayName: '김결재' });
    prisma.approvalStep.create.mockResolvedValue({ id: 2, documentId: 5, approverId: 20, type: 'approval', stepOrder: 3 });
    prisma.user.findUnique.mockResolvedValue({ displayName: '기안자' });
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 1)).post('/approvals/5/steps').send({ approverId: 20, type: 'approval', stepOrder: 3 });
    expect(res.status).toBe(201);
    expect(prisma.approvalDocument.update.mock.calls[0][0].data.totalSteps).toBe(2); // 기존 1차 + 새 3차
    expect(prisma.approvalDocumentHistory.create).toHaveBeenCalledWith({
      data: { documentId: 5, userId: 1, action: 'step_added', field: '김결재', newValue: JSON.stringify({ type: 'approval', stepOrder: 3 }) },
    });
  });

  test('참조 추가는 진행 단계와 무관하게 언제나 허용', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue(pendingDoc());
    prisma.user.findFirst.mockResolvedValue({ id: 30, isActive: true });
    prisma.approvalStep.create.mockResolvedValue({ id: 3, documentId: 5, approverId: 30, type: 'reference', stepOrder: 0 });
    prisma.user.findUnique.mockResolvedValue({ displayName: '기안자' });
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 1)).post('/approvals/5/steps').send({ approverId: 30, type: 'reference' });
    expect(res.status).toBe(201);
  });
});

describe('DELETE /approvals/:id/steps/:stepId (추가했던 단계 제거)', () => {
  test('현재 진행 중인 차수는 제거 불가 → 400', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      steps: [{ id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' }],
    });
    const res = await request(app('member', 1)).delete('/approvals/5/steps/1');
    expect(res.status).toBe(400);
  });

  test('미래 차수의 미처리 단계는 제거 가능 → 200 + 변경이력 기록', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 20, type: 'approval', stepOrder: 3, status: 'pending' },
      ],
    });
    prisma.approvalStep.delete.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ displayName: '이결재' });
    const res = await request(app('member', 1)).delete('/approvals/5/steps/2');
    expect(res.status).toBe(200);
    expect(prisma.approvalStep.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(prisma.approvalDocumentHistory.create).toHaveBeenCalledWith({
      data: { documentId: 5, userId: 1, action: 'step_removed', field: '이결재', oldValue: JSON.stringify({ type: 'approval', stepOrder: 3 }) },
    });
  });

  test("정족수(quorum) 그룹에서 인원 제거 시 남은 인원수로 정족수를 자동으로 낮춘다 (데드락 방지)", async () => {
    // 3명 중 3명 전원 필요(quorum n=3)인 미래 3차 그룹에서 1명(id:3)을 제거하면,
    // 남은 2명으로는 n=3을 영원히 채울 수 없으므로 n도 2로 함께 낮아져야 한다.
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, status: 'pending', currentStep: 1, createdBy: 1,
      groupPolicyJson: JSON.stringify({ 3: { mode: 'quorum', n: 3 } }),
      steps: [
        { id: 1, approverId: 10, type: 'approval', stepOrder: 1, status: 'pending' },
        { id: 2, approverId: 20, type: 'approval', stepOrder: 3, status: 'pending' },
        { id: 3, approverId: 21, type: 'approval', stepOrder: 3, status: 'pending' },
        { id: 4, approverId: 22, type: 'approval', stepOrder: 3, status: 'pending' },
      ],
    });
    prisma.approvalStep.delete.mockResolvedValue({});
    prisma.approvalDocument.update.mockResolvedValue({});
    const res = await request(app('member', 1)).delete('/approvals/5/steps/4');
    expect(res.status).toBe(200);
    const updateData = prisma.approvalDocument.update.mock.calls[0][0].data;
    expect(JSON.parse(updateData.groupPolicyJson)).toEqual({ 3: { mode: 'quorum', n: 2 } });
  });
});

describe('GET /approvals/:id (접근 권한)', () => {
  test('작성자/결재자/admin 아니면 → 403', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, createdBy: 1, steps: [{ approverId: 2 }], attachments: [], comments: [],
    });
    const res = await request(app('member', 99)).get('/approvals/5');
    expect(res.status).toBe(403);
  });

  test('결재자면 열람 가능 → 200', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({
      id: 5, createdBy: 1, steps: [{ approverId: 99 }], attachments: [], comments: [],
    });
    const res = await request(app('member', 99)).get('/approvals/5');
    expect(res.status).toBe(200);
  });
});

describe('첨부 다운로드 인가 (P1 회귀)', () => {
  test('결재선과 무관한 사용자 → 403 (파일 접근 전 차단)', async () => {
    prisma.approvalAttachment.findUnique.mockResolvedValue({
      id: 3, storedName: 'x.pdf', originalName: '기밀.pdf', mimeType: 'application/pdf',
      document: { createdBy: 1, delYn: '0', steps: [{ approverId: 2 }] },
    });
    const res = await request(app('member', 99)).get('/approvals/5/attachments/3/download');
    expect(res.status).toBe(403);
  });

  test('결재자 본인은 인가 통과 (파일 없으면 404 파일-미존재)', async () => {
    prisma.approvalAttachment.findUnique.mockResolvedValue({
      id: 3, storedName: 'missing.pdf', originalName: '기밀.pdf', mimeType: 'application/pdf',
      document: { createdBy: 1, delYn: '0', steps: [{ approverId: 99 }] },
    });
    const res = await request(app('member', 99)).get('/approvals/5/attachments/3/download');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/서버에 존재하지 않/);
  });
});

describe('POST /approvals/:id/comments (멘션 알림)', () => {
  test("본문의 @표시이름을 찾아 해당 활성 사용자에게 'mention' 알림 발송(본인 멘션은 제외)", async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, title: '지출결의서', delYn: '0' });
    prisma.approvalComment.create.mockResolvedValue({ id: 1, content: '@김철수 확인 부탁드려요', userId: 10 });
    prisma.user.findMany.mockResolvedValue([{ id: 20, displayName: '김철수', isActive: true }]);

    const res = await request(app('member', 10)).post('/approvals/5/comments').send({ content: '@김철수 확인 부탁드려요' });
    expect(res.status).toBe(201);
    // 비동기 멘션 알림(.catch로 fire-and-forget) 처리 대기
    await new Promise((r) => setImmediate(r));
    const notif = prisma.notification.create.mock.calls.find(c => c[0].data.type === 'mention');
    expect(notif[0].data.userId).toBe(20);
  });

  test('본인을 멘션해도 본인에게는 알림이 가지 않음', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, title: '지출결의서', delYn: '0' });
    prisma.approvalComment.create.mockResolvedValue({ id: 2, content: '@나 메모', userId: 10 });
    prisma.user.findMany.mockResolvedValue([{ id: 10, displayName: '나', isActive: true }]);

    await request(app('member', 10)).post('/approvals/5/comments').send({ content: '@나 메모' });
    await new Promise((r) => setImmediate(r));
    const mentionNotifs = prisma.notification.create.mock.calls.filter(c => c[0].data.type === 'mention');
    expect(mentionNotifs).toHaveLength(0);
  });
});

describe('POST /approvals/:id/attachments (댓글 첨부)', () => {
  test('commentId 지정 시 같은 문서의 댓글에 연결', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, delYn: '0' });
    prisma.approvalComment.findFirst.mockResolvedValue({ id: 7, documentId: 5 });
    prisma.approvalAttachment.create.mockImplementation(async ({ data }) => ({ id: 99, ...data }));

    const res = await request(app('member', 10)).post('/approvals/5/attachments').send({ commentId: 7 });
    expect(res.status).toBe(201);
    expect(prisma.approvalComment.findFirst).toHaveBeenCalledWith({ where: { id: 7, documentId: 5 } });
    expect(res.body.commentId).toBe(7);
  });

  test('다른 문서 소속 댓글 id를 지정하면 404', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, delYn: '0' });
    prisma.approvalComment.findFirst.mockResolvedValue(null); // 조회 조건(documentId 포함)에 안 맞아 못 찾음
    const res = await request(app('member', 10)).post('/approvals/5/attachments').send({ commentId: 999 });
    expect(res.status).toBe(404);
  });

  test('commentId 없으면 문서 전체 첨부(commentId: null)', async () => {
    prisma.approvalDocument.findFirst.mockResolvedValue({ id: 5, delYn: '0' });
    prisma.approvalAttachment.create.mockImplementation(async ({ data }) => ({ id: 100, ...data }));
    const res = await request(app('member', 10)).post('/approvals/5/attachments').send();
    expect(res.status).toBe(201);
    expect(res.body.commentId).toBe(null);
  });
});

describe('GET /approvals/stats (양식별·결재자별 현황)', () => {
  test('from/to 쿼리가 createdAt 범위 필터로 전달됨', async () => {
    prisma.approvalDocument.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    await request(app('admin', 1)).get('/approvals/stats?from=2026-01-01&to=2026-01-31');
    const where = prisma.approvalDocument.findMany.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date('2026-01-01'));
    expect(where.createdAt.lte.getDate()).toBe(31); // 23:59:59.999로 보정된 종료일
  });

  test('from/to 없으면 기간 필터 없이 전체 조회', async () => {
    prisma.approvalDocument.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    await request(app('admin', 1)).get('/approvals/stats');
    const where = prisma.approvalDocument.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
  });

  test('양식별 집계(총/승인/반려/대기/평균 처리시간) + 결재자별 집계', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const updatedAt = new Date('2026-01-03T00:00:00Z'); // 48시간 소요
    prisma.approvalDocument.findMany.mockResolvedValue([
      {
        id: 1, status: 'approved', createdAt, updatedAt, dueDate: null,
        template: { id: 1, name: '지출결의서', formType: { name: '인사' } },
        steps: [{ approverId: 10, status: 'approved', actionAt: updatedAt, createdAt }],
      },
      {
        id: 2, status: 'rejected', createdAt, updatedAt, dueDate: null, rejectReasonCategory: '단가초과',
        template: { id: 1, name: '지출결의서', formType: { name: '인사' } },
        steps: [{ approverId: 11, status: 'rejected', actionAt: updatedAt, createdAt }],
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 10, displayName: '김결재' }, { id: 11, displayName: '이결재' },
    ]);
    const res = await request(app('admin', 1)).get('/approvals/stats');
    expect(res.status).toBe(200);
    expect(res.body.byTemplate).toHaveLength(1);
    expect(res.body.byTemplate[0]).toMatchObject({ templateName: '지출결의서', total: 2, approved: 1, rejected: 1, pending: 0 });
    expect(res.body.byTemplate[0].avgTurnaroundHours).toBe(48);
    const kim = res.body.byApprover.find(a => a.userId === 10);
    expect(kim.displayName).toBe('김결재');
    expect(kim.approvedCount).toBe(1);
    expect(kim.avgResponseHours).toBe(48);
    expect(res.body.byRejectCategory).toEqual([{ category: '단가초과', count: 1 }]);
  });
});
