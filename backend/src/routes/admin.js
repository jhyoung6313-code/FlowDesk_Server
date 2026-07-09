const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { AUTH, RETENTION } = require('../config/security');
const settings = require('../services/securitySettingsService');
const { PERMISSION_LIST } = require('../config/permissions');

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

// 부여 가능한 권한 그룹 목록 (사용자 관리 UI용)
router.get('/permissions', (req, res) => {
  res.json(PERMISSION_LIST);
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

// 관리자 콘솔 요약 (사용자 통계 + 최근 보안 이벤트)
router.get('/summary', async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, active, admin, locked, otp, todayLogins, recentSecurity] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      prisma.user.count({ where: { totpEnabled: true } }),
      prisma.auditLog.count({ where: { action: 'LOGIN_SUCCESS', createdAt: { gte: todayStart } } }),
      prisma.auditLog.findMany({
        where: {
          action: { in: ['LOGIN_FAIL', 'ACCOUNT_LOCKED', 'PERMISSION_DENIED', 'ANOMALY_DETECTED', 'PASSWORD_RESET'] },
        },
        include: { user: { select: { id: true, displayName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    res.json({
      users: { total, active, inactive: total - active, admin, locked, otp },
      todayLogins,
      recentSecurity,
    });
  } catch (err) {
    next(err);
  }
});

// 편집 가능한 일반 시스템 설정 키 (AppSetting 저장)
const SYSTEM_KEYS = ['app_name'];

// 시스템 설정 조회 — 일반 설정 + 보안 정책(편집 가능 값 + 읽기 전용 값)
router.get('/system-settings', async (req, res, next) => {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: SYSTEM_KEYS } } });
    const general = {};
    for (const r of rows) general[r.key] = r.value;

    // 현재 적용 중인 유효값(DB 오버라이드 + .env 기본값 병합)
    await settings.refresh();
    const a = settings.auth();
    const l = settings.lockout();
    const p = settings.password();

    res.json({
      general: { app_name: general.app_name || 'FlowDesk' },
      security: {
        // ── 편집 가능 (DB 오버라이드) ──
        maxFailedAttempts: l.MAX_FAILED_ATTEMPTS,
        lockDurationMinutes: l.LOCK_DURATION_MINUTES,
        passwordMinLength: p.MIN_LENGTH,
        passwordMinClasses: p.MIN_CHAR_CLASSES,
        passwordExpireDays: p.EXPIRE_DAYS,
        passwordHistoryCount: p.HISTORY_COUNT,
        enforceOtp: a.ENFORCE_OTP,
        jwtExpiresIn: a.JWT_EXPIRES_IN,
        // ── 읽기 전용 (.env / 서버 관리) ──
        bcryptRounds: AUTH.BCRYPT_ROUNDS,
        idleTimeoutMinutes: AUTH.IDLE_TIMEOUT_MINUTES,
        auditLogDays: RETENTION.AUDIT_LOG_DAYS,
      },
      jwtOptions: settings.JWT_OPTIONS,
    });
  } catch (err) {
    next(err);
  }
});

// 시스템 설정 저장 — 일반 설정 + 보안 정책(편집 가능 값). 저장 즉시 런타임 반영.
router.put('/system-settings', async (req, res, next) => {
  try {
    const { app_name } = req.body;
    const upserts = [];
    if (app_name !== undefined) upserts.push({ key: 'app_name', value: String(app_name).slice(0, 100) });

    const { out, errors } = settings.buildUpserts(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0] });
    upserts.push(...out);

    if (upserts.length) {
      await prisma.$transaction(
        upserts.map((u) =>
          prisma.appSetting.upsert({
            where: { key: u.key },
            create: { key: u.key, value: u.value },
            update: { value: u.value },
          })
        )
      );
    }
    await settings.refresh(); // 메모리 캐시 즉시 갱신
    res.json({ message: '시스템 설정이 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
