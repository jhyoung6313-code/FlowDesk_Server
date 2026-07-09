// ─────────────────────────────────────────────────────────────
// 개인정보/신용정보 입력 차단 미들웨어 (전역, 쓰기 요청 전용)
// 정책: 주민등록번호·신용카드번호·계좌번호·연락처(010)가 요청 본문의
//       어떤 텍스트 필드에라도 포함되면 저장을 거부(400)하고 시도를 기록한다.
// ⚠️ 이 미들웨어가 실제 강제 지점이다. 프론트 검증은 UX 안내일 뿐 우회 가능.
// ─────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');
const { detectPii } = require('../utils/piiPatterns');
const piiBlock = require('../services/piiBlockService');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

// 스캔 제외 경로(로그인 자격증명 등, 오탐/불필요 스캔 방지). originalUrl prefix 매칭.
const SKIP_PREFIXES = ['/api/auth/login', '/api/auth/register', '/api/auth/otp'];

// body 를 재귀 순회하며 첫 PII 를 찾는다. { type, match, path } 반환.
function scan(value, path) {
  if (typeof value === 'string') {
    const hit = detectPii(value);
    return hit ? { ...hit, path } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = scan(value[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const r = scan(value[key], path ? `${path}.${key}` : key);
      if (r) return r;
    }
  }
  return null;
}

// 전역 authenticate 이전에 실행되므로, 기록 귀속을 위해 토큰을 가볍게 해독한다(비검증 흐름 차단 아님).
function attachUser(req) {
  if (req.user) return;
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return;
  try {
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    if (decoded?.userId) req.user = { id: decoded.userId, username: null };
  } catch {
    /* 토큰 무효 → 익명으로 기록 */
  }
}

function piiGuard(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  if (SKIP_PREFIXES.some((p) => req.originalUrl.startsWith(p))) return next();
  if (!req.body || typeof req.body !== 'object') return next();

  const hit = scan(req.body, '');
  if (!hit) return next();

  attachUser(req);
  // 비동기 기록은 응답을 막지 않도록 대기하지 않는다(fire-and-forget).
  piiBlock.record({ req, piiType: hit.type, match: hit.match, fieldPath: hit.path });

  return res.status(400).json({
    error: `${hit.type}는 입력할 수 없습니다. 개인정보·신용정보는 저장이 제한됩니다.`,
    code: 'PII_BLOCKED',
    piiType: hit.type,
    field: hit.path || undefined,
  });
}

module.exports = { piiGuard, scan };
