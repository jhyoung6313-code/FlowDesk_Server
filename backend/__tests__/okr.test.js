/**
 * okrController 단위 테스트 (F-60)
 * 진척률 계산(percent/boolean/clamp), 권한, Objective 재계산을 검증.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    okrCycle: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    objective: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    keyResult: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    keyResultCheckin: { findMany: jest.fn(), create: jest.fn() },
    keyResultLink: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    task: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/okrController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/okr/tree', ctrl.tree);
  a.post('/okr/cycles', ctrl.createCycle);
  a.post('/okr/objectives', ctrl.createObjective);
  a.patch('/okr/objectives/:id', ctrl.updateObjective);
  a.post('/okr/objectives/:objId/krs', ctrl.createKeyResult);
  a.post('/okr/krs/:krId/checkins', ctrl.createCheckin);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('tree — KR 진척률 계산', () => {
  test('percent: (cur-start)/(target-start), 범위 클램프', async () => {
    prisma.objective.findMany.mockResolvedValue([
      {
        id: 1, keyResults: [
          { id: 1, metricType: 'percent', startValue: 0, targetValue: 100, currentValue: 50 },
          { id: 2, metricType: 'number', startValue: 10, targetValue: 20, currentValue: 25 }, // >target → 100 클램프
          { id: 3, metricType: 'boolean', startValue: 0, targetValue: 1, currentValue: 0 },   // false → 0
        ],
      },
    ]);
    const res = await request(app()).get('/okr/tree?cycleId=1');
    expect(res.status).toBe(200);
    const krs = res.body[0].keyResults;
    expect(krs[0].progress).toBe(50);
    expect(krs[1].progress).toBe(100);
    expect(krs[2].progress).toBe(0);
  });

  test('cycleId 누락 → 400', async () => {
    const res = await request(app()).get('/okr/tree');
    expect(res.status).toBe(400);
  });
});

describe('createCycle — 관리자 전용', () => {
  test('일반 사용자 → 403', async () => {
    const res = await request(app('member')).post('/okr/cycles').send({ name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30' });
    expect(res.status).toBe(403);
  });
  test('관리자 → 201', async () => {
    prisma.okrCycle.create.mockResolvedValue({ id: 1, name: 'Q3' });
    const res = await request(app('admin')).post('/okr/cycles').send({ name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30' });
    expect(res.status).toBe(201);
  });
});

describe('updateObjective — 소유자/관리자만', () => {
  test('타인 목표 수정 → 403', async () => {
    prisma.objective.findFirst.mockResolvedValue({ id: 1, ownerId: 99 });
    const res = await request(app('member', 10)).patch('/okr/objectives/1').send({ title: '변경' });
    expect(res.status).toBe(403);
  });
  test('소유자 수정 → 200', async () => {
    prisma.objective.findFirst.mockResolvedValue({ id: 1, ownerId: 10 });
    prisma.objective.update.mockResolvedValue({ id: 1, title: '변경' });
    const res = await request(app('member', 10)).patch('/okr/objectives/1').send({ title: '변경' });
    expect(res.status).toBe(200);
  });
});

describe('createKeyResult — Objective 재계산 트리거', () => {
  test('KR 생성 시 recomputeObjective로 progress 저장', async () => {
    prisma.objective.findFirst.mockResolvedValue({ id: 1, ownerId: 10 });
    prisma.keyResult.create.mockResolvedValue({ id: 5, metricType: 'percent', startValue: 0, targetValue: 100, currentValue: 40 });
    prisma.keyResult.findMany.mockResolvedValue([{ metricType: 'percent', startValue: 0, targetValue: 100, currentValue: 40 }]);
    prisma.objective.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/okr/objectives/1/krs').send({ title: '신규 KR', metricType: 'percent' });
    expect(res.status).toBe(201);
    expect(res.body.progress).toBe(40);
    expect(prisma.objective.update).toHaveBeenCalledWith(expect.objectContaining({ data: { progress: 40 } }));
  });
});

describe('createCheckin — 값으로 KR 현재값 갱신', () => {
  test('타인 목표의 KR 체크인 → 403 (소유자/관리자만)', async () => {
    prisma.keyResult.findUnique.mockResolvedValue({ id: 5, objectiveId: 1, objective: { id: 1, ownerId: 99 } });
    const res = await request(app('member', 10)).post('/okr/krs/5/checkins').send({ value: 50 });
    expect(res.status).toBe(403);
  });

  test('현재값 누락 → 400', async () => {
    prisma.keyResult.findUnique.mockResolvedValue({ id: 5, objectiveId: 1, objective: { id: 1, ownerId: 10 } });
    const res = await request(app('member', 10)).post('/okr/krs/5/checkins').send({});
    expect(res.status).toBe(400);
  });
  test('체크인 → KR currentValue 업데이트', async () => {
    prisma.keyResult.findUnique.mockResolvedValue({ id: 5, objectiveId: 1, objective: { id: 1, ownerId: 10 } });
    prisma.keyResultCheckin.create.mockResolvedValue({ id: 1, value: 70 });
    prisma.keyResult.update.mockResolvedValue({});
    prisma.keyResult.findMany.mockResolvedValue([]);
    prisma.objective.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/okr/krs/5/checkins').send({ value: 70 });
    expect(res.status).toBe(201);
    expect(prisma.keyResult.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { currentValue: 70 } });
  });
});
