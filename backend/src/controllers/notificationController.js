const jwt = require('jsonwebtoken');
const { addClient, removeClient } = require('../services/sseService');

const prisma = require('../lib/prisma');
const userCache = require('../lib/userCache');

const list = async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user.id,
        delYn: '0',
        OR: [
          { taskId: null },
          { task: { delYn: '0' } },
        ],
      },
      include: {
        task: { select: { id: true, title: true, dueDate: true } },
        actor: { select: { id: true, displayName: true, avatarColor: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
};

const read = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: Number(req.params.id), userId: req.user.id },
      data: { isRead: true, delYn: '1' },
    });
    res.json({ message: '읽음 처리되었습니다.' });
  } catch (err) {
    next(err);
  }
};

const readAll = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false, delYn: '0' },
      data: { isRead: true, delYn: '1' },
    });
    res.json({ message: '전체 읽음 처리되었습니다.' });
  } catch (err) {
    next(err);
  }
};

const stream = async (req, res) => {
  // EventSource는 커스텀 헤더 불가 → 쿼리파라미터 토큰 허용
  const token = req.query.token || (req.headers.authorization?.split(' ')[1]);
  if (!token) return res.status(401).end();

  let user;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isActive: true, sessionNonce: true, passwordChangedAt: true },
    });
    if (!user || !user.isActive) return res.status(401).end();
    // auth 미들웨어와 동일 기준: 다른 곳에서 재로그인(세션 교체)되었거나 비밀번호가 바뀐 뒤의
    // 옛 토큰으로는 알림 스트림을 열 수 없다 (옛 세션이 새 세션의 알림을 계속 수신하는 것 방지)
    const pwAt = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
    if (decoded.pwAt !== undefined && pwAt > decoded.pwAt) return res.status(401).end();
    if (user.sessionNonce && decoded.sn !== user.sessionNonce) return res.status(401).end();
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = user.id;
  addClient(userId, res);

  // 초기 연결 확인 메시지
  res.write('event: connected\ndata: {}\n\n');

  // 30초마다 keepalive
  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { clearInterval(heartbeat); }
    userCache.touchActivity(userId);   // 알림 스트림이 열려 있는 동안은 접속 중으로 유지
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
};

module.exports = { list, read, readAll, stream };
