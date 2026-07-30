/**
 * playbookRunController 단위 테스트 (F-36/37 플레이북 실행)
 * 런 생성 시 스텝 복사·변수 치환, 스텝 조건분기 스킵, 전체 완료 시 자동 종료,
 * 담당자 검증, 삭제 권한을 검증.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    playbookRun: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), groupBy: jest.fn() },
    playbookStep: { findMany: jest.fn() },
    playbook: { findUnique: jest.fn() },
    runStep: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    runParticipant: { create: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    runTimeline: { create: jest.fn() },
    runUpdate: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), count: jest.fn() },
    runStepChecklist: { findMany: jest.fn(), aggregate: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    playbookReadState: { findUnique: jest.fn(), upsert: jest.fn() },
    user: { findUnique: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  m.$transaction = jest.fn(async (cb) => (typeof cb === 'function' ? cb(m) : Promise.all(cb)));
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/sseService', () => ({ pushNotification: jest.fn() }));
jest.mock('../src/services/linkedRoomService', () => ({
  createGroupRoom: jest.fn().mockResolvedValue(1),
  postMessage: jest.fn().mockResolvedValue({}),
}));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/playbookRunController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.post('/runs', ctrl.createRun);
  a.patch('/runs/:id/steps/:stepId', ctrl.updateStep);
  a.delete('/runs/:id', ctrl.deleteRun);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.notification.create.mockResolvedValue({ id: 1 });
  prisma.$transaction.mockImplementation(async (cb) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb)));
  prisma.runParticipant.create.mockResolvedValue({});
  prisma.runParticipant.upsert.mockResolvedValue({});
  prisma.runTimeline.create.mockResolvedValue({});
});

describe('createRun', () => {
  test('이름 누락 → 400', async () => {
    const res = await request(app()).post('/runs').send({});
    expect(res.status).toBe(400);
  });

  test('플레이북 스텝 복사 시 {{변수}} 치환', async () => {
    prisma.playbookRun.create.mockResolvedValue({ id: 100 });
    prisma.playbookStep.findMany.mockResolvedValue([
      { id: 1, phaseId: 1, title: '{{system}} 점검', instructions: '{{system}} 재시작', type: 'task', order: 0, assigneeMode: 'specific', assigneeUserId: 20, slaMins: 30, dueAt: null, requireEvidence: false, parallelGroup: null },
    ]);
    prisma.playbook.findUnique.mockResolvedValue({ defaultParticipants: null });
    prisma.runStep.create.mockResolvedValue({});
    prisma.playbookRun.findUnique.mockResolvedValue({ id: 100, name: '장애대응', steps: [] });
    const res = await request(app('member', 10)).post('/runs').send({
      playbookId: 5, name: '장애대응', variableValues: { system: 'DB서버' },
    });
    expect(res.status).toBe(201);
    const stepData = prisma.runStep.create.mock.calls[0][0].data;
    expect(stepData.title).toBe('DB서버 점검');
    expect(stepData.instructions).toBe('DB서버 재시작');
    expect(stepData.assigneeId).toBe(20); // specific 모드
  });
});

describe('updateStep — 담당자 검증', () => {
  test('존재하지 않는 사용자 배정 → 400', async () => {
    prisma.runStep.findFirst.mockResolvedValue({ id: 1, runId: 5, title: 'x', order: 0, status: 'pending' });
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app()).patch('/runs/5/steps/1').send({ assigneeId: 999 });
    expect(res.status).toBe(400);
  });
});

describe('updateStep — 조건 분기 스킵', () => {
  test('decision 완료 시 선택 안 된 브랜치 스텝 스킵', async () => {
    prisma.runStep.findFirst.mockResolvedValue({ id: 2, runId: 5, title: '승인여부', order: 2, type: 'decision', status: 'pending' });
    prisma.runStep.update.mockResolvedValue({ id: 2, title: '승인여부' });
    prisma.runStep.findUnique.mockResolvedValue({ step: { decisionOptions: JSON.stringify([{ label: '거부', nextStepOrder: 5 }]) } });
    // 스킵 대상(order 3,4) 조회 → 두 스텝. 전체완료 조회는 별도.
    prisma.runStep.findMany.mockImplementation(async ({ where }) => {
      if (where.order) return [{ id: 3, title: 'A' }, { id: 4, title: 'B' }]; // 스킵 대상
      return [{ status: 'done' }, { status: 'skipped' }, { status: 'skipped' }]; // 전체(모두 종료로 가정 X)
    });
    const res = await request(app()).patch('/runs/5/steps/2').send({ status: 'done', decisionChosen: '거부' });
    expect(res.status).toBe(200);
    // order 3,4 스텝이 skipped로 업데이트 (id 2 자신 + 3 + 4 = 3회 이상)
    const skipCalls = prisma.runStep.update.mock.calls.filter((c) => c[0].data.status === 'skipped');
    expect(skipCalls.length).toBe(2);
  });
});

describe('updateStep — 전체 완료 시 런 자동 종료', () => {
  test('모든 스텝 종료면 run status=finished', async () => {
    prisma.runStep.findFirst.mockResolvedValue({ id: 1, runId: 5, title: 'x', order: 0, status: 'pending' });
    prisma.runStep.update.mockResolvedValue({ id: 1, title: 'x' });
    prisma.runStep.findMany.mockResolvedValue([{ status: 'done' }, { status: 'done' }]); // 전부 done
    prisma.playbookRun.update.mockResolvedValue({});
    const res = await request(app()).patch('/runs/5/steps/1').send({ status: 'done' });
    expect(res.status).toBe(200);
    const runUpd = prisma.playbookRun.update.mock.calls.find((c) => c[0].data.status === 'finished');
    expect(runUpd).toBeTruthy();
  });
});

describe('deleteRun — 권한', () => {
  test('타인이 만든 런을 member가 삭제 → 403', async () => {
    prisma.playbookRun.findUnique.mockResolvedValue({ id: 5, createdBy: 99 });
    const res = await request(app('member', 10)).delete('/runs/5');
    expect(res.status).toBe(403);
  });
  test('admin은 삭제 가능 → 200', async () => {
    prisma.playbookRun.findUnique.mockResolvedValue({ id: 5, createdBy: 99 });
    prisma.playbookRun.delete.mockResolvedValue({});
    const res = await request(app('admin', 1)).delete('/runs/5');
    expect(res.status).toBe(200);
  });
});
