/**
 * boardController 단위 테스트 (F-34/35 보드)
 * 보드 생성 검증·멤버/역할, 접근(멤버) 게이트, 수정(owner 이상) 권한을 검증.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    board: { findUnique: jest.fn(), aggregate: jest.fn(), create: jest.fn(), update: jest.fn() },
    boardMember: { findUnique: jest.fn(), createMany: jest.fn() },
    boardCardDependency: { findMany: jest.fn(), create: jest.fn() },
    user: { findMany: jest.fn() },
  };
  m.$transaction = jest.fn(async (cb) => (typeof cb === 'function' ? cb(m) : Promise.all(cb)));
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/boardController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role, displayName: 'U' }; next(); });
  a.post('/boards', ctrl.create);
  a.get('/boards/:id', ctrl.get);
  a.patch('/boards/:id', ctrl.update);
  a.post('/boards/:id/cards/:cardId/dependencies', ctrl.addDependency);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (cb) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb)));
});

describe('POST /boards (생성)', () => {
  test('제목 없음 → 400', async () => {
    const res = await request(app()).post('/boards').send({ description: 'x' });
    expect(res.status).toBe(400);
  });

  test('생성자는 owner, 초대 멤버 중복 제거', async () => {
    prisma.board.aggregate.mockResolvedValue({ _max: { order: 2 } });
    prisma.board.create.mockResolvedValue({ id: 5, title: '개발보드' });
    prisma.boardMember.createMany.mockResolvedValue({});
    prisma.board.findUnique.mockResolvedValue({ id: 5, title: '개발보드', members: [] });
    const res = await request(app('member', 10)).post('/boards').send({ title: '개발보드', memberIds: [10, 20, 20] });
    expect(res.status).toBe(201);
    const rows = prisma.boardMember.createMany.mock.calls[0][0].data;
    expect(rows.map((r) => r.userId).sort()).toEqual([10, 20]);
    expect(rows.find((r) => r.userId === 10).role).toBe('owner');
    expect(rows.find((r) => r.userId === 20).role).toBe('member');
    // order = 기존 max(2) + 1
    expect(prisma.board.create.mock.calls[0][0].data.order).toBe(3);
  });
});

describe('GET /boards/:id (접근 게이트)', () => {
  test('멤버가 아니고 admin도 아니면 → 403', async () => {
    prisma.boardMember.findUnique.mockResolvedValue(null);
    const res = await request(app('member', 10)).get('/boards/5');
    expect(res.status).toBe(403);
  });
  test('멤버면 → 200', async () => {
    prisma.boardMember.findUnique.mockResolvedValue({ boardId: 5, userId: 10, role: 'member' });
    prisma.board.findUnique.mockResolvedValue({ id: 5, title: 'B', members: [], properties: [] });
    const res = await request(app('member', 10)).get('/boards/5');
    expect(res.status).toBe(200);
  });
  test('admin은 멤버 아니어도 → 200', async () => {
    prisma.boardMember.findUnique.mockResolvedValue(null);
    prisma.board.findUnique.mockResolvedValue({ id: 5, title: 'B', members: [], properties: [] });
    const res = await request(app('admin', 1)).get('/boards/5');
    expect(res.status).toBe(200);
  });
});

describe('카드 의존성 순환 방지 (P2 신규)', () => {
  test('자기 자신 의존 → 400', async () => {
    prisma.boardMember.findUnique.mockResolvedValue({ role: 'member' });
    const res = await request(app('member', 10)).post('/boards/1/cards/5/dependencies').send({ blockingId: 5 });
    expect(res.status).toBe(400);
  });

  test('직접 순환(B가 이미 A에 의존) → 400', async () => {
    prisma.boardMember.findUnique.mockResolvedValue({ role: 'member' });
    // A=5 가 B=8 에 의존하려는데, B(8)는 이미 A(5)에 의존 중 → 순환
    // dependencyCreatesCycle: blocking(8)의 의존대상 조회 → {blockingId: 5} 반환 → dependentId(5) 도달
    prisma.boardCardDependency.findMany.mockResolvedValue([{ blockingId: 5 }]);
    const res = await request(app('member', 10)).post('/boards/1/cards/5/dependencies').send({ blockingId: 8 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/순환/);
    expect(prisma.boardCardDependency.create).not.toHaveBeenCalled();
  });

  test('순환 없으면 → 201 생성', async () => {
    prisma.boardMember.findUnique.mockResolvedValue({ role: 'member' });
    prisma.boardCardDependency.findMany.mockResolvedValue([]); // blocking은 아무 것에도 의존 안 함
    prisma.boardCardDependency.create.mockResolvedValue({ id: 1, dependentId: 5, blockingId: 8 });
    const res = await request(app('member', 10)).post('/boards/1/cards/5/dependencies').send({ blockingId: 8 });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /boards/:id (owner 이상만 수정)', () => {
  test('member 역할은 수정 불가 → 403', async () => {
    prisma.boardMember.findUnique.mockResolvedValue({ role: 'member' });
    const res = await request(app('member', 10)).patch('/boards/5').send({ title: '변경' });
    expect(res.status).toBe(403);
  });
  test('owner는 수정 가능 → 200', async () => {
    prisma.boardMember.findUnique.mockResolvedValue({ role: 'owner' });
    prisma.board.update.mockResolvedValue({ id: 5, title: '변경', members: [], properties: [] });
    const res = await request(app('member', 10)).patch('/boards/5').send({ title: '변경' });
    expect(res.status).toBe(200);
  });
});
