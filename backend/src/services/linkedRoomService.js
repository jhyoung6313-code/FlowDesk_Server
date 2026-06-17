// 보드/런 등 기능 엔티티에 연결된 전용 채팅방을 관리하는 공용 서비스.
// - 엔티티 이름으로 그룹방을 보장(없으면 생성)하고
// - 업데이트 발생 시 행위자 명의로 시스템 메시지를 발송한다.
// 채팅 안읽음 카운트는 기존 채팅 로직(소켓 new-message)으로 자연히 증가한다.

const prisma = require('../lib/prisma');

let _io = null;
const setIO = (io) => { _io = io; };

const ROOM_SELECT = {
  id: true, name: true, type: true, description: true,
  isArchived: true, announcement: true, createdBy: true,
  createdAt: true, updatedAt: true,
  members: {
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarColor: true, isActive: true, statusEmoji: true, statusText: true } },
    },
  },
};

const ROOM_NAME_MAX = 100;
const cleanIds = (ids) => [...new Set((ids || []).filter((n) => Number.isInteger(n) && n > 0))];

// 멤버 소켓을 방에 join시키고 room-created 알림 전송 (프론트 store에 방 추가용)
async function announceRoomToMember(roomId, userId) {
  if (!_io) return;
  const full = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: ROOM_SELECT });
  if (!full) return;
  _io.to(`user:${userId}`).socketsJoin(`room:${roomId}`);
  _io.to(`user:${userId}`).emit('room-created', { ...full, unread: 0, isFavorite: false, isMuted: false });
}

// 그룹방 생성 + 멤버 등록 + 소켓 join + room-created 알림. 반환: roomId
async function createGroupRoom({ name, memberIds, createdBy }) {
  const ids = cleanIds([createdBy, ...(memberIds || [])]);
  const room = await prisma.chatRoom.create({
    data: {
      name: (name || '채팅').slice(0, ROOM_NAME_MAX),
      type: 'group',
      createdBy,
      members: { create: ids.map((uid) => ({ userId: uid })) },
    },
    select: { id: true },
  });
  for (const uid of ids) await announceRoomToMember(room.id, uid);
  return room.id;
}

// 방 이름/멤버 동기화: 이름 변경 반영, 누락된 멤버 추가
async function syncRoom({ roomId, name, memberIds }) {
  if (!roomId) return;
  try {
    const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { id: true, name: true } });
    if (!room) return;
    if (name && name.slice(0, ROOM_NAME_MAX) !== room.name) {
      await prisma.chatRoom.update({ where: { id: roomId }, data: { name: name.slice(0, ROOM_NAME_MAX) } });
    }
    const ids = cleanIds(memberIds);
    if (ids.length) {
      const existing = await prisma.chatRoomMember.findMany({ where: { roomId }, select: { userId: true } });
      const have = new Set(existing.map((m) => m.userId));
      for (const uid of ids.filter((id) => !have.has(id))) {
        await prisma.chatRoomMember.create({ data: { roomId, userId: uid } });
        await announceRoomToMember(roomId, uid);
      }
    }
  } catch { /* 조용히 실패 */ }
}

// 행위자 명의의 시스템 메시지 발송 + new-message 브로드캐스트
async function postMessage({ roomId, content, senderId }) {
  if (!roomId || !content || !senderId) return;
  try {
    const msg = await prisma.chatMessage.create({
      data: { roomId, senderId, content },
      include: {
        sender: { select: { id: true, displayName: true, avatarColor: true } },
        _count: { select: { replies: true } },
      },
    });
    if (_io) _io.to(`room:${roomId}`).emit('new-message', msg);
    return msg;
  } catch { /* 조용히 실패 */ }
}

module.exports = { setIO, createGroupRoom, syncRoom, postMessage };
