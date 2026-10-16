/**
 * wbsController 단위 테스트 (F-13/14 WBS·이슈)
 * 작업 생성 검증·진척 클램프(0~100)·level/order 계산, 이슈 생성 검증을 다룬다.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    wbsTask: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    wbsIssue: { create: jest.fn() },
    wbsTaskDependency: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  };
  // $transaction: 배열 폼은 그대로 Promise.all, 콜백 폼은 tx=m으로 즉시 실행(updateTask의
  // advisory lock + 순환검사 + 쓰기를 하나의 트랜잭션으로 묶은 경로에서 사용)
  m.$transaction = jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(m)));
  // updateTask가 의존성 수정 시 거는 프로젝트 단위 advisory lock(SELECT pg_advisory_xact_lock) — no-op.
  // pg_advisory_xact_lock은 void를 반환해 $queryRaw로는 역직렬화가 안 되므로 $executeRaw를 쓴다.
  m.$executeRaw = jest.fn().mockResolvedValue(0);
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/wbsController');

function app(uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role: 'member' }; next(); });
  a.post('/wbs/projects/:id/tasks', ctrl.createTask);
  a.patch('/wbs/tasks/:taskId', ctrl.updateTask);
  a.get('/wbs/projects/:id/tasks', ctrl.getTasks);
  a.post('/wbs/projects/:id/issues', ctrl.createIssue);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('createTask', () => {
  test('작업명 없음 → 400', async () => {
    const res = await request(app()).post('/wbs/projects/1/tasks').send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  test('진척률 100 초과는 100으로 클램프, 음수는 0', async () => {
    prisma.wbsTask.findFirst.mockResolvedValue(null); // 첫 항목 → order 0
    prisma.wbsTask.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    const res = await request(app()).post('/wbs/projects/1/tasks').send({
      name: '설계', plannedProgress: 150, actualProgress: -20,
    });
    expect(res.status).toBe(201);
    const data = prisma.wbsTask.create.mock.calls[0][0].data;
    expect(data.plannedProgress).toBe(100);
    expect(data.actualProgress).toBe(0);
    expect(data.order).toBe(0);
    expect(data.level).toBe(0);
  });

  test('부모 지정 시 level = 부모 level+1, order는 마지막+1', async () => {
    prisma.wbsTask.findFirst.mockResolvedValue({ order: 3 }); // 같은 부모 하위 마지막 order
    prisma.wbsTask.findUnique.mockResolvedValue({ id: 7, level: 1 }); // 부모
    prisma.wbsTask.create.mockImplementation(async ({ data }) => ({ id: 2, ...data }));
    const res = await request(app()).post('/wbs/projects/1/tasks').send({ name: '상세설계', parentId: 7 });
    expect(res.status).toBe(201);
    const data = prisma.wbsTask.create.mock.calls[0][0].data;
    expect(data.level).toBe(2);
    expect(data.order).toBe(4);
    expect(data.parentId).toBe(7);
  });
});

describe('updateTask', () => {
  test('작업명을 빈값으로 수정 → 400', async () => {
    const res = await request(app()).patch('/wbs/tasks/1').send({ name: '' });
    expect(res.status).toBe(400);
  });
  test('진척률 클램프 적용', async () => {
    prisma.wbsTask.update.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    const res = await request(app()).patch('/wbs/tasks/1').send({ actualProgress: 250 });
    expect(res.status).toBe(200);
    expect(prisma.wbsTask.update.mock.calls[0][0].data.actualProgress).toBe(100);
  });
});

describe('createIssue', () => {
  test('내용 없음 → 400', async () => {
    const res = await request(app()).post('/wbs/projects/1/issues').send({ category: '기술' });
    expect(res.status).toBe(400);
  });
  test('정상 생성 → 201 (progress 기본 0)', async () => {
    prisma.wbsIssue.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    const res = await request(app()).post('/wbs/projects/1/issues').send({ content: 'API 지연 이슈' });
    expect(res.status).toBe(201);
    expect(prisma.wbsIssue.create.mock.calls[0][0].data.progress).toBe(0);
  });
});

describe('updateTask — 선후행 의존성(predecessorIds)', () => {
  test('본인 id·다른 프로젝트 소속은 걸러내고 유효한 것만 저장', async () => {
    prisma.wbsTask.findUnique.mockResolvedValue({ projectId: 1 });
    prisma.wbsTask.findMany.mockResolvedValue([{ id: 2 }]); // id 3은 다른 프로젝트라 무효
    prisma.wbsTaskDependency.findMany.mockResolvedValue([]);
    prisma.wbsTask.update.mockResolvedValue({ id: 5 });

    await request(app()).patch('/wbs/tasks/5').send({ predecessorIds: [5, 2, 3] });

    expect(prisma.wbsTaskDependency.deleteMany).toHaveBeenCalledWith({ where: { successorId: 5 } });
    expect(prisma.wbsTaskDependency.createMany.mock.calls[0][0].data).toEqual([{ predecessorId: 2, successorId: 5 }]);
  });

  test('순환 의존성이 되는 predecessor는 저장하지 않음', async () => {
    // 기존: 1→2 (1이 2의 predecessor). 이제 2를 5의 predecessor로, 5를 1의 predecessor로 두려는 시도는 무시하고,
    // "1을 5의 predecessor로" 추가 시 1←...←5 역탐색에서 5 자신이 나오면 순환 → 차단
    prisma.wbsTask.findUnique.mockResolvedValue({ projectId: 1 });
    prisma.wbsTask.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.wbsTaskDependency.findMany.mockResolvedValue([{ predecessorId: 5, successorId: 1 }]); // 5→1 이미 존재
    prisma.wbsTask.update.mockResolvedValue({ id: 5 });

    // 1을 5의 predecessor로 추가하면 5→1→5 순환이 되어야 함
    const res = await request(app()).patch('/wbs/tasks/5').send({ predecessorIds: [1] });

    expect(prisma.wbsTaskDependency.createMany).not.toHaveBeenCalled();
    // 조용히 드랍하지 않고 응답에 warnings로 알려야 한다 — 200 성공 응답만 보면 사용자가
    // 요청한 선행작업 지정이 실제로는 반영되지 않은 걸 알 방법이 없었다.
    expect(res.body.warnings).toEqual(['순환 의존성이 되는 선행작업 1건을 제외했습니다.']);
  });

  test('빈 배열 전달 시 기존 의존성 삭제만 수행', async () => {
    prisma.wbsTask.findUnique.mockResolvedValue({ projectId: 1 });
    prisma.wbsTask.update.mockResolvedValue({ id: 5 });

    await request(app()).patch('/wbs/tasks/5').send({ predecessorIds: [] });

    expect(prisma.wbsTaskDependency.deleteMany).toHaveBeenCalledWith({ where: { successorId: 5 } });
    expect(prisma.wbsTaskDependency.createMany).not.toHaveBeenCalled();
  });
});

describe('getTasks — 크리티컬패스 플래그', () => {
  test('유일한 의존 체인이 전체 프로젝트 기간을 결정하면 해당 작업들만 isCritical=true', async () => {
    const tasks = [
      { id: 1, parentId: null, level: 0, order: 0, name: 'A', startDate: new Date('2026-01-01'), endDate: new Date('2026-01-05') },
      { id: 2, parentId: null, level: 0, order: 1, name: 'B', startDate: new Date('2026-01-01'), endDate: new Date('2026-01-10') },
    ];
    prisma.wbsTask.findMany.mockResolvedValue(tasks);
    prisma.wbsTaskDependency.findMany.mockResolvedValue([{ predecessorId: 1, successorId: 2 }]);

    const res = await request(app()).get('/wbs/projects/1/tasks');
    const flat = res.body;
    const byId = Object.fromEntries(flat.map((t) => [t.id, t]));
    expect(byId[1].isCritical).toBe(true);
    expect(byId[2].isCritical).toBe(true);
    expect(byId[2].predecessorIds).toEqual([1]);
  });

  test('의존성이 전혀 없으면 모두 isCritical=false', async () => {
    prisma.wbsTask.findMany.mockResolvedValue([
      { id: 1, parentId: null, level: 0, order: 0, name: 'A', startDate: new Date('2026-01-01'), endDate: new Date('2026-01-05') },
    ]);
    prisma.wbsTaskDependency.findMany.mockResolvedValue([]);

    const res = await request(app()).get('/wbs/projects/1/tasks');
    expect(res.body[0].isCritical).toBe(false);
  });
});
