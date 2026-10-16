/**
 * ledgerController 단위 테스트 (F-45 가계부) — 개인용(계정별 분리)
 * 거래/카테고리 검증, 카테고리 삭제 가드, 반복거래 자동생성(중복방지·월말보정), 요약 잔액,
 * 그리고 "타인의 거래·예산·반복거래·카테고리에 접근할 수 없음"을 검증한다.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    ledgerCategory: { count: jest.fn(), createMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    ledgerEntry: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    ledgerBudget: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    ledgerRecurring: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/ledgerController');

function app(uid = 10, role = 'member') {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/ledger/categories', ctrl.listCategories);
  a.post('/ledger/categories', ctrl.createCategory);
  a.put('/ledger/categories/:id', ctrl.updateCategory);
  a.delete('/ledger/categories/:id', ctrl.deleteCategory);
  a.get('/ledger/entries', ctrl.listEntries);
  a.post('/ledger/entries', ctrl.createEntry);
  a.put('/ledger/entries/:id', ctrl.updateEntry);
  a.delete('/ledger/entries/:id', ctrl.deleteEntry);
  a.get('/ledger/budgets', ctrl.listBudgets);
  a.post('/ledger/budgets', ctrl.upsertBudget);
  a.delete('/ledger/budgets/:id', ctrl.deleteBudget);
  a.get('/ledger/recurrings', ctrl.listRecurrings);
  a.post('/ledger/recurrings', ctrl.createRecurring);
  a.put('/ledger/recurrings/:id', ctrl.updateRecurring);
  a.delete('/ledger/recurrings/:id', ctrl.deleteRecurring);
  a.post('/ledger/recurrings/apply', ctrl.applyRecurring);
  a.get('/ledger/summary', ctrl.summary);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.ledgerCategory.count.mockResolvedValue(12);   // 기본 카테고리 시드 완료 상태
  prisma.ledgerCategory.findFirst.mockResolvedValue({ id: 1 });   // 사용 가능한 카테고리
});

describe('createEntry 검증', () => {
  test('필수값 누락 → 400', async () => {
    const res = await request(app()).post('/ledger/entries').send({ type: 'expense', amount: 1000 });
    expect(res.status).toBe(400);
  });
  test('작성자는 항상 본인(createdBy = 로그인 사용자)', async () => {
    prisma.ledgerEntry.create.mockResolvedValue({ id: 1 });
    const res = await request(app(10)).post('/ledger/entries').send({ type: 'expense', amount: 1000, categoryId: 1, date: '2026-07-01', createdBy: 999 });
    expect(res.status).toBe(201);
    expect(prisma.ledgerEntry.create.mock.calls[0][0].data.createdBy).toBe(10);
  });
  test('타인의 개인 카테고리는 사용 불가 → 400', async () => {
    prisma.ledgerCategory.findFirst.mockResolvedValue(null);
    const res = await request(app(10)).post('/ledger/entries').send({ type: 'expense', amount: 1000, categoryId: 77, date: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    // 카테고리 조회 조건: 기본(null) 또는 본인
    expect(prisma.ledgerCategory.findFirst.mock.calls[0][0].where).toEqual({ id: 77, OR: [{ userId: null }, { userId: 10 }] });
  });
});

describe('거래 내역 — 본인 것만', () => {
  test('목록은 createdBy = 본인 으로 제한', async () => {
    prisma.ledgerEntry.findMany.mockResolvedValue([]);
    prisma.ledgerEntry.count.mockResolvedValue(0);
    await request(app(10)).get('/ledger/entries?year=2026&month=7');
    expect(prisma.ledgerEntry.findMany.mock.calls[0][0].where.createdBy).toBe(10);
    expect(prisma.ledgerEntry.count.mock.calls[0][0].where.createdBy).toBe(10);
  });
  test('타인 거래 수정 → 404 (수정 호출 없음)', async () => {
    prisma.ledgerEntry.findFirst.mockResolvedValue(null);
    const res = await request(app(10)).put('/ledger/entries/5').send({ amount: 1 });
    expect(res.status).toBe(404);
    expect(prisma.ledgerEntry.findFirst.mock.calls[0][0].where).toEqual({ id: 5, createdBy: 10 });
    expect(prisma.ledgerEntry.update).not.toHaveBeenCalled();
  });
  test('본인 거래 수정 → 200', async () => {
    prisma.ledgerEntry.findFirst.mockResolvedValue({ id: 5 });
    prisma.ledgerEntry.update.mockResolvedValue({ id: 5 });
    expect((await request(app(10)).put('/ledger/entries/5').send({ amount: 1 })).status).toBe(200);
  });
  test('타인 거래 삭제 → 404, 삭제 조건에 소유자 포함', async () => {
    prisma.ledgerEntry.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app(10)).delete('/ledger/entries/5');
    expect(res.status).toBe(404);
    expect(prisma.ledgerEntry.deleteMany).toHaveBeenCalledWith({ where: { id: 5, createdBy: 10 } });
  });
  test('관리자도 타인 거래는 접근 불가(개인용)', async () => {
    prisma.ledgerEntry.deleteMany.mockResolvedValue({ count: 0 });
    expect((await request(app(1, 'admin')).delete('/ledger/entries/5')).status).toBe(404);
  });
});

describe('카테고리 — 기본(공용) + 개인', () => {
  test('목록은 기본 + 본인 것만', async () => {
    prisma.ledgerCategory.findMany.mockResolvedValue([]);
    await request(app(10)).get('/ledger/categories');
    expect(prisma.ledgerCategory.findMany.mock.calls[0][0].where).toEqual({ OR: [{ userId: null }, { userId: 10 }] });
  });
  test('생성하면 본인 소유(userId)로 저장', async () => {
    prisma.ledgerCategory.create.mockResolvedValue({ id: 3 });
    await request(app(10)).post('/ledger/categories').send({ name: '취미', type: 'expense' });
    expect(prisma.ledgerCategory.create.mock.calls[0][0].data.userId).toBe(10);
  });
  test('타인의 개인 카테고리 수정 → 403', async () => {
    prisma.ledgerCategory.findUnique.mockResolvedValue({ id: 3, userId: 99 });
    const res = await request(app(10)).put('/ledger/categories/3').send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(prisma.ledgerCategory.update).not.toHaveBeenCalled();
  });
  test('시스템 기본 카테고리는 일반 사용자 수정 불가 → 403, 관리자는 가능', async () => {
    prisma.ledgerCategory.findUnique.mockResolvedValue({ id: 1, userId: null });
    expect((await request(app(10)).put('/ledger/categories/1').send({ name: 'x' })).status).toBe(403);
    prisma.ledgerCategory.update.mockResolvedValue({ id: 1 });
    expect((await request(app(1, 'admin')).put('/ledger/categories/1').send({ name: 'x' })).status).toBe(200);
  });
  test('없는 카테고리 → 404', async () => {
    prisma.ledgerCategory.findUnique.mockResolvedValue(null);
    expect((await request(app()).delete('/ledger/categories/5')).status).toBe(404);
  });
});

describe('deleteCategory 가드', () => {
  beforeEach(() => {
    prisma.ledgerCategory.findUnique.mockResolvedValue({ id: 5, userId: 10 });
    prisma.ledgerRecurring.count.mockResolvedValue(0);
  });
  test('거래 내역이 있으면 삭제 불가 → 400', async () => {
    prisma.ledgerEntry.count.mockResolvedValue(3);
    const res = await request(app()).delete('/ledger/categories/5');
    expect(res.status).toBe(400);
    expect(prisma.ledgerCategory.delete).not.toHaveBeenCalled();
  });
  test('반복 거래가 쓰는 카테고리는 삭제 불가 → 400', async () => {
    prisma.ledgerEntry.count.mockResolvedValue(0);
    prisma.ledgerRecurring.count.mockResolvedValue(1);
    expect((await request(app()).delete('/ledger/categories/5')).status).toBe(400);
  });
  test('거래 내역이 없으면 삭제 → 200', async () => {
    prisma.ledgerEntry.count.mockResolvedValue(0);
    prisma.ledgerCategory.delete.mockResolvedValue({});
    const res = await request(app()).delete('/ledger/categories/5');
    expect(res.status).toBe(200);
  });
});

describe('예산 — 본인 것만', () => {
  test('필수값 누락 → 400', async () => {
    const res = await request(app()).post('/ledger/budgets').send({ categoryId: 1, year: 2026 });
    expect(res.status).toBe(400);
  });
  test('upsert 키에 소유자(userId) 포함', async () => {
    prisma.ledgerBudget.upsert.mockResolvedValue({ id: 1 });
    await request(app(10)).post('/ledger/budgets').send({ categoryId: 1, year: 2026, month: 7, amount: 100000 });
    const arg = prisma.ledgerBudget.upsert.mock.calls[0][0];
    expect(arg.where.userId_categoryId_year_month).toEqual({ userId: 10, categoryId: 1, year: 2026, month: 7 });
    expect(arg.create.userId).toBe(10);
  });
  test('목록은 userId = 본인', async () => {
    prisma.ledgerBudget.findMany.mockResolvedValue([]);
    await request(app(10)).get('/ledger/budgets?year=2026&month=7');
    expect(prisma.ledgerBudget.findMany.mock.calls[0][0].where.userId).toBe(10);
  });
  test('타인 예산 삭제 → 404', async () => {
    prisma.ledgerBudget.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app(10)).delete('/ledger/budgets/9');
    expect(res.status).toBe(404);
    expect(prisma.ledgerBudget.deleteMany).toHaveBeenCalledWith({ where: { id: 9, userId: 10 } });
  });
});

describe('반복 거래 — 본인 것만', () => {
  test('목록은 createdBy = 본인', async () => {
    prisma.ledgerRecurring.findMany.mockResolvedValue([]);
    await request(app(10)).get('/ledger/recurrings');
    expect(prisma.ledgerRecurring.findMany.mock.calls[0][0].where.createdBy).toBe(10);
  });
  test('타인 반복거래 수정/삭제 → 404', async () => {
    prisma.ledgerRecurring.findFirst.mockResolvedValue(null);
    expect((await request(app(10)).put('/ledger/recurrings/4').send({ amount: 1 })).status).toBe(404);
    prisma.ledgerRecurring.deleteMany.mockResolvedValue({ count: 0 });
    expect((await request(app(10)).delete('/ledger/recurrings/4')).status).toBe(404);
    expect(prisma.ledgerRecurring.update).not.toHaveBeenCalled();
  });
});

describe('applyRecurring (반복거래 자동 생성)', () => {
  test('본인 반복거래만 대상으로 조회', async () => {
    prisma.ledgerRecurring.findMany.mockResolvedValue([]);
    await request(app(10)).post('/ledger/recurrings/apply').send({ year: 2026, month: 7 });
    expect(prisma.ledgerRecurring.findMany.mock.calls[0][0].where).toEqual({ isActive: true, createdBy: 10 });
  });

  test('이미 해당 월에 생성된 항목은 스킵', async () => {
    prisma.ledgerRecurring.findMany.mockResolvedValue([
      { id: 1, type: 'expense', amount: 5000, categoryId: 2, dayOfMonth: 15, memo: '월세' },
      { id: 2, type: 'income', amount: 3000000, categoryId: 1, dayOfMonth: 25, memo: '급여' },
    ]);
    // rec1은 이미 존재(스킵), rec2는 없음(생성)
    prisma.ledgerEntry.findFirst.mockImplementation(async ({ where }) =>
      where.recurringId === 1 ? { id: 99 } : null);
    prisma.ledgerEntry.create.mockResolvedValue({});
    const res = await request(app()).post('/ledger/recurrings/apply').send({ year: 2026, month: 7 });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(1);
  });

  test('dayOfMonth 31이 2월이면 월말(28/29)로 보정', async () => {
    prisma.ledgerRecurring.findMany.mockResolvedValue([
      { id: 1, type: 'expense', amount: 1000, categoryId: 2, dayOfMonth: 31, memo: 'x' },
    ]);
    prisma.ledgerEntry.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.create.mockResolvedValue({});
    const res = await request(app()).post('/ledger/recurrings/apply').send({ year: 2026, month: 2 });
    expect(res.status).toBe(200);
    const createdDate = prisma.ledgerEntry.create.mock.calls[0][0].data.date;
    // 2026-02는 28일까지 → day가 28로 보정
    expect(createdDate.getDate()).toBe(28);
  });
});

describe('summary 잔액 계산', () => {
  test('이번 달 수입-지출 = balance, 모든 집계는 본인 거래/예산만', async () => {
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);
    prisma.ledgerCategory.findMany.mockResolvedValue([]);
    prisma.ledgerBudget.findMany.mockResolvedValue([]);
    const res = await request(app(10)).get('/ledger/summary?year=2026&month=7');
    expect(res.status).toBe(200);
    expect(res.body.thisMonth).toHaveProperty('balance');
    expect(res.body.monthlyData).toHaveLength(12);
    prisma.ledgerEntry.aggregate.mock.calls.forEach(([arg]) => expect(arg.where.createdBy).toBe(10));
    expect(prisma.ledgerEntry.groupBy.mock.calls[0][0].where.createdBy).toBe(10);
    expect(prisma.ledgerBudget.findMany.mock.calls[0][0].where.userId).toBe(10);
  });
});
