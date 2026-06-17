// ─────────────────────────────────────────────────────────────
// 감사로그 서비스 — 접속기록·개인정보 처리이력 기록
// 신용정보법: 접속기록 3년 이상 보관. 위·변조 방지를 위해 append-only 로만 사용.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');

// 요청 객체에서 클라이언트 IP 추출 (nginx 프록시 X-Forwarded-For 고려)
function getClientIp(req) {
  if (!req) return null;
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * 감사로그 1건 기록. 실패해도 본 요청 흐름을 막지 않도록 예외를 삼킨다.
 * @param {object} params
 * @param {string} params.action   AUDIT_ACTION 상수
 * @param {object} [params.req]    Express req (ip/userAgent/user 추출)
 * @param {number} [params.userId]
 * @param {string} [params.username]
 * @param {string} [params.resource]
 * @param {string} [params.detail]
 * @param {boolean} [params.success=true]
 */
async function record({ action, req, userId, username, resource, detail, success = true }) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: userId ?? req?.user?.id ?? null,
        username: username ?? req?.user?.username ?? null,
        resource: resource ?? null,
        detail: detail ?? null,
        ipAddress: getClientIp(req),
        userAgent: req?.headers?.['user-agent'] ?? null,
        success,
      },
    });
  } catch (err) {
    // 감사로그 실패가 서비스 장애로 이어지면 안 되지만, 누락은 콘솔에 남긴다.
    console.error('[audit] 기록 실패:', err.message);
  }
}

module.exports = { record, getClientIp };
