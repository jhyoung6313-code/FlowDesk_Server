const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

const prisma = require('../lib/prisma');

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '관리자만 접근 가능합니다.' });
  next();
};

router.use(authenticate, adminOnly);

// 활동 로그 (최근 TaskHistory 전체)
router.get('/activity-log', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const userId = req.query.userId ? Number(req.query.userId) : undefined;

    const where = userId ? { userId } : {};

    const [total, logs] = await Promise.all([
      prisma.taskHistory.count({ where }),
      prisma.taskHistory.findMany({
        where,
        include: {
          task: { select: { id: true, title: true } },
          user: { select: { id: true, displayName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    res.json({ total, logs });
  } catch (err) {
    next(err);
  }
});

// 보안 감사로그 (접속기록·개인정보 처리이력·파기대장) — 신용정보법 3년 보관
router.get('/audit-log', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const action = req.query.action || undefined;
    const userId = req.query.userId ? Number(req.query.userId) : undefined;

    const where = {};
    if (action) where.action = action;
    if (userId) where.userId = userId;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, displayName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    res.json({ total, logs });
  } catch (err) {
    next(err);
  }
});

// 잠긴 계정 잠금 해제 (관리자)
router.post('/users/:id/unlock', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
    res.json({ message: '계정 잠금이 해제되었습니다.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
