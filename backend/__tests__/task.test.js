/**
 * taskController 단위 테스트
 * Prisma mock 처리로 DB 없이 비즈니스 로직 검증
 */

const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    task: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    taskAssignee: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    taskDependency: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    // 업무 이력 기록(logHistory)용 — create/삭제/상태변경 시 호출됨
    taskHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const taskController = require('../src/controllers/taskController');

function createApp(userRole = 'admin', userId = 1) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: userId, role: userRole };
    next();
  });
  app.get('/api/tasks', taskController.list);
  app.post('/api/tasks', taskController.create);
  app.get('/api/tasks/:id', taskController.detail);
  app.put('/api/tasks/:id', taskController.update);
  app.delete('/api/tasks/:id', taskController.remove);
  app.patch('/api/tasks/:id/status', taskController.updateStatus);
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

const mockTask = {
  id: 1,
  title: '테스트 업무',
  description: '설명',
  partId: 1,
  priority: 'normal',
  status: 'pending',
  startDate: new Date('2026-04-01'),
  dueDate: new Date('2026-04-30'),
  createdBy: 1,
  delYn: '0',
  part: { id: 1, name: '개발팀' },
  creator: { id: 1, displayName: '관리자' },
  assignees: [],
  predecessors: [],
  successors: [],
};

describe('GET /api/tasks (업무 목록)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('전체 목록 조회 → 200 + 배열 반환', async () => {
    prisma.task.findMany.mockResolvedValue([mockTask]);
    const res = await request(createApp()).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].title).toBe('테스트 업무');
  });

  test('delYn=0 필터가 기본으로 적용됨', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    await request(createApp()).get('/api/tasks');
    const callArg = prisma.task.findMany.mock.calls[0][0];
    expect(callArg.where.delYn).toBe('0');
  });

  test('status=deleted 파라미터 시 delYn=1 필터 적용', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    await request(createApp()).get('/api/tasks?status=deleted');
    const callArg = prisma.task.findMany.mock.calls[0][0];
    expect(callArg.where.delYn).toBe('1');
  });
});

describe('POST /api/tasks (업무 생성)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('title 누락 시 400 반환', async () => {
    const res = await request(createApp())
      .post('/api/tasks')
      .send({ description: '설명만 있음' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/필수/);
  });

  test('정상 생성 → 201 반환', async () => {
    prisma.task.create.mockResolvedValue(mockTask);
    const res = await request(createApp())
      .post('/api/tasks')
      .send({ title: '새 업무', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('테스트 업무');
  });

  test('기본 status는 pending, priority는 normal', async () => {
    prisma.task.create.mockResolvedValue(mockTask);
    await request(createApp()).post('/api/tasks').send({ title: '업무' });
    const createArg = prisma.task.create.mock.calls[0][0].data;
    expect(createArg.status).toBe('pending');
    expect(createArg.priority).toBe('normal');
  });
});

describe('GET /api/tasks/:id (업무 상세)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('존재하는 업무 → 200 반환', async () => {
    prisma.task.findUnique.mockResolvedValue(mockTask);
    const res = await request(createApp()).get('/api/tasks/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  test('없는 업무 → 404 반환', async () => {
    prisma.task.findUnique.mockResolvedValue(null);
    const res = await request(createApp()).get('/api/tasks/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/찾을 수 없습니다/);
  });

  test('삭제된 업무(delYn=1) → 404 반환', async () => {
    prisma.task.findUnique.mockResolvedValue({ ...mockTask, delYn: '1' });
    const res = await request(createApp()).get('/api/tasks/1');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/tasks/:id (업무 삭제)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('Admin은 본인 생성 아니어도 삭제 가능', async () => {
    // Admin이고 createdBy가 다른 사람(2)
    prisma.task.findUnique.mockResolvedValue({ ...mockTask, createdBy: 2 });
    prisma.task.update.mockResolvedValue({ ...mockTask, delYn: '1' });
    const res = await request(createApp('admin', 1)).delete('/api/tasks/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/삭제되었습니다/);
  });

  test('Member가 본인 생성 업무 삭제 가능', async () => {
    prisma.task.findUnique.mockResolvedValue({ ...mockTask, createdBy: 5 });
    prisma.task.update.mockResolvedValue({ ...mockTask, delYn: '1' });
    const res = await request(createApp('member', 5)).delete('/api/tasks/1');
    expect(res.status).toBe(200);
  });

  test('권한 없는 Member 삭제 시도 → 403 반환', async () => {
    // userId=9, createdBy=1 (다른 사람)
    prisma.task.findUnique.mockResolvedValue({ ...mockTask, createdBy: 1 });
    const res = await request(createApp('member', 9)).delete('/api/tasks/1');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/권한/);
  });

  test('없는 업무 삭제 → 404 반환', async () => {
    prisma.task.findUnique.mockResolvedValue(null);
    const res = await request(createApp()).delete('/api/tasks/999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/tasks/:id/status (상태 변경)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('유효하지 않은 상태값 → 400 반환', async () => {
    const res = await request(createApp())
      .patch('/api/tasks/1/status')
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/유효하지 않은/);
  });

  test.each(['pending', 'in_progress', 'done', 'hold'])('유효한 상태 %s → 200 반환', async (status) => {
    prisma.task.update.mockResolvedValue({ ...mockTask, status });
    const res = await request(createApp())
      .patch('/api/tasks/1/status')
      .send({ status });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(status);
  });
});
