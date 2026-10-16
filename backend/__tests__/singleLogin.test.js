/**
 * 1계정 1로그인 테스트 — 접속 중인 계정으로의 새 로그인 거부, 동시 로그인 선점, 로그아웃/강제 로그아웃 해제
 */
process.env.JWT_SECRET = 'test-secret-singlelogin';

jest.mock('@prisma/client', () => {
  const m = { user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn().mockResolvedValue('h') }));
jest.mock('../src/socket', () => ({ kickUserSockets: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ record: jest.fn().mockResolvedValue(undefined), getClientIp: () => '127.0.0.1' }));
const mockAuth = jest.fn();
jest.mock('../src/services/securitySettingsService', () => ({
  auth: (...a) => mockAuth(...a),
  lockout: () => ({ MAX_FAILED_ATTEMPTS: 5, LOCK_DURATION_MINUTES: 30 }),
}));
jest.mock('../src/utils/passwordPolicy', () => ({
  validateFormat: jest.fn(() => null), checkReuse: jest.fn(), pushHistory: jest.fn(), isExpired: jest.fn(() => false),
}));

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { kickUserSockets } = require('../src/socket');
const authCtrl = require('../src/controllers/authController');
const userCtrl = require('../src/controllers/userController');

function app(reqUser = { id: 1, username: 'admin', role: 'admin' }) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = reqUser; next(); });
  a.post('/login', authCtrl.login);
  a.post('/logout', authCtrl.logout);
  a.patch('/users/:id/force-logout', userCtrl.forceLogout);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

const ago = (sec) => new Date(Date.now() - sec * 1000);
const baseUser = (over = {}) => ({
  id: 7, username: 'member1', passwordHash: 'x', isActive: true, role: 'member',
  totpEnabled: false, failedLoginCount: 0, lockedUntil: null, lastActiveAt: null,
  sessionNonce: 'old', passwordChangedAt: new Date(), mustChangePassword: false, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DISABLE_OTP = 'true';
  mockAuth.mockReturnValue({ JWT_EXPIRES_IN: '1h', ENFORCE_OTP: false, SINGLE_LOGIN_BLOCK: true, SESSION_ACTIVE_WINDOW_SEC: 180 });
  bcrypt.compare.mockResolvedValue(true);
  prisma.user.updateMany.mockResolvedValue({ count: 1 });
  prisma.user.update.mockImplementation(async ({ data }) => ({ ...baseUser(), ...data }));
});

describe('POST /login — 중복 로그인 차단', () => {
  test('접속 중(10초 전 활동)인 계정 → 409 ALREADY_LOGGED_IN, 토큰 미발급·세션 미변경', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ lastActiveAt: ago(10) }));
    const res = await request(app()).post('/login').send({ username: 'member1', password: 'pw' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_LOGGED_IN');
    expect(res.body.error).toBeTruthy();
    expect(res.body.token).toBeUndefined();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(kickUserSockets).not.toHaveBeenCalled();   // 기존 접속자를 쫓아내지 않는다
  });

  test('비밀번호가 틀리면 접속 여부를 알려주지 않고 일반 401', async () => {
    bcrypt.compare.mockResolvedValue(false);
    prisma.user.findUnique.mockResolvedValue(baseUser({ lastActiveAt: ago(10) }));
    prisma.user.update.mockResolvedValue({});
    const res = await request(app()).post('/login').send({ username: 'member1', password: 'bad' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined();
  });

  test('활동 없음(null) → 로그인 성공', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ lastActiveAt: null }));
    const res = await request(app()).post('/login').send({ username: 'member1', password: 'pw' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.update.mock.calls[0][0].data.lastActiveAt).toBeInstanceOf(Date);
  });

  test('마지막 활동이 윈도우(180초)보다 오래됨 → 로그인 성공', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ lastActiveAt: ago(600) }));
    const res = await request(app()).post('/login').send({ username: 'member1', password: 'pw' });
    expect(res.status).toBe(200);
  });

  test('선점 쿼리 조건: 마지막 활동 없음 또는 윈도우보다 오래됨', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    await request(app()).post('/login').send({ username: 'member1', password: 'pw' });
    const where = prisma.user.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe(7);
    expect(where.OR[0]).toEqual({ lastActiveAt: null });
    expect(where.OR[1].lastActiveAt.lt).toBeInstanceOf(Date);
  });

  test('동시 로그인 레이스: 사전 검사는 통과했지만 선점에 실패하면 409', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ lastActiveAt: null }));
    prisma.user.updateMany.mockResolvedValue({ count: 0 });   // 다른 로그인이 먼저 선점
    const res = await request(app()).post('/login').send({ username: 'member1', password: 'pw' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_LOGGED_IN');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('SINGLE_LOGIN_BLOCK=false 이면 예전처럼 새 로그인이 허용된다', async () => {
    mockAuth.mockReturnValue({ JWT_EXPIRES_IN: '1h', ENFORCE_OTP: false, SINGLE_LOGIN_BLOCK: false, SESSION_ACTIVE_WINDOW_SEC: 180 });
    prisma.user.findUnique.mockResolvedValue(baseUser({ lastActiveAt: ago(5) }));
    const res = await request(app()).post('/login').send({ username: 'member1', password: 'pw' });
    expect(res.status).toBe(200);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('로그아웃 / 강제 로그아웃', () => {
  test('로그아웃하면 lastActiveAt 이 비워지고 세션 nonce 가 교체된다 (즉시 재로그인 가능)', async () => {
    prisma.user.update.mockResolvedValue({});
    const res = await request(app({ id: 7, username: 'member1', role: 'member' })).post('/logout');
    expect(res.status).toBe(200);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.lastActiveAt).toBeNull();
    expect(typeof data.sessionNonce).toBe('string');
  });

  test('관리자 강제 로그아웃: nonce 교체 + lastActiveAt null + 소켓 종료', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, username: 'member1' });
    prisma.user.update.mockResolvedValue({});
    const res = await request(app()).patch('/users/7/force-logout');
    expect(res.status).toBe(200);
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.where.id).toBe(7);
    expect(arg.data.lastActiveAt).toBeNull();
    expect(arg.data.sessionNonce).toBeTruthy();
    expect(kickUserSockets).toHaveBeenCalledWith(7);
  });

  test('없는 사용자 강제 로그아웃 → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect((await request(app()).patch('/users/99/force-logout')).status).toBe(404);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
