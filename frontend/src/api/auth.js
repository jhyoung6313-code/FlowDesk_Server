import api from './axios';

// ── 로그인 ─────────────────────────────────────────────────
// 1단계: 아이디 + 비밀번호
export const login = (username, password) =>
  api.post('/auth/login', { username, password }).then((r) => r.data);

// 2단계: OTP 검증 (totpEnabled 계정)
export const verifyLoginTotp = (preAuthToken, otpCode) =>
  api.post('/auth/login/totp', { preAuthToken, otpCode }).then((r) => r.data);

// OTP 전사 강제 — 미등록 사용자 로그인 중 등록
// (1) QR 생성
export const setupLoginTotp = (preAuthToken) =>
  api.post('/auth/login/totp-setup', { preAuthToken }).then((r) => r.data);
// (2) 코드 검증 → 활성화 + 로그인 완료
export const enrollLoginTotp = (preAuthToken, otpCode) =>
  api.post('/auth/login/totp-enroll', { preAuthToken, otpCode }).then((r) => r.data);

// ── 계정 신청 ───────────────────────────────────────────────
// 1단계: 정보 입력 → QR 코드 반환
export const register = (username, displayName, password) =>
  api.post('/auth/register', { username, displayName, password }).then((r) => r.data);

// 2단계: OTP 인증 → 계정 활성화 + 자동 로그인
export const verifyRegisterTotp = (tempToken, otpCode) =>
  api.post('/auth/register/verify', { tempToken, otpCode }).then((r) => r.data);

// ── 기타 ────────────────────────────────────────────────────
export const logout = () => api.post('/auth/logout').then((r) => r.data);

export const getMe = () => api.get('/auth/me').then((r) => r.data);

export const changePassword = (currentPassword, newPassword) =>
  api.put('/auth/password', { currentPassword, newPassword }).then((r) => r.data);

// 내 프로필(조직 정보: 관리부서/직책/직급) 수정
export const updateMyProfile = (data) =>
  api.put('/auth/profile', data).then((r) => r.data);

// 미사용 화면 잠금 시간 설정 (분, 0=사용 안 함)
export const updateIdleTimeout = (idleTimeoutMin) =>
  api.put('/auth/idle-timeout', { idleTimeoutMin }).then((r) => r.data);

// 화면 잠금 해제용 비밀번호 검증
export const verifyPassword = (password) =>
  api.post('/auth/verify-password', { password }).then((r) => r.data);

// ── 비밀번호 초기화 (비로그인) ──────────────────────────────
// 1단계: 아이디 확인 → resetOtpToken 반환
export const requestPasswordReset = (username) =>
  api.post('/auth/reset-password/request', { username }).then((r) => r.data);

// 2단계: OTP 검증 → resetPwToken 반환
export const verifyResetOtp = (resetOtpToken, otpCode) =>
  api.post('/auth/reset-password/verify-otp', { resetOtpToken, otpCode }).then((r) => r.data);

// 3단계: 새 비밀번호 설정
export const confirmPasswordReset = (resetPwToken, newPassword) =>
  api.post('/auth/reset-password/confirm', { resetPwToken, newPassword }).then((r) => r.data);

// ── OTP 설정 ─────────────────────────────────────────────
// 1단계: QR 코드 생성
export const setupOtp = () =>
  api.post('/auth/otp/setup').then((r) => r.data);

// 2단계: 코드 검증 → 활성화
export const verifySetupOtp = (otpCode) =>
  api.post('/auth/otp/verify', { otpCode }).then((r) => r.data);

// OTP 해제
export const disableOtp = (otpCode) =>
  api.post('/auth/otp/disable', { otpCode }).then((r) => r.data);
