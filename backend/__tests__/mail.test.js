/**
 * mailController 단위 테스트 (F-54 사내 메일)
 * 발송 검증, 스레드 연결, 참여자 권한, 일괄 처리를 검증.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    internalMail: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    internalMailRecipient: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(), delete: jest.fn() },
    internalMailComment: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    internalMailLabel: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn() },
    internalMailLabelLink: { deleteMany: jest.fn(), createMany: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/sseService', () => ({ pushNotification: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/mailController');

function app(uid = 10, role = 'member') {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.post('/mail', ctrl.compose);
  a.post('/mail/:id/reply', ctrl.reply);
  a.get('/mail/:id/comments', ctrl.listComments);
  a.post('/mail/:id/comments', ctrl.createComment);
  a.post('/mail/bulk', ctrl.bulkAction);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.notification.create.mockResolvedValue({});
});

describe('POST /mail (compose)', () => {
  test('발송 시 수신자/제목 없으면 → 400', async () => {
    const res = await request(app()).post('/mail').send({ to: [], subject: '' });
    expect(res.status).toBe(400);
  });

  test('임시저장은 수신자 없어도 허용', async () => {
    prisma.internalMail.create.mockResolvedValue({ id: 1, recipients: [] });
    prisma.internalMail.update.mockResolvedValue({});
    const res = await request(app()).post('/mail').send({ isDraft: true, subject: '초안' });
    expect(res.status).toBe(200);
  });

  test('신규 메일은 자기 자신을 threadId로 설정', async () => {
    prisma.internalMail.create.mockResolvedValue({ id: 42, recipients: [] });
    prisma.internalMail.update.mockResolvedValue({});
    const res = await request(app()).post('/mail').send({ to: [20], subject: '안녕' });
    expect(res.status).toBe(200);
    expect(prisma.internalMail.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { threadId: 42 } });
    // 수신자에게 알림
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});

describe('POST /mail/:id/reply (답장 스레드 연결)', () => {
  test('원본의 threadId를 상속', async () => {
    // 원본 메일 조회 (compose 내부 srcId 조회)
    prisma.internalMail.findUnique.mockResolvedValue({ id: 5, threadId: 3 });
    prisma.internalMail.create.mockResolvedValue({ id: 8, recipients: [] });
    const res = await request(app()).post('/mail/5/reply').send({ to: [20], subject: 'Re: 안녕' });
    expect(res.status).toBe(200);
    const created = prisma.internalMail.create.mock.calls[0][0].data;
    expect(created.threadId).toBe(3);
    expect(created.parentId).toBe(5);
  });
});

describe('메일 댓글 참여자 권한', () => {
  test('참여자 아니면 댓글 목록 403', async () => {
    prisma.internalMail.findUnique.mockResolvedValue({ id: 1, fromUserId: 99, recipients: [] });
    const res = await request(app(10)).get('/mail/1/comments');
    expect(res.status).toBe(403);
  });
  test('수신자면 댓글 작성 가능', async () => {
    prisma.internalMail.findUnique.mockResolvedValue({ id: 1, fromUserId: 99, recipients: [{ userId: 10 }] });
    prisma.internalMailComment.create.mockResolvedValue({ id: 1, content: '확인' });
    const res = await request(app(10)).post('/mail/1/comments').send({ content: '확인' });
    expect(res.status).toBe(200);
  });
});

describe('POST /mail/bulk (일괄 처리)', () => {
  test('선택 없음 → 400', async () => {
    const res = await request(app()).post('/mail/bulk').send({ ids: [], action: 'read' });
    expect(res.status).toBe(400);
  });
  test('알 수 없는 action → 400', async () => {
    const res = await request(app()).post('/mail/bulk').send({ ids: [1, 2], action: 'nope' });
    expect(res.status).toBe(400);
  });
  test('read 액션 → 내 수신 레코드만 updateMany', async () => {
    prisma.internalMailRecipient.updateMany.mockResolvedValue({ count: 2 });
    const res = await request(app(10)).post('/mail/bulk').send({ ids: [1, 2], action: 'read' });
    expect(res.status).toBe(200);
    const call = prisma.internalMailRecipient.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 10, mailId: { in: [1, 2] } });
    expect(call.data.isRead).toBe(true);
  });
});
