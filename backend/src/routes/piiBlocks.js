// ─────────────────────────────────────────────────────────────
// 개인정보 검출내역(입력 차단 로그) 조회 라우트
// 접근 제어: role(admin/member) 무관, 'PII_AUDIT'(감사권한) 보유자만 열람.
//           → 시스템 관리자와 감사자 직무분리.
// ⚠️ 원문은 저장하지 않으므로 마스킹본만 노출한다.
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/requirePermission');
const prisma = require('../lib/prisma');

router.use(authenticate, requirePermission('PII_AUDIT'));

// 검출내역 목록 (마스킹본만)
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const piiType = req.query.piiType || undefined;
    const userId = req.query.userId ? Number(req.query.userId) : undefined;

    const where = {};
    if (piiType) where.piiType = piiType;
    if (userId) where.userId = userId;

    const [total, logs] = await Promise.all([
      prisma.piiBlockLog.count({ where }),
      prisma.piiBlockLog.findMany({
        where,
        select: {
          id: true, piiType: true, fieldPath: true, masked: true,
          endpoint: true, ipAddress: true, userAgent: true, username: true,
          createdAt: true,
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

module.exports = router;
