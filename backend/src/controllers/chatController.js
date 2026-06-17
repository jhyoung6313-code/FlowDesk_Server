const fs = require('fs');
const path = require('path');

const prisma = require('../lib/prisma');

// Express 4: async 핸들러의 에러를 next()로 전달 (Node 15+ unhandledRejection 대비)
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

let io = null;
const setIO = (socketIO) => { io = socketIO; };

const ROOM_SELECT = {
  id: true,
  name: true,
  type: true,
  description: true,
  isArchived: true,
  announcement: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  members: {
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarColor: true, isActive: true, statusEmoji: true, statusText: true } },
    },
  },
};

const MSG_INCLUDE = {
  sender: { select: { id: true, displayName: true, avatarColor: true } },
  reactions: {
    include: { user: { select: { id: true, displayName: true } } },
  },
  forwardedFrom: {
    select: {
      id: true,
      content: true,
      sender: { select: { id: true, displayName: true } },
    },
  },
  _count: { select: { replies: true } },
};

// 내 채팅방 목록 + 읽지 않은 메시지 수
const getRooms = async (req, res) => {
  const userId = req.user.id;

  const memberships = await prisma.chatRoomMember.findMany({
    where: { userId },
    include: {
      room: {
        select: {
          ...ROOM_SELECT,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: { select: { id: true, displayName: true } } },
          },
        },
      },
    },
    orderBy: { room: { updatedAt: 'desc' } },
  });

  const result = await Promise.all(
    memberships.map(async (m) => {
      const lastReadAt = m.lastReadAt || new Date(0);
      const unread = await prisma.chatMessage.count({
        where: {
          roomId: m.roomId,
          createdAt: { gt: lastReadAt },
          isDeleted: false,
          senderId: { not: userId }, // 본인이 보낸 메시지는 안읽음으로 세지 않음
        },
      });
      return {
        ...m.room,
        unread,
        lastMessage: m.room.messages[0] || null,
        myLastReadAt: m.lastReadAt,
        isFavorite: m.isFavorite,
        isMuted: m.isMuted,
      };
    })
  );

  res.json(result);
};

// 공개 채널 목록 (내가 가입 안 한 것 포함)
const getPublicRooms = async (req, res) => {
  const userId = req.user.id;

  const myRoomIds = await prisma.chatRoomMember
    .findMany({ where: { userId }, select: { roomId: true } })
    .then((ms) => ms.map((m) => m.roomId));

  const rooms = await prisma.chatRoom.findMany({
    where: { type: 'public', isArchived: false },
    select: {
      ...ROOM_SELECT,
      _count: { select: { members: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json(rooms.map((r) => ({ ...r, joined: myRoomIds.includes(r.id) })));
};

// 채팅방 생성
const createRoom = async (req, res, next) => {
  try {
  const userId = req.user.id;
  const { type = 'direct', name, memberIds = [], description } = req.body;

  if (!['direct', 'group', 'public', 'private'].includes(type)) {
    return res.status(400).json({ error: '유효하지 않은 채팅방 유형입니다.' });
  }

  // memberIds가 배열이 아니면 배열로 변환, 유효한 숫자만 필터링
  const rawIds = Array.isArray(memberIds) ? memberIds : [memberIds];
  const validIds = rawIds.map(Number).filter((n) => !isNaN(n) && n > 0);
  const allMemberIds = [...new Set([userId, ...validIds])];

  if (type === 'direct') {
    if (allMemberIds.length !== 2) {
      return res.status(400).json({ error: '1:1 채팅은 상대방 1명을 지정해야 합니다.' });
    }
    const existing = await prisma.chatRoom.findFirst({
      where: {
        type: 'direct',
        AND: [
          { members: { some: { userId: allMemberIds[0] } } },
          { members: { some: { userId: allMemberIds[1] } } },
        ],
      },
      select: ROOM_SELECT,
    });
    if (existing) {
      // 기존 DM 방: 양쪽 소켓이 해당 룸에 join되어 있도록 보장
      if (io) {
        for (const memberId of allMemberIds) {
          io.to(`user:${memberId}`).socketsJoin(`room:${existing.id}`);
        }
      }
      // 현재 유저의 멤버십 정보와 마지막 메시지/읽지 않은 수를 함께 반환
      const membership = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId: existing.id, userId } },
      });
      const lastReadAt = membership?.lastReadAt || new Date(0);
      const [lastMsg, unread] = await Promise.all([
        prisma.chatMessage.findFirst({
          where: { roomId: existing.id, parentId: null },
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { id: true, displayName: true } } },
        }),
        prisma.chatMessage.count({
          where: { roomId: existing.id, isDeleted: false, createdAt: { gt: lastReadAt } },
        }),
      ]);
      return res.json({
        ...existing,
        unread,
        lastMessage: lastMsg || null,
        isFavorite: membership?.isFavorite || false,
        isMuted: membership?.isMuted || false,
      });
    }
  }

  if (['group', 'public', 'private'].includes(type) && !name?.trim()) {
    return res.status(400).json({ error: '채널 이름을 입력해주세요.' });
  }

  const room = await prisma.chatRoom.create({
    data: {
      name: type === 'direct' ? null : name.trim(),
      type,
      description: description?.trim() || null,
      createdBy: userId,
      members: {
        create: (type === 'public' ? [userId] : allMemberIds).map((uid) => ({ userId: uid })),
      },
    },
    select: ROOM_SELECT,
  });

  if (io) {
    // 모든 멤버의 소켓을 해당 룸에 즉시 join (타이밍 이슈 방지)
    for (const memberId of allMemberIds) {
      io.to(`user:${memberId}`).socketsJoin(`room:${room.id}`);
    }

    // 생성자 제외 나머지 멤버에게 새 채팅방 알림
    const otherMemberIds = allMemberIds.filter((id) => id !== userId);
    for (const memberId of otherMemberIds) {
      io.to(`user:${memberId}`).emit('room-created', {
        ...room,
        unread: 0,
        isFavorite: false,
        isMuted: false,
      });
    }
  }

  res.status(201).json({
    ...room,
    unread: 0,
    lastMessage: null,
    isFavorite: false,
    isMuted: false,
  });
  } catch (err) { next(err); }
};

// 공개 채널 참여
const joinPublicRoom = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room || room.type !== 'public') return res.status(400).json({ error: '공개 채널이 아닙니다.' });

  await prisma.chatRoomMember.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: {},
  });

  const updated = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: ROOM_SELECT });
  res.json(updated);
};

// 채팅방 정보 수정
const updateRoom = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const { name, description } = req.body;

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: '채팅방이 없습니다.' });
  if (room.createdBy !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  const updated = await prisma.chatRoom.update({
    where: { id: roomId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description.trim() || null } : {}),
    },
    select: ROOM_SELECT,
  });

  res.json(updated);
};

// 채팅방 보관 토글
const toggleArchive = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: '채팅방이 없습니다.' });
  if (room.createdBy !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  const updated = await prisma.chatRoom.update({
    where: { id: roomId },
    data: { isArchived: !room.isArchived },
    select: ROOM_SELECT,
  });

  res.json(updated);
};

// 즐겨찾기 토글 (개인)
const toggleFavorite = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) return res.status(403).json({ error: '채팅방 멤버가 아닙니다.' });

  const updated = await prisma.chatRoomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { isFavorite: !membership.isFavorite },
  });

  res.json({ isFavorite: updated.isFavorite });
};

// 음소거 토글 (개인)
const toggleMute = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) return res.status(403).json({ error: '채팅방 멤버가 아닙니다.' });

  const updated = await prisma.chatRoomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { isMuted: !membership.isMuted },
  });

  res.json({ isMuted: updated.isMuted });
};

// 채팅방 메시지 목록 (페이지네이션)
const getMessages = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const { before, limit = 50, parentId } = req.query;

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) return res.status(403).json({ error: '채팅방 멤버가 아닙니다.' });

  const where = { roomId, parentId: parentId ? Number(parentId) : null };
  if (before) where.id = { lt: Number(before) };

  const messages = await prisma.chatMessage.findMany({
    where,
    include: MSG_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });

  await prisma.chatRoomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { lastReadAt: new Date() },
  });

  res.json(messages.reverse());
};

// 스레드 메시지 (특정 메시지의 답글)
const getThread = async (req, res) => {
  const userId = req.user.id;
  const messageId = Number(req.params.id);

  const parent = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!parent) return res.status(404).json({ error: '메시지가 없습니다.' });

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId: parent.roomId, userId } },
  });
  if (!membership) return res.status(403).json({ error: '채팅방 멤버가 아닙니다.' });

  const [parentMsg, replies] = await Promise.all([
    prisma.chatMessage.findUnique({ where: { id: messageId }, include: MSG_INCLUDE }),
    prisma.chatMessage.findMany({
      where: { parentId: messageId },
      include: MSG_INCLUDE,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  res.json({ parent: parentMsg, replies });
};

// 읽음 처리
const markRead = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const now = new Date();

  await prisma.chatRoomMember.updateMany({
    where: { roomId, userId },
    data: { lastReadAt: now },
  });

  if (io) io.to(`room:${roomId}`).emit('user-read', { roomId, userId, lastReadAt: now.toISOString() });
  res.json({ ok: true });
};

// 읽지 않음 표시
const markUnread = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const { messageId } = req.body;

  const msg = await prisma.chatMessage.findUnique({ where: { id: Number(messageId) } });
  if (!msg) return res.status(404).json({ error: '메시지가 없습니다.' });

  await prisma.chatRoomMember.updateMany({
    where: { roomId, userId },
    data: {
      lastReadAt: new Date(msg.createdAt.getTime() - 1),
      lastUnreadAt: msg.createdAt,
    },
  });

  res.json({ ok: true });
};

// 메시지 수정
const editMessage = async (req, res) => {
  const userId = req.user.id;
  const messageId = Number(req.params.id);
  const { content } = req.body;

  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) return res.status(404).json({ error: '메시지가 없습니다.' });
  if (msg.senderId !== userId) return res.status(403).json({ error: '본인 메시지만 수정할 수 있습니다.' });

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: MSG_INCLUDE,
  });

  res.json(updated);
};

// 메시지 삭제
const deleteMessage = async (req, res) => {
  const userId = req.user.id;
  const messageId = Number(req.params.id);

  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) return res.status(404).json({ error: '메시지가 없습니다.' });
  if (msg.senderId !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { isDeleted: true, content: '' },
  });

  res.json({ ok: true });
};

// 이모지 반응 추가/토글
const toggleReaction = async (req, res) => {
  const userId = req.user.id;
  const messageId = Number(req.params.id);
  const { emoji } = req.body;

  if (!emoji) return res.status(400).json({ error: '이모지를 입력해주세요.' });

  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) return res.status(404).json({ error: '메시지가 없습니다.' });

  const existing = await prisma.chatMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });

  if (existing) {
    await prisma.chatMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.chatMessageReaction.create({ data: { messageId, userId, emoji } });
  }

  const reactions = await prisma.chatMessageReaction.findMany({
    where: { messageId },
    include: { user: { select: { id: true, displayName: true } } },
  });

  res.json({ messageId, reactions, removed: !!existing });
};

// 고정 메시지 목록
const getPinnedMessages = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) return res.status(403).json({ error: '채팅방 멤버가 아닙니다.' });

  const pinned = await prisma.chatPinnedMessage.findMany({
    where: { roomId },
    include: {
      message: { include: MSG_INCLUDE },
      pinner: { select: { id: true, displayName: true } },
    },
    orderBy: { pinnedAt: 'desc' },
  });

  res.json(pinned);
};

// 메시지 고정/해제
const togglePin = async (req, res) => {
  const userId = req.user.id;
  const messageId = Number(req.params.id);

  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) return res.status(404).json({ error: '메시지가 없습니다.' });

  const existing = await prisma.chatPinnedMessage.findUnique({
    where: { roomId_messageId: { roomId: msg.roomId, messageId } },
  });

  if (existing) {
    await prisma.chatPinnedMessage.delete({ where: { id: existing.id } });
    res.json({ pinned: false, messageId });
  } else {
    await prisma.chatPinnedMessage.create({
      data: { roomId: msg.roomId, messageId, pinnedBy: userId },
    });
    res.json({ pinned: true, messageId });
  }
};

// 저장 메시지 목록
const getSavedMessages = async (req, res) => {
  const userId = req.user.id;

  const saved = await prisma.chatSavedMessage.findMany({
    where: { userId },
    include: {
      message: {
        include: {
          ...MSG_INCLUDE,
          room: { select: { id: true, name: true, type: true } },
        },
      },
    },
    orderBy: { savedAt: 'desc' },
  });

  res.json(saved);
};

// 메시지 저장/취소
const toggleSave = async (req, res) => {
  const userId = req.user.id;
  const messageId = Number(req.params.id);

  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) return res.status(404).json({ error: '메시지가 없습니다.' });

  const existing = await prisma.chatSavedMessage.findUnique({
    where: { userId_messageId: { userId, messageId } },
  });

  if (existing) {
    await prisma.chatSavedMessage.delete({ where: { id: existing.id } });
    res.json({ saved: false, messageId });
  } else {
    await prisma.chatSavedMessage.create({ data: { userId, messageId } });
    res.json({ saved: true, messageId });
  }
};

// 메시지 전달
const forwardMessage = async (req, res) => {
  const userId = req.user.id;
  const messageId = Number(req.params.id);
  const { targetRoomIds = [] } = req.body;

  const orig = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!orig) return res.status(404).json({ error: '메시지가 없습니다.' });

  const results = [];
  for (const roomId of targetRoomIds.map(Number)) {
    const membership = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!membership) continue;

    const newMsg = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId: userId,
        content: orig.content,
        fileUrl: orig.fileUrl,
        fileName: orig.fileName,
        fileType: orig.fileType,
        fileSize: orig.fileSize,
        forwardedFromId: messageId,
      },
      include: MSG_INCLUDE,
    });
    results.push(newMsg);

    // 해당 방 멤버에게 실시간 전달
    if (io) io.to(`room:${roomId}`).emit('new-message', newMsg);
  }

  res.json(results);
};

// 메시지 검색
const searchMessages = async (req, res) => {
  const userId = req.user.id;
  const { q, roomId, limit = 30 } = req.query;

  if (!q?.trim()) return res.status(400).json({ error: '검색어를 입력해주세요.' });

  const myRoomIds = await prisma.chatRoomMember
    .findMany({ where: { userId }, select: { roomId: true } })
    .then((ms) => ms.map((m) => m.roomId));

  const where = {
    roomId: roomId ? Number(roomId) : { in: myRoomIds },
    isDeleted: false,
    content: { contains: q.trim(), mode: 'insensitive' },
  };

  const messages = await prisma.chatMessage.findMany({
    where,
    include: {
      ...MSG_INCLUDE,
      room: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });

  res.json(messages);
};

// 그룹방 멤버 추가
const addMember = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const { userIds = [] } = req.body;

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: '채팅방이 없습니다.' });
  if (room.type === 'direct') return res.status(400).json({ error: '1:1 채팅은 멤버를 추가할 수 없습니다.' });
  if (room.createdBy !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  for (const uid of userIds.map(Number)) {
    await prisma.chatRoomMember.upsert({
      where: { roomId_userId: { roomId, userId: uid } },
      create: { roomId, userId: uid },
      update: {},
    });
  }

  const updated = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: ROOM_SELECT });

  if (io) {
    for (const uid of userIds.map(Number)) {
      // 새 멤버 소켓을 즉시 룸에 join
      io.to(`user:${uid}`).socketsJoin(`room:${roomId}`);
      // 새 멤버에게 채팅방 정보 전달
      io.to(`user:${uid}`).emit('room-created', {
        ...updated,
        unread: 0,
        isFavorite: false,
        isMuted: false,
      });
    }
  }

  res.json(updated);
};

// 채팅방 나가기
const leaveRoom = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: '채팅방이 없습니다.' });

  await prisma.chatRoomMember.deleteMany({ where: { roomId, userId } });

  // 방장이 나갈 경우, 남은 멤버 중 가장 먼저 가입한 사람에게 위임
  if (room.type !== 'direct' && room.createdBy === userId) {
    const next = await prisma.chatRoomMember.findFirst({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
    });
    if (next) {
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { createdBy: next.userId },
      });
    }
  }

  res.json({ ok: true });
};

// 파일 업로드
const uploadFile = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: '채팅방 멤버가 아닙니다.' });
  }

  const file = req.file;
  if (!file) return res.status(400).json({ error: '파일이 없습니다.' });

  res.json({
    fileUrl: `/uploads/chat/${file.filename}`,
    fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    fileType: file.mimetype,
    fileSize: file.size,
  });
};

// 링크 미리보기
const getLinkPreview = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' });
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: '유효하지 않은 URL입니다.' }); }
  try {
    const https = require('https'), http = require('http');
    const mod = parsed.protocol === 'https:' ? https : http;
    const html = await new Promise((resolve, reject) => {
      const r = mod.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TaskManager/1.0)' } }, (resp) => {
        if (resp.statusCode >= 400) { resolve(''); return; }
        resp.setEncoding('utf8');
        let data = '';
        resp.on('data', (c) => { data += c; if (data.length > 80000) resp.destroy(); });
        resp.on('end', () => resolve(data));
        resp.on('error', reject);
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    });
    const get = (...pats) => { for (const p of pats) { const m = html.match(p); if (m?.[1]) return m[1].trim(); } return ''; };
    const title = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i, /<title[^>]*>([^<]+)<\/title>/i);
    const description = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const image = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    res.json({ url, title, description, image, domain: parsed.hostname });
  } catch { res.json({ url, title: '', description: '', image: '', domain: parsed.hostname }); }
};

// 채널 공지 설정
const setAnnouncement = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const { announcement } = req.body;
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: '채팅방이 없습니다.' });
  if (room.createdBy !== userId && req.user.role !== 'admin') return res.status(403).json({ error: '권한이 없습니다.' });
  const updated = await prisma.chatRoom.update({
    where: { id: roomId },
    data: { announcement: announcement?.trim() || null },
    select: { id: true, announcement: true },
  });
  if (io) io.to(`room:${roomId}`).emit('announcement-updated', { roomId, announcement: updated.announcement });
  res.json(updated);
};

// 예약 발송 생성
const createScheduledMessage = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const { content, scheduledAt } = req.body;
  if (!content || !scheduledAt) return res.status(400).json({ error: '내용과 발송 시간이 필요합니다.' });
  const membership = await prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!membership) return res.status(403).json({ error: '채팅방 멤버가 아닙니다.' });
  const msg = await prisma.scheduledChatMessage.create({
    data: { roomId, senderId: userId, content, scheduledAt: new Date(scheduledAt) },
  });
  res.json(msg);
};

// 예약 발송 목록
const listScheduledMessages = async (req, res) => {
  const userId = req.user.id;
  const roomId = Number(req.params.id);
  const msgs = await prisma.scheduledChatMessage.findMany({
    where: { roomId, senderId: userId, sent: false },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json(msgs);
};

// 예약 발송 취소
const cancelScheduledMessage = async (req, res) => {
  const userId = req.user.id;
  const msgId = Number(req.params.msgId);
  const msg = await prisma.scheduledChatMessage.findUnique({ where: { id: msgId } });
  if (!msg || msg.senderId !== userId) return res.status(403).json({ error: '권한이 없습니다.' });
  await prisma.scheduledChatMessage.delete({ where: { id: msgId } });
  res.json({ ok: true });
};

module.exports = {
  setIO,
  getRooms: wrap(getRooms),
  getPublicRooms: wrap(getPublicRooms),
  createRoom: wrap(createRoom),
  joinPublicRoom: wrap(joinPublicRoom),
  updateRoom: wrap(updateRoom),
  toggleArchive: wrap(toggleArchive),
  toggleFavorite: wrap(toggleFavorite),
  toggleMute: wrap(toggleMute),
  getMessages: wrap(getMessages),
  getThread: wrap(getThread),
  markRead: wrap(markRead),
  markUnread: wrap(markUnread),
  editMessage: wrap(editMessage),
  deleteMessage: wrap(deleteMessage),
  toggleReaction: wrap(toggleReaction),
  getPinnedMessages: wrap(getPinnedMessages),
  togglePin: wrap(togglePin),
  getSavedMessages: wrap(getSavedMessages),
  toggleSave: wrap(toggleSave),
  forwardMessage: wrap(forwardMessage),
  searchMessages: wrap(searchMessages),
  addMember: wrap(addMember),
  leaveRoom: wrap(leaveRoom),
  uploadFile: wrap(uploadFile),
  getLinkPreview: wrap(getLinkPreview),
  setAnnouncement: wrap(setAnnouncement),
  createScheduledMessage: wrap(createScheduledMessage),
  listScheduledMessages: wrap(listScheduledMessages),
  cancelScheduledMessage: wrap(cancelScheduledMessage),
};
