/**
 * authController OTP 2단계·비밀번호 재설정 흐름 테스트 (F-01/11)
 * pre-auth/reset 임시토큰 검증, OTP 검증, 재사용 금지 연동.
 */
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-authflow';

jest.mock('@prisma/client', () => {
  const m = { user: { findUnique: jest.fn(), update: jest.fn() } };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn().mockResolvedValue('newhash') }));
jest.mock('../src/socket', () => ({ kickUserSockets: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ record: jest.fn().mockResolvedValue(undefined), getClientIp: () => '127.0.0.1' }));
jest.mock('../src/services/securitySettingsService', () => ({
  auth: () => ({ JWT_EXPIRES_IN: '8h', ENFORCE_OTP: false }),
  lockout: () => ({ MAX_FAILED_ATTEMPTS: 5, LOCK_DURATION_MINUTES: 30 }),
}));
jest.mock('../src/utils/passwordPolicy', () => ({
  validateFormat: jest.fn(() => null),
  checkReuse: jest.fn().mockResolvedValue(null),
  pushHistory: jest.fn().mockResolvedValue(undefined),
  isExpired: jest.fn(() => false),
}));
const mockVerify = jest.fn();
jest.mock('otplib', () => ({ authenticator: { verify: (...a) => mockVerify(...a), generateSecret: () => 'S', keyuri: () => 'url' } }));

const request = require('supertest');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pwPolicy = require('../src/utils/passwordPolicy');
const ctrl = require('../src/controllers/authController');

function app() {
  const a = express();
  a.use(express.json());
  a.post('/verify-totp', ctrl.verifyLoginTotp);
  a.post('/reset/request', ctrl.requestPasswordReset);
  a.post('/reset/verify', ctrl.verifyResetOtp);
  a.post('/reset/confirm', ctrl.confirmPasswordReset);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}
const tok = (userId, type) => jwt.sign({ userId, type }, process.env.JWT_SECRET, { expiresIn: '5m' });

beforeEach(() => { jest.clearAllMocks(); pwPolicy.validateFormat.mockReturnValue(null); pwPolicy.checkReuse.mockResolvedValue(null); });

describe('verifyLoginTotp (2단계 OTP)', () => {
  test('만료/위조 pre-auth 토큰 → 401', async () => {
    const res = await request(app()).post('/verify-totp').send({ preAuthToken: 'garbage', otpCode: '123456' });
    expect(res.status).toBe(401);
  });

  test('잘못된 타입 토큰(register) → 401', async () => {
    const res = await request(app()).post('/verify-totp').send({ preAuthToken: tok(1, 'register'), otpCode: '123456' });
    expect(res.status).toBe(401);
  });

  test('OTP 코드 불일치 → 401', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, isActive: true, totpEnabled: true, totpSecret: 'S' });
    mockVerify.mockReturnValue(false);
    const res = await request(app()).post('/verify-totp').send({ preAuthToken: tok(1, 'pre-auth'), otpCode: '000000' });
    expect(res.status).toBe(401);
  });

  test('잠긴 계정은 OTP 검증 전 423', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, isActive: true, totpEnabled: true, totpSecret: 'S', lockedUntil: new Date(Date.now() + 600000) });
    const res = await request(app()).post('/verify-totp').send({ preAuthToken: tok(1, 'pre-auth'), otpCode: '123456' });
    expect(res.status).toBe(423);
  });

  test('OTP 실패 임계치 초과 시 계정 잠금(423)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin', isActive: true, totpEnabled: true, totpSecret: 'S', failedLoginCount: 4 });
    prisma.user.update.mockResolvedValue({});
    mockVerify.mockReturnValue(false);
    const res = await request(app()).post('/verify-totp').send({ preAuthToken: tok(1, 'pre-auth'), otpCode: '000000' });
    expect(res.status).toBe(423); // 5회째(MAX=5) → 잠금
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.lockedUntil).toBeInstanceOf(Date);
  });

  test('정상 OTP → 200 + token (세션 nonce 갱신)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin', isActive: true, totpEnabled: true, totpSecret: 'S', role: 'admin' });
    prisma.user.update.mockResolvedValue({ id: 1, username: 'admin', role: 'admin', sessionNonce: 'n', passwordChangedAt: new Date() });
    mockVerify.mockReturnValue(true);
    const res = await request(app()).post('/verify-totp').send({ preAuthToken: tok(1, 'pre-auth'), otpCode: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(prisma.user.update).toHaveBeenCalled();
  });
});

describe('비밀번호 재설정 흐름', () => {
  test('요청: 계정 열거 방지 — 미존재 계정도 200+토큰(무효 userId=0)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app()).post('/reset/request').send({ username: 'nobody' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('resetOtpToken');
    // 발급된 토큰은 userId=0 → 이후 OTP 검증에서 사용자 없음으로 401 처리됨
    const decoded = jwt.verify(res.body.resetOtpToken, process.env.JWT_SECRET);
    expect(decoded.userId).toBe(0);
  });

  test('요청: OTP 설정된 활성 계정 → 실제 userId 토큰 발급', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, isActive: true, totpEnabled: true, totpSecret: 'S' });
    const res = await request(app()).post('/reset/request').send({ username: 'admin' });
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.resetOtpToken, process.env.JWT_SECRET);
    expect(decoded.userId).toBe(1);
  });

  test('요청: 무효 계정 토큰(userId=0)은 OTP 검증에서 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null); // userId=0 조회 → 없음
    const res = await request(app()).post('/reset/verify').send({ resetOtpToken: tok(0, 'reset-otp'), otpCode: '123456' });
    expect(res.status).toBe(401);
  });

  test('확인: 재사용 금지 정책 위반 → 400', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin', isActive: true });
    pwPolicy.checkReuse.mockResolvedValue('최근 사용한 비밀번호는 재사용할 수 없습니다.');
    const res = await request(app()).post('/reset/confirm').send({ resetPwToken: tok(1, 'reset-pw'), newPassword: 'NewPass123!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/재사용/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('확인: 정상 → 비번 변경 + 잠금 해제 + 이력 적재', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin', isActive: true });
    prisma.user.update.mockResolvedValue({});
    const res = await request(app()).post('/reset/confirm').send({ resetPwToken: tok(1, 'reset-pw'), newPassword: 'NewPass123!' });
    expect(res.status).toBe(200);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.failedLoginCount).toBe(0);
    expect(data.lockedUntil).toBeNull();
    expect(pwPolicy.pushHistory).toHaveBeenCalled();
  });
});
