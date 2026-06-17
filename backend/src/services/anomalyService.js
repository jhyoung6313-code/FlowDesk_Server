// ─────────────────────────────────────────────────────────────
// 비정상 접근 탐지 (규칙 기반, 외부 솔루션 불필요)
// 감사로그(AuditLog)를 주기적으로 스캔해 임계치 초과 시
//  ① ANOMALY_DETECTED 감사로그 기록  ② 관리자에게 security_alert 알림
// 동일 경보 중복 발송을 막기 위해 직전 탐지 시각 이후 데이터만 평가한다.
// ─────────────────────────────────────────────────────────────

const cron = require('node-cron');
const prisma = require('../lib/prisma');
const audit = require('./auditService');
const { ANOMALY, AUDIT_ACTION } = require('../config/security');

const MINUTE = 60 * 1000;

// 관리자 전원에게 보안 경보 알림 + 감사로그 1건 기록
async function raiseAlert(message, detail) {
  await audit.record({ action: AUDIT_ACTION.ANOMALY_DETECTED, resource: 'anomaly/scan', success: false, detail: detail || message });
  const admins = await prisma.user.findMany({ where: { role: 'admin', isActive: true }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, type: 'security_alert', message: `[보안경보] ${message}`.slice(0, 500) })),
    });
  }
  console.warn(`[anomaly] ${message}`);
}

// 단시간 대량 조회 탐지 (사용자별 PII_READ 집계)
async function detectBulkRead(since) {
  const windowStart = new Date(Date.now() - ANOMALY.BULK_READ_WINDOW_MINUTES * MINUTE);
  const grouped = await prisma.auditLog.groupBy({
    by: ['userId', 'username'],
    where: { action: AUDIT_ACTION.PII_READ, createdAt: { gte: windowStart } },
    _count: { _all: true },
  });
  for (const g of grouped) {
    if (g._count._all >= ANOMALY.BULK_READ_THRESHOLD) {
      await raiseAlert(
        `${g.username || g.userId} 계정이 ${ANOMALY.BULK_READ_WINDOW_MINUTES}분 내 개인정보 ${g._count._all}건 조회`,
        `bulk_read userId=${g.userId} count=${g._count._all}`,
      );
    }
  }
}

// 403 권한오류 다발 탐지 (권한 탐색 시도)
async function detectForbiddenFlood(since) {
  const windowStart = new Date(Date.now() - ANOMALY.FORBIDDEN_WINDOW_MINUTES * MINUTE);
  const grouped = await prisma.auditLog.groupBy({
    by: ['userId', 'username'],
    where: { action: AUDIT_ACTION.PERMISSION_DENIED, createdAt: { gte: windowStart } },
    _count: { _all: true },
  });
  for (const g of grouped) {
    if (g._count._all >= ANOMALY.FORBIDDEN_THRESHOLD) {
      await raiseAlert(
        `${g.username || g.userId} 계정이 ${ANOMALY.FORBIDDEN_WINDOW_MINUTES}분 내 권한오류 ${g._count._all}회`,
        `forbidden_flood userId=${g.userId} count=${g._count._all}`,
      );
    }
  }
}

// 신규 IP 로그인 / 동일 계정 다중 IP 동시 접속 탐지
async function detectIpAnomaly(since) {
  const recentLogins = await prisma.auditLog.findMany({
    where: { action: AUDIT_ACTION.LOGIN_SUCCESS, createdAt: { gte: since } },
    select: { userId: true, username: true, ipAddress: true, createdAt: true },
  });
  // 동시 접속(같은 사용자, 서로 다른 IP)
  const byUser = new Map();
  for (const r of recentLogins) {
    if (!r.userId || !r.ipAddress) continue;
    const set = byUser.get(r.userId) || new Set();
    set.add(r.ipAddress);
    byUser.set(r.userId, set);
    // 신규 IP: 과거(스캔창 이전) 동일 IP 로그인 이력이 없으면 경보
    const seen = await prisma.auditLog.findFirst({
      where: { userId: r.userId, action: AUDIT_ACTION.LOGIN_SUCCESS, ipAddress: r.ipAddress, createdAt: { lt: since } },
      select: { id: true },
    });
    if (!seen) {
      await raiseAlert(`${r.username || r.userId} 계정 신규 IP(${r.ipAddress}) 로그인`, `new_ip userId=${r.userId} ip=${r.ipAddress}`);
    }
    // 업무외 시간대 로그인
    const hour = new Date(r.createdAt).getHours();
    const off = ANOMALY.OFF_HOURS_START <= ANOMALY.OFF_HOURS_END
      ? hour >= ANOMALY.OFF_HOURS_START && hour < ANOMALY.OFF_HOURS_END
      : hour >= ANOMALY.OFF_HOURS_START || hour < ANOMALY.OFF_HOURS_END;
    if (off) {
      await raiseAlert(`${r.username || r.userId} 계정 업무외 시간(${hour}시) 로그인`, `off_hours userId=${r.userId} hour=${hour}`);
    }
  }
  for (const [userId, ips] of byUser) {
    if (ips.size >= 2) {
      const sample = recentLogins.find((r) => r.userId === userId);
      await raiseAlert(`${sample?.username || userId} 계정이 ${ips.size}개 IP에서 동시 접속`, `multi_ip userId=${userId} ips=${ips.size}`);
    }
  }
}

let lastScanAt = new Date();

async function runScan() {
  const since = lastScanAt;
  lastScanAt = new Date();
  try {
    await detectBulkRead(since);
    await detectForbiddenFlood(since);
    await detectIpAnomaly(since);
  } catch (err) {
    console.error('[anomaly] 스캔 오류:', err.message);
  }
}

function scheduleAnomalyScan() {
  cron.schedule(ANOMALY.SCAN_CRON, runScan);
  console.log(`[anomaly] 비정상 접근 탐지 스캔 등록: ${ANOMALY.SCAN_CRON}`);
}

module.exports = { scheduleAnomalyScan, runScan };
