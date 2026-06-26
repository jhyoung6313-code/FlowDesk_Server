const jwt = require('jsonwebtoken');
const { addClient, removeClient } = require('../services/sseService');

const prisma = require('../lib/prisma');

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
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) return res.status(401).end();
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
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
};

module.exports = { list, read, readAll, stream };
