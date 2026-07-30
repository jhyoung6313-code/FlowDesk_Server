/**
 * chatController 단위 테스트 (F-38/39 채팅)
 * 멤버십 권한 게이트, DM 중복방지, 전달 시 비멤버 방 제외, 메시지 소유권,
 * 검색 시 멤버 방 제한(P1 회귀)을 검증.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    chatRoom: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    chatRoomMember: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn(), findFirst: jest.fn() },
    chatMessage: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    chatMessageReaction: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/chatController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/chat/rooms/:id/messages', ctrl.getMessages);
  a.post('/chat/rooms', ctrl.createRoom);
  a.put('/chat/messages/:id', ctrl.editMessage);
  a.post('/chat/messages/:id/forward', ctrl.forwardMessage);
  a.get('/chat/search', ctrl.searchMessages);
  a.post('/chat/rooms/:id/members', ctrl.addMember);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('GET messages (멤버십 게이트)', () => {
  test('멤버가 아니면 → 403', async () => {
    prisma.chatRoomMember.findUnique.mockResolvedValue(null);
    const res = await request(app('member', 10)).get('/chat/rooms/1/messages');
    expect(res.status).toBe(403);
  });
  test('멤버면 메시지 반환 + 읽음 갱신', async () => {
    prisma.chatRoomMember.findUnique.mockResolvedValue({ roomId: 1, userId: 10 });
    prisma.chatMessage.findMany.mockResolvedValue([{ id: 2 }, { id: 1 }]);
    prisma.chatRoomMember.update.mockResolvedValue({});
    const res = await request(app('member', 10)).get('/chat/rooms/1/messages');
    expect(res.status).toBe(200);
    // reverse() 되어 오름차순
    expect(res.body.map((m) => m.id)).toEqual([1, 2]);
    expect(prisma.chatRoomMember.update).toHaveBeenCalled();
  });
});

describe('POST rooms (DM 중복 방지)', () => {
  test('1:1 방이 이미 있으면 기존 방 반환(새로 생성 안 함)', async () => {
    prisma.chatRoom.findFirst.mockResolvedValue({ id: 7, type: 'direct', members: [] });
    prisma.chatRoomMember.findUnique.mockResolvedValue({ lastReadAt: new Date(0), isFavorite: false });
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    prisma.chatMessage.count.mockResolvedValue(0);
    const res = await request(app('member', 10)).post('/chat/rooms').send({ type: 'direct', memberIds: [20] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(7);
    expect(prisma.chatRoom.create).not.toHaveBeenCalled();
  });
  test('DM에 상대 지정 안 하면 → 400', async () => {
    const res = await request(app('member', 10)).post('/chat/rooms').send({ type: 'direct', memberIds: [] });
    expect(res.status).toBe(400);
  });
  test('그룹 채널 이름 없으면 → 400', async () => {
    const res = await request(app('member', 10)).post('/chat/rooms').send({ type: 'group', memberIds: [20] });
    expect(res.status).toBe(400);
  });
});

describe('editMessage (소유권)', () => {
  test('타인 메시지 수정 → 403', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({ id: 1, senderId: 99 });
    const res = await request(app('member', 10)).put('/chat/messages/1').send({ content: '변경' });
    expect(res.status).toBe(403);
  });
});

describe('forwardMessage (비멤버 방 제외)', () => {
  test('멤버가 아닌 대상 방은 건너뜀', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({ id: 1, content: '원본', roomId: 5 });
    // 방 20은 멤버, 방 30은 비멤버
    prisma.chatRoomMember.findUnique.mockImplementation(async ({ where }) =>
      where.roomId_userId.roomId === 20 ? { roomId: 20, userId: 10 } : null);
    prisma.chatMessage.create.mockResolvedValue({ id: 99, content: '원본' });
    const res = await request(app('member', 10)).post('/chat/messages/1/forward').send({ targetRoomIds: [20, 30] });
    expect(res.status).toBe(200);
    // 멤버인 방(20)만 생성
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(1);
  });
});

describe('searchMessages (멤버 방 제한 — P1 회귀)', () => {
  test('내가 멤버가 아닌 roomId로 검색 → 403', async () => {
    prisma.chatRoomMember.findMany.mockResolvedValue([{ roomId: 1 }, { roomId: 2 }]);
    const res = await request(app('member', 10)).get('/chat/search?q=비밀&roomId=99');
    expect(res.status).toBe(403);
  });
  test('roomId 미지정 시 내 방 전체에서 검색', async () => {
    prisma.chatRoomMember.findMany.mockResolvedValue([{ roomId: 1 }, { roomId: 2 }]);
    prisma.chatMessage.findMany.mockResolvedValue([]);
    const res = await request(app('member', 10)).get('/chat/search?q=안녕');
    expect(res.status).toBe(200);
    const where = prisma.chatMessage.findMany.mock.calls[0][0].where;
    expect(where.roomId).toEqual({ in: [1, 2] });
  });
});

describe('addMember (DM 방 방지)', () => {
  test('1:1 방에 멤버 추가 → 400', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue({ id: 1, type: 'direct', createdBy: 10 });
    const res = await request(app('member', 10)).post('/chat/rooms/1/members').send({ userIds: [20] });
    expect(res.status).toBe(400);
  });
});
