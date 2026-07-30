/**
 * wbsController 단위 테스트 (F-13/14 WBS·이슈)
 * 작업 생성 검증·진척 클램프(0~100)·level/order 계산, 이슈 생성 검증을 다룬다.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    wbsTask: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    wbsIssue: { create: jest.fn() },
  };
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
