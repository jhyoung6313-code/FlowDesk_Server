/**
 * scheduleController 단위 테스트 (F-55 일정·자원)
 * 일정 CRUD 검증·공개범위 필터·권한, 자원 생성 검증을 다룬다.
 * (free-slots / schedulingService는 scheduling.test.js에서 커버)
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    scheduleEvent: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    scheduleEventAssignee: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    scheduleEventShare: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    scheduleEventShareScope: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    scheduleResource: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/sseService', () => ({ pushNotification: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/scheduleController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/schedules', ctrl.listEvents);
  a.post('/schedules', ctrl.createEvent);
  a.put('/schedules/:id', ctrl.updateEvent);
  a.delete('/schedules/:id', ctrl.removeEvent);
  a.post('/schedules/resources', ctrl.createResource);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.notification.create.mockResolvedValue({});
});

describe('GET /schedules (공개범위 필터)', () => {
  test('비관리자는 visibilityOr 조건 적용(public/본인/대상/공유/소속범위)', async () => {
    prisma.user.findUnique.mockResolvedValue({ departmentId: 2, teamId: 3 });
    prisma.scheduleEvent.findMany.mockResolvedValue([]);
    await request(app('member', 10)).get('/schedules?start=2026-07-01&end=2026-07-31');
    const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([
      { visibility: 'public' }, { createdBy: 10 },
    ]));
    // 소속 부서/팀 공유 범위 포함
    expect(where.OR.some((o) => o.shareScopes)).toBe(true);
  });

  test('관리자는 OR 필터 없음', async () => {
    prisma.scheduleEvent.findMany.mockResolvedValue([]);
    await request(app('admin', 1)).get('/schedules?start=2026-07-01&end=2026-07-31');
    const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });
});

describe('POST /schedules (생성 검증)', () => {
  test('유효하지 않은 type → 400', async () => {
    const res = await request(app()).post('/schedules').send({ type: 'party', startDate: '2026-07-01' });
    expect(res.status).toBe(400);
  });
  test('시작일 없음 → 400', async () => {
    const res = await request(app()).post('/schedules').send({ type: 'meeting' });
    expect(res.status).toBe(400);
  });
  test('종료일 < 시작일 → 400', async () => {
    const res = await request(app()).post('/schedules').send({ type: 'meeting', startDate: '2026-07-10', endDate: '2026-07-01' });
    expect(res.status).toBe(400);
  });
  test('정상 생성 → 201, 비공개면 공유 대상 비움', async () => {
    prisma.scheduleEvent.create.mockResolvedValue({ id: 1, title: '회의', assignees: [], shares: [], shareScopes: [] });
    const res = await request(app('member', 10)).post('/schedules').send({
      type: 'meeting', startDate: '2026-07-10', visibility: 'private', shareIds: [20, 30],
    });
    expect(res.status).toBe(201);
    const data = prisma.scheduleEvent.create.mock.calls[0][0].data;
    expect(data.shares).toBeUndefined(); // private → 공유 없음
  });
});

describe('자원 이중 예약 충돌 검사 (F-55)', () => {
  test('종일 예약 겹침 → 409', async () => {
    prisma.scheduleEvent.findMany.mockResolvedValue([
      { id: 9, title: '기존예약', allDay: true, resource: { name: '대회의실' }, creator: { displayName: '김대리' } },
    ]);
    const res = await request(app('member', 10)).post('/schedules').send({
      type: 'meeting', startDate: '2026-08-01', resourceId: 5,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/이미 예약/);
    expect(prisma.scheduleEvent.create).not.toHaveBeenCalled();
  });

  test('시간대 지정 예약 겹침 → 409', async () => {
    prisma.scheduleEvent.findMany.mockResolvedValue([
      { id: 9, title: '기존', allDay: false, startTime: '10:00', endTime: '11:00', resource: {}, creator: {} },
    ]);
    const res = await request(app('member', 10)).post('/schedules').send({
      type: 'meeting', startDate: '2026-08-01', allDay: false, startTime: '10:30', endTime: '12:00', resourceId: 5,
    });
    expect(res.status).toBe(409);
  });

  test('시간대가 안 겹치면 → 201 정상 생성', async () => {
    prisma.scheduleEvent.findMany.mockResolvedValue([
      { id: 9, title: '기존', allDay: false, startTime: '09:00', endTime: '10:00', resource: {}, creator: {} },
    ]);
    prisma.scheduleEvent.create.mockResolvedValue({ id: 1, title: '신규', assignees: [], shares: [], shareScopes: [] });
    const res = await request(app('member', 10)).post('/schedules').send({
      type: 'meeting', startDate: '2026-08-01', allDay: false, startTime: '10:00', endTime: '11:00', resourceId: 5,
    });
    expect(res.status).toBe(201);
  });

  test('자원 미지정이면 충돌 검사 안 함', async () => {
    prisma.scheduleEvent.create.mockResolvedValue({ id: 1, title: 'x', assignees: [], shares: [], shareScopes: [] });
    const res = await request(app('member', 10)).post('/schedules').send({ type: 'meeting', startDate: '2026-08-01' });
    expect(res.status).toBe(201);
    expect(prisma.scheduleEvent.findMany).not.toHaveBeenCalled();
  });

  test('수정 시 본인 일정은 충돌 대상에서 제외(excludeId)', async () => {
    prisma.scheduleEvent.findUnique.mockResolvedValue({ id: 1, createdBy: 10, startDate: new Date('2026-08-01'), endDate: new Date('2026-08-01'), allDay: true, resourceId: 5 });
    prisma.scheduleEvent.findMany.mockResolvedValue([]); // 자기 자신 제외되어 후보 없음
    prisma.scheduleEvent.update.mockResolvedValue({ id: 1, assignees: [], shares: [], shareScopes: [] });
    const res = await request(app('member', 10)).put('/schedules/1').send({ resourceId: 5, startDate: '2026-08-01' });
    expect(res.status).toBe(200);
    const where = prisma.scheduleEvent.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 1 });
  });
});

describe('PUT/DELETE /schedules/:id (권한)', () => {
  test('타인 일정 수정 → 403', async () => {
    prisma.scheduleEvent.findUnique.mockResolvedValue({ id: 1, createdBy: 99 });
    const res = await request(app('member', 10)).put('/schedules/1').send({ title: '변경' });
    expect(res.status).toBe(403);
  });
  test('없는 일정 삭제 → 404', async () => {
    prisma.scheduleEvent.findUnique.mockResolvedValue(null);
    const res = await request(app('member', 10)).delete('/schedules/1');
    expect(res.status).toBe(404);
  });
  test('본인 일정 삭제 → 200', async () => {
    prisma.scheduleEvent.findUnique.mockResolvedValue({ id: 1, createdBy: 10 });
    prisma.scheduleEvent.delete.mockResolvedValue({});
    const res = await request(app('member', 10)).delete('/schedules/1');
    expect(res.status).toBe(200);
  });
});

describe('POST /schedules/resources (자원 생성 검증)', () => {
  test('잘못된 kind → 400', async () => {
    const res = await request(app('admin', 1)).post('/schedules/resources').send({ kind: 'desk', name: '책상' });
    expect(res.status).toBe(400);
  });
  test('자원명 없음 → 400', async () => {
    const res = await request(app('admin', 1)).post('/schedules/resources').send({ kind: 'room' });
    expect(res.status).toBe(400);
  });
  test('정상 → 201', async () => {
    prisma.scheduleResource.create.mockResolvedValue({ id: 1, kind: 'room', name: '대회의실' });
    const res = await request(app('admin', 1)).post('/schedules/resources').send({ kind: 'room', name: '대회의실' });
    expect(res.status).toBe(201);
  });
});
