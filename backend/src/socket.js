const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const prisma = require('./lib/prisma');
const userCache = require('./lib/userCache');

// REDIS_URL이 설정된 경우에만 Redis adapter를 붙여 멀티 인스턴스(수평 확장)를 지원한다.
// 설정이 없으면 기존처럼 단일 프로세스 인메모리 어댑터로 동작 — 폐쇄망에 Redis를 아직
// 준비하지 못한 환경에서도 그대로 돌아간다.
// 주의(알려진 한계): onlineUsers Map과 kickUserSockets()의 중복 로그인 차단은 여전히
// "이 프로세스가 들고 있는 소켓"만 추적한다. Redis adapter는 방(room) 브로드캐스트를
// 인스턴스 간에 전파해주지만, 동일 유저가 다른 인스턴스로 다시 로그인했을 때 그 인스턴스의
// 소켓까지 강제 종료하려면 presence 저장소 자체를 Redis로 옮기는 추가 작업이 필요하다.
// 멀티 인스턴스로 실제 운영하기 전에는 별도로 이 부분을 완성해야 한다.
async function attachRedisAdapter(io) {
  if (!process.env.REDIS_URL) return;
  const { createAdapter } = require('@socket.io/redis-adapter');
  const { Redis } = require('ioredis');

  const pubClient = new Redis(process.env.REDIS_URL);
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => console.error('[socket] Redis pub 오류:', err.message));
  subClient.on('error', (err) => console.error('[socket] Redis sub 오류:', err.message));

  io.adapter(createAdapter(pubClient, subClient));
  console.log('[socket] Redis adapter 연결됨 — 멀티 인스턴스 브로드캐스트 활성화');
}

// 접속 중인 userId → Set<socketId>
const onlineUsers = new Map();

// io 인스턴스 (setupSocketIO 호출 후 설정)
let _io = null;
const getIO = () => _io;

// 특정 유저의 모든 소켓에 session-replaced 이벤트 발송 후 연결 해제
function kickUserSockets(userId) {
  if (!_io) return;
  const socketIds = onlineUsers.get(userId);
  if (!socketIds) return;
  for (const sid of socketIds) {
    const s = _io.sockets.sockets.get(sid);
    if (s) {
      s.emit('session-replaced');
      s.disconnect(true);
    }
  }
}

// @username 멘션 파싱 → userId 배열 반환
async function parseMentions(content, roomId) {
  const mentions = [];
  const regex = /@(\w+)/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    mentions.push(m[1]);
  }
  if (!mentions.length) return [];

  const users = await prisma.user.findMany({
    where: { username: { in: mentions } },
    select: { id: true, username: true },
  });

  // 채널 멤버인지 확인
  const members = await prisma.chatRoomMember.findMany({
    where: { roomId, userId: { in: users.map((u) => u.id) } },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((m) => m.userId));

  return users.filter((u) => memberIds.has(u.id));
}

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
  room: { select: { type: true } },
};

function setupSocketIO(server) {
  // app.js 와 동일하게 CORS_ORIGIN 환경변수로 허용 오리진 관리 (HTTPS 포함)
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost', 'https://localhost', 'https://localhost:5443'];

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  attachRedisAdapter(io).catch((err) => console.error('[socket] Redis adapter 연결 실패:', err.message));

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('인증 토큰이 없습니다.'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await userCache.getUser(decoded.userId);
      if (!user || !user.isActive) return next(new Error('유효하지 않은 계정입니다.'));
      // 중복 로그인 차단: 소켓 연결 시점에도 nonce 검증
      if (user.sessionNonce && decoded.sn !== user.sessionNonce) {
        return next(new Error('SESSION_REPLACED'));
      }
      socket.user = user;
      next();
    } catch {
      next(new Error('토큰이 유효하지 않거나 만료되었습니다.'));
    }
  });

  io.on('connection', (socket) => {
    // ── 이벤트 리스너를 먼저 등록 (async 작업 이전) ────────────
    // send-message 등 클라이언트 이벤트가 async 초기화 중에 도착해도 유실되지 않음

    // 메시지 전송
    socket.on('send-message', async ({ roomId, content, fileUrl, fileName, fileType, fileSize, parentId }) => {
      try {
        const html = content?.trim() || '';
        // HTML 태그 제거 후 실제 텍스트가 있는지 확인
        const plainText = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (!plainText && !fileUrl) return;

        const membership = await prisma.chatRoomMember.findUnique({
          where: { roomId_userId: { roomId: Number(roomId), userId: socket.user.id } },
        });
        if (!membership) {
          socket.emit('message-error', { error: '채팅방 멤버가 아닙니다.' });
          return;
        }

        const message = await prisma.chatMessage.create({
          data: {
            roomId: Number(roomId),
            senderId: socket.user.id,
            content: html,
            fileUrl: fileUrl || null,
            fileName: fileName || null,
            fileType: fileType || null,
            fileSize: fileSize || null,
            parentId: parentId ? Number(parentId) : null,
          },
          include: MSG_INCLUDE,
        });

        if (parentId) {
          // 발신자에게 직접 전달 + 나머지 룸 멤버에게 브로드캐스트
          socket.emit('thread-message', message);
          socket.to(`room:${roomId}`).emit('thread-message', message);
          const parent = await prisma.chatMessage.findUnique({
            where: { id: Number(parentId) },
            include: { _count: { select: { replies: true } } },
          });
          if (parent) {
            io.to(`room:${roomId}`).emit('message-reply-count', {
              messageId: parent.id,
              roomId: Number(roomId),
              count: parent._count.replies,
            });
          }
        } else {
          // 발신자에게 직접 전달 + 나머지 룸 멤버에게 브로드캐스트
          // io.to() 대신 분리해서 보내야 발신자가 room join 여부와 무관하게 자신의 메시지를 받음
          socket.emit('new-message', message);
          socket.to(`room:${roomId}`).emit('new-message', message);
        }

        // @멘션 알림 (뮤트 안 된 사용자에게만)
        const mentioned = await parseMentions(html, Number(roomId));
        for (const u of mentioned) {
          if (u.id === socket.user.id) continue;
          const m = await prisma.chatRoomMember.findUnique({
            where: { roomId_userId: { roomId: Number(roomId), userId: u.id } },
          });
          if (m && !m.isMuted) {
            io.to(`user:${u.id}`).emit('mention', {
              roomId: Number(roomId),
              messageId: message.id,
              from: socket.user.displayName,
              content: html.replace(/<[^>]*>/g, '').slice(0, 100),
            });
          }
        }
      } catch (err) {
        console.error('[socket] send-message 오류:', err.message);
        socket.emit('message-error', { error: '메시지 저장에 실패했습니다.' });
      }
    });

    // 메시지 수정
    socket.on('edit-message', async ({ messageId, content }) => {
      try {
        const msg = await prisma.chatMessage.findUnique({ where: { id: Number(messageId) } });
        if (!msg || msg.senderId !== socket.user.id) return;

        const updated = await prisma.chatMessage.update({
          where: { id: Number(messageId) },
          data: { content, editedAt: new Date() },
          include: MSG_INCLUDE,
        });

        io.to(`room:${msg.roomId}`).emit('message-edited', updated);
      } catch (err) {
        console.error('[socket] edit-message 오류:', err.message);
      }
    });

    // 메시지 삭제
    socket.on('delete-message', async ({ messageId }) => {
      try {
        const msg = await prisma.chatMessage.findUnique({ where: { id: Number(messageId) } });
        if (!msg) return;
        if (msg.senderId !== socket.user.id && socket.user.role !== 'admin') return;

        await prisma.chatMessage.update({
          where: { id: Number(messageId) },
          data: { isDeleted: true, content: '' },
        });

        io.to(`room:${msg.roomId}`).emit('message-deleted', { messageId: Number(messageId), roomId: msg.roomId });
      } catch (err) {
        console.error('[socket] delete-message 오류:', err.message);
      }
    });

    // 이모지 반응
    socket.on('toggle-reaction', async ({ messageId, emoji }) => {
      try {
        const msg = await prisma.chatMessage.findUnique({ where: { id: Number(messageId) } });
        if (!msg) return;

        const membership = await prisma.chatRoomMember.findUnique({
          where: { roomId_userId: { roomId: msg.roomId, userId: socket.user.id } },
        });
        if (!membership) return;

        const existing = await prisma.chatMessageReaction.findUnique({
          where: { messageId_userId_emoji: { messageId: Number(messageId), userId: socket.user.id, emoji } },
        });

        if (existing) {
          await prisma.chatMessageReaction.delete({ where: { id: existing.id } });
        } else {
          await prisma.chatMessageReaction.create({
            data: { messageId: Number(messageId), userId: socket.user.id, emoji },
          });
        }

        const reactions = await prisma.chatMessageReaction.findMany({
          where: { messageId: Number(messageId) },
          include: { user: { select: { id: true, displayName: true } } },
        });

        io.to(`room:${msg.roomId}`).emit('message-reaction', { messageId: Number(messageId), reactions });
      } catch (err) {
        console.error('[socket] toggle-reaction 오류:', err.message);
      }
    });

    // 메시지 고정 이벤트 브로드캐스트
    socket.on('pin-message', async ({ messageId, pinned }) => {
      try {
        const msg = await prisma.chatMessage.findUnique({ where: { id: Number(messageId) } });
        if (!msg) return;
        io.to(`room:${msg.roomId}`).emit('message-pinned', { messageId: Number(messageId), pinned, roomId: msg.roomId });
      } catch (err) {
        console.error('[socket] pin-message 오류:', err.message);
      }
    });

    // 채팅방 참여 (멤버 여부 확인 후 join)
    socket.on('join-room', async (roomId) => {
      const membership = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId: Number(roomId), userId: socket.user.id } },
      });
      if (membership) socket.join(`room:${roomId}`);
    });

    // 채팅방 나가기
    socket.on('leave-room', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // ── Playbook Run 실시간 협업 ──────────────────────────────
    socket.on('join-run', (runId) => {
      socket.join(`run:${runId}`);
    });

    socket.on('leave-run', (runId) => {
      socket.leave(`run:${runId}`);
    });

    // ── 타이핑 인디케이터 ─────────────────────────────────
    socket.on('typing', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('typing', {
        roomId: Number(roomId),
        userId: socket.user.id,
        displayName: socket.user.displayName,
      });
    });

    socket.on('stop-typing', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('stop-typing', {
        roomId: Number(roomId),
        userId: socket.user.id,
      });
    });

    // ── 연결 해제 ─────────────────────────────────────────
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(socket.user.id);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(socket.user.id);
          io.emit('user-offline', socket.user.id);
        }
      }
    });

    // ── async 초기화: 방 자동 가입 + 온라인 상태 등록 ─────────
    (async () => {
      try {
        socket.join(`user:${socket.user.id}`);

        const memberships = await prisma.chatRoomMember.findMany({
          where: { userId: socket.user.id },
          select: { roomId: true },
        });
        memberships.forEach((m) => socket.join(`room:${m.roomId}`));

        // 보드 멤버인 룸에 자동 가입
        const boardMemberships = await prisma.boardMember.findMany({
          where: { userId: socket.user.id },
          select: { boardId: true },
        });
        boardMemberships.forEach((m) => socket.join(`board:${m.boardId}`));

        // admin은 모든 보드 알림을 수신
        if (socket.user.role === 'admin') {
          const allBoards = await prisma.board.findMany({ select: { id: true } });
          allBoards.forEach((b) => socket.join(`board:${b.id}`));
        }

        // 온라인 상태 등록
        if (!onlineUsers.has(socket.user.id)) {
          onlineUsers.set(socket.user.id, new Set());
        }
        onlineUsers.get(socket.user.id).add(socket.id);

        // 현재 접속자 목록을 신규 소켓에 전송
        socket.emit('online-users', [...onlineUsers.keys()]);

        // 다른 사용자에게 온라인 알림 (첫 소켓 연결 시에만)
        if (onlineUsers.get(socket.user.id).size === 1) {
          socket.broadcast.emit('user-online', socket.user.id);
        }
      } catch (err) {
        console.error('[socket] 초기화 오류:', err.message);
      }
    })();
  });

  _io = io;
  return io;
}

module.exports = { setupSocketIO, getIO, kickUserSockets };
