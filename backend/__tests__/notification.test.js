/**
 * notificationController 테스트 — 목록 필터(삭제 업무 제외)·읽음=소프트삭제·전체읽음.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = { notification: { findMany: jest.fn(), updateMany: jest.fn() } };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/sseService', () => ({ addClient: jest.fn(), removeClient: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/notificationController');

function app(uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role: 'member' }; next(); });
  a.get('/notifications', ctrl.list);
  a.post('/notifications/:id/read', ctrl.read);
  a.post('/notifications/read-all', ctrl.readAll);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /notifications', () => {
  test('본인 것 + 삭제되지 않은 업무 연동 알림만(where 확인)', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await request(app(10)).get('/notifications');
    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(10);
    expect(where.delYn).toBe('0');
    expect(where.OR).toEqual([{ taskId: null }, { task: { delYn: '0' } }]);
  });
});

describe('POST /notifications/:id/read', () => {
  test('읽음 시 isRead=true + delYn=1 (본인 것만)', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app(10)).post('/notifications/5/read');
    expect(res.status).toBe(200);
    const call = prisma.notification.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 5, userId: 10 });
    expect(call.data).toEqual({ isRead: true, delYn: '1' });
  });
});

describe('POST /notifications/read-all', () => {
  test('안읽은 것 전체 읽음 처리', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    const res = await request(app(10)).post('/notifications/read-all');
    expect(res.status).toBe(200);
    const call = prisma.notification.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 10, isRead: false, delYn: '0' });
  });
});
