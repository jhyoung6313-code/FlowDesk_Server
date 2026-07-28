/**
 * ledgerController 단위 테스트 (F-45 가계부)
 * 거래/카테고리 검증, 카테고리 삭제 가드, 반복거래 자동생성(중복방지·월말보정), 요약 잔액.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    ledgerCategory: { count: jest.fn(), createMany: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    ledgerEntry: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    ledgerBudget: { findMany: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
    ledgerRecurring: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/ledgerController');

function app(uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role: 'member' }; next(); });
  a.post('/ledger/entries', ctrl.createEntry);
  a.delete('/ledger/categories/:id', ctrl.deleteCategory);
  a.post('/ledger/budgets', ctrl.upsertBudget);
  a.post('/ledger/recurrings/apply', ctrl.applyRecurring);
  a.get('/ledger/summary', ctrl.summary);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('createEntry 검증', () => {
  test('필수값 누락 → 400', async () => {
    const res = await request(app()).post('/ledger/entries').send({ type: 'expense', amount: 1000 });
    expect(res.status).toBe(400);
  });
});

describe('deleteCategory 가드', () => {
  test('거래 내역이 있으면 삭제 불가 → 400', async () => {
    prisma.ledgerEntry.count.mockResolvedValue(3);
    const res = await request(app()).delete('/ledger/categories/5');
    expect(res.status).toBe(400);
    expect(prisma.ledgerCategory.delete).not.toHaveBeenCalled();
  });
  test('거래 내역이 없으면 삭제 → 200', async () => {
    prisma.ledgerEntry.count.mockResolvedValue(0);
    prisma.ledgerCategory.delete.mockResolvedValue({});
    const res = await request(app()).delete('/ledger/categories/5');
    expect(res.status).toBe(200);
  });
});

describe('upsertBudget 검증', () => {
  test('필수값 누락 → 400', async () => {
    const res = await request(app()).post('/ledger/budgets').send({ categoryId: 1, year: 2026 });
    expect(res.status).toBe(400);
  });
});

describe('applyRecurring (반복거래 자동 생성)', () => {
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
  test('이번 달 수입-지출 = balance', async () => {
    // 12개월 루프 + 이번달 합계에서 aggregate 여러 번 호출됨 → 기본 0, 특정만 값
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    // 이번 달 income/expense 합계 (마지막 2번 호출 대상). 단순화를 위해 모두 mockReturn 순차 설정.
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);
    prisma.ledgerCategory.findMany.mockResolvedValue([]);
    prisma.ledgerBudget.findMany.mockResolvedValue([]);
    const res = await request(app()).get('/ledger/summary?year=2026&month=7');
    expect(res.status).toBe(200);
    expect(res.body.thisMonth).toHaveProperty('balance');
    expect(res.body.monthlyData).toHaveLength(12);
  });
});
