// ─────────────────────────────────────────────────────────────
// 금융권 보안 정책 상수 (개인정보보호법 · 신용정보법 · 전자금융감독규정)
// 단일 진실 원천: 보안 관련 임계치/기간은 모두 여기서 관리한다.
// 운영 환경에서는 .env 로 일부 값을 덮어쓸 수 있다.
// ─────────────────────────────────────────────────────────────

const env = process.env;
const num = (key, fallback) => (env[key] !== undefined ? Number(env[key]) : fallback);
const bool = (key, fallback) => (env[key] !== undefined ? env[key] === 'true' : fallback);

// ── 인증 · 세션 ──────────────────────────────────────────────
const AUTH = {
  // JWT 만료: 금융권 권고 30분~1시간 (기존 8h → 단축)
  JWT_EXPIRES_IN: env.JWT_EXPIRES_IN || '1h',
  // 유휴 세션 자동 로그아웃(분). 프론트 비활동 타이머와 연동
  IDLE_TIMEOUT_MINUTES: num('IDLE_TIMEOUT_MINUTES', 30),
  // OTP(2단계 인증) 전사 강제 여부
  ENFORCE_OTP: bool('ENFORCE_OTP', true),
  // bcrypt cost (금융권 권장 12 이상)
  BCRYPT_ROUNDS: num('BCRYPT_ROUNDS', 12),
};

// ── 계정 잠금 (무차별 대입 방어) ─────────────────────────────
const LOCKOUT = {
  MAX_FAILED_ATTEMPTS: num('LOGIN_MAX_FAILED', 5),
  LOCK_DURATION_MINUTES: num('LOGIN_LOCK_MINUTES', 30),
};

// ── 비밀번호 정책 ────────────────────────────────────────────
const PASSWORD = {
  MIN_LENGTH: num('PASSWORD_MIN_LENGTH', 9),
  // 4종(영대문자·영소문자·숫자·특수문자) 중 최소 충족 종류 수
  MIN_CHAR_CLASSES: num('PASSWORD_MIN_CLASSES', 3),
  // 변경 주기(일). 경과 시 변경 요구
  EXPIRE_DAYS: num('PASSWORD_EXPIRE_DAYS', 90),
  // 직전 N개 재사용 금지
  HISTORY_COUNT: num('PASSWORD_HISTORY_COUNT', 5),
};

// ── 데이터 보유 · 자동 파기 (단위: 일) ───────────────────────
// ⚠️ 금융거래기록은 전자금융거래법상 5년 보관 의무 → 파기 대상에서 제외
const RETENTION = {
  // 감사/접속 로그: 신용정보법 3년(1095일)
  AUDIT_LOG_DAYS: num('RETENTION_AUDIT_DAYS', 1095),
  // 소프트삭제 업무(del_yn=1) 유예 후 물리 파기
  SOFT_DELETED_TASK_DAYS: num('RETENTION_SOFT_TASK_DAYS', 90),
  // 읽은 알림 보관
  READ_NOTIFICATION_DAYS: num('RETENTION_NOTIFICATION_DAYS', 90),
  // 자동 파기 cron 실행 시각 (매일)
  PURGE_CRON: env.RETENTION_PURGE_CRON || '0 3 * * *', // 매일 03:00
};

// ── 비정상 접근 탐지 임계치 ──────────────────────────────────
const ANOMALY = {
  // 단시간 대량 조회 (분 / 건수)
  BULK_READ_WINDOW_MINUTES: num('ANOMALY_BULK_WINDOW', 5),
  BULK_READ_THRESHOLD: num('ANOMALY_BULK_THRESHOLD', 100),
  // 403 권한오류 다발 (분 / 건수)
  FORBIDDEN_WINDOW_MINUTES: num('ANOMALY_FORBIDDEN_WINDOW', 5),
  FORBIDDEN_THRESHOLD: num('ANOMALY_FORBIDDEN_THRESHOLD', 10),
  // 업무외 시간대 로그인 경고 (시작시~종료시, 24h)
  OFF_HOURS_START: num('ANOMALY_OFF_HOURS_START', 0),
  OFF_HOURS_END: num('ANOMALY_OFF_HOURS_END', 6),
  // 탐지 스캔 cron
  SCAN_CRON: env.ANOMALY_SCAN_CRON || '*/5 * * * *', // 5분마다
};

// ── 감사로그 액션 유형 (매직스트링 방지) ─────────────────────
const AUDIT_ACTION = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAIL: 'LOGIN_FAIL',
  LOGOUT: 'LOGOUT',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PII_READ: 'PII_READ',         // 개인정보 조회
  DATA_EXPORT: 'DATA_EXPORT',   // 대량 반출(Excel/PDF/백업)
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DATA_PURGE: 'DATA_PURGE',     // 자동 파기 대장
  ANOMALY_DETECTED: 'ANOMALY_DETECTED',
};

module.exports = { AUTH, LOCKOUT, PASSWORD, RETENTION, ANOMALY, AUDIT_ACTION };
