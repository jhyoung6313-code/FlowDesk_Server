// ─────────────────────────────────────────────────────────────
// 런타임 보안 설정 서비스
//  - config/security.js 의 기본값(.env) 위에 DB(AppSetting, 키 prefix "sec_")
//    오버라이드를 얹어 관리자가 화면에서 즉시 변경할 수 있게 한다.
//  - 값은 메모리에 캐시하고, 저장/시작 시 refresh() 로 갱신한다.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');
const { AUTH, LOCKOUT, PASSWORD } = require('../config/security');

let cache = {}; // 'sec_*' → 문자열 값

// DB 오버라이드 로드 (DB 미연결이면 기본값 유지)
async function refresh() {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: 'sec_' } } });
    const m = {};
    for (const r of rows) m[r.key] = r.value;
    cache = m;
  } catch {
    // 무시: 기본값(config)으로 동작
  }
  return cache;
}

const int = (key, def) => {
  const n = Number(cache[key]);
  return Number.isFinite(n) ? Math.trunc(n) : def;
};
const bool = (key, def) => (cache[key] === undefined ? def : cache[key] === 'true');
const str = (key, def) => cache[key] || def;

// ── 소비자용 getter (요청 시점에 최신 캐시 반영) ──
function lockout() {
  return {
    MAX_FAILED_ATTEMPTS: int('sec_max_failed', LOCKOUT.MAX_FAILED_ATTEMPTS),
    LOCK_DURATION_MINUTES: int('sec_lock_minutes', LOCKOUT.LOCK_DURATION_MINUTES),
  };
}

function password() {
  return {
    MIN_LENGTH: int('sec_pw_min_length', PASSWORD.MIN_LENGTH),
    MIN_CHAR_CLASSES: int('sec_pw_min_classes', PASSWORD.MIN_CHAR_CLASSES),
    EXPIRE_DAYS: int('sec_pw_expire_days', PASSWORD.EXPIRE_DAYS),
    HISTORY_COUNT: int('sec_pw_history', PASSWORD.HISTORY_COUNT),
  };
}

function auth() {
  return {
    JWT_EXPIRES_IN: str('sec_jwt_expires', AUTH.JWT_EXPIRES_IN),
    ENFORCE_OTP: bool('sec_enforce_otp', AUTH.ENFORCE_OTP),
    // 아래는 편집 불가(참고용): .env / config 기준값 그대로
    IDLE_TIMEOUT_MINUTES: AUTH.IDLE_TIMEOUT_MINUTES,
    BCRYPT_ROUNDS: AUTH.BCRYPT_ROUNDS,
  };
}

const JWT_OPTIONS = ['30m', '1h', '2h', '4h', '8h'];

// 관리자 저장 요청 검증 → upsert 페이로드 생성 (errors 있으면 저장 중단)
function buildUpserts(body) {
  const out = [];
  const errors = [];

  const setInt = (key, val, min, max, label) => {
    if (val === undefined || val === null || val === '') return;
    const n = Number(val);
    if (!Number.isFinite(n) || n < min || n > max) {
      errors.push(`${label}은(는) ${min}~${max} 범위의 숫자여야 합니다.`);
      return;
    }
    out.push({ key, value: String(Math.trunc(n)) });
  };

  setInt('sec_max_failed', body.maxFailedAttempts, 1, 20, '계정 잠금 임계값');
  setInt('sec_lock_minutes', body.lockDurationMinutes, 1, 1440, '잠금 지속 시간');
  setInt('sec_pw_min_length', body.passwordMinLength, 4, 64, '비밀번호 최소 길이');
  setInt('sec_pw_min_classes', body.passwordMinClasses, 1, 4, '문자 종류 요구');
  setInt('sec_pw_expire_days', body.passwordExpireDays, 0, 3650, '비밀번호 변경 주기');
  setInt('sec_pw_history', body.passwordHistoryCount, 0, 50, '직전 재사용 금지');

  if (body.enforceOtp !== undefined) {
    out.push({ key: 'sec_enforce_otp', value: body.enforceOtp ? 'true' : 'false' });
  }
  if (body.jwtExpiresIn !== undefined && body.jwtExpiresIn !== '') {
    if (!JWT_OPTIONS.includes(body.jwtExpiresIn)) errors.push('세션 만료 값이 올바르지 않습니다.');
    else out.push({ key: 'sec_jwt_expires', value: body.jwtExpiresIn });
  }

  return { out, errors };
}

module.exports = { refresh, lockout, password, auth, buildUpserts, JWT_OPTIONS };
