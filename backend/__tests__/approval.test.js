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
      update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn(),
    },
    approvalDocSeq: { upsert: jest.fn() },
    approvalAttachment: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    approvalComment: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    approvalFormType: { findUnique: jest.fn() },
  };
  // $transaction: 콜백을 mock prisma(tx=m)로 즉시 실행
  m.$transaction = jest.fn(async (cb) => (typeof cb === 'function' ? cb(m) : Promise.all(cb)));
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/sseService', () => ({ pushNotification: jest.fn() }));
jest.mock('../src/services/approvalLine', () => ({
  resolvePresetLine: jest.fn().mockResolvedValue({ steps: [], unresolved: [] }),
}));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/approvalController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; req.ip = '127.0.0.1'; next(); });
  a.get('/approvals', ctrl.list);
  a.get('/approvals/pending-count', ctrl.pendingCount);
  a.get('/approvals/:id', ctrl.get);
  a.post('/approvals', ctrl.create);
  a.post('/approvals/:id/submit', ctrl.submit);
  a.post('/approvals/:id/approve', ctrl.approve);
  a.post('/approvals/:id/reject', ctrl.reject);
  a.post('/approvals/:id/cancel', ctrl.cancel);
  a.post('/approvals/:id/delegate', ctrl.delegate);
  a.post('/approvals/:id/resume', ctrl.resume);
  a.post('/approvals/:id/resubmit', ctrl.resubmit);
  a.get('/approvals/:id/attachments/:aid/download', ctrl.downloadAttachment);
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
    const res = await request(app('member', 10)).post('/approvals/5/approve').send({});
    expect(res.status).toBe(200);
    // 문서 자체(status/currentStep) 업데이트는 호출되지 않아야 함
    expect(prisma.approvalDocument.update).not.toHaveBeenCalled();
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
