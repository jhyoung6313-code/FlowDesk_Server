/**
 * authController 단위 테스트
 * Prisma, bcrypt, JWT를 mock 처리하여 DB 연결 없이 테스트
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Prisma mock
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

// bcrypt mock
jest.mock('bcrypt');

// node-cron mock (app.js에서 import됨)
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

// 감사로그 서비스 mock (DB 접근 차단)
jest.mock('../src/services/auditService', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

// 소켓 mock (중복 로그인 차단용 kickUserSockets)
jest.mock('../src/socket', () => ({
  kickUserSockets: jest.fn(),
}));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 테스트용 앱 생성
const authController = require('../src/controllers/authController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/auth/login', authController.login);
  app.put('/api/auth/password', (req, res, next) => {
    // 인증 미들웨어 mock
    req.user = { id: 1 };
    next();
  }, authController.changePassword);
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

process.env.JWT_SECRET = 'test-secret';
// 단위 테스트에서는 OTP 2단계를 건너뛰어 1단계 로그인 응답을 검증한다(런타임 평가).
process.env.DISABLE_OTP = 'true';

describe('POST /api/auth/login', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  test('아이디/비밀번호 미입력 시 400 반환', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/입력해주세요/);
  });

  test('존재하지 않는 사용자 → 401 반환', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'unknown', password: '1234' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/올바르지 않습니다/);
  });

  test('비활성 계정 → 401 반환', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, username: 'admin', passwordHash: 'hash', isActive: false, role: 'admin',
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin1234' });
    expect(res.status).toBe(401);
  });

  test('비밀번호 불일치 → 401 반환', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, username: 'admin', passwordHash: 'hash', isActive: true, role: 'admin',
    });
    bcrypt.compare.mockResolvedValue(false);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('정상 로그인 → 200 + token/user 반환', async () => {
    const mockUser = {
      id: 1,
      username: 'admin',
      displayName: '관리자',
      passwordHash: 'hashed',
      isActive: true,
      role: 'admin',
    };
    prisma.user.findUnique.mockResolvedValue(mockUser);
    // finalizeLogin은 갱신된 user 객체를 반환하므로 update도 mockUser를 돌려줘야 함
    prisma.user.update.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin1234' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      id: 1,
      username: 'admin',
      displayName: '관리자',
      role: 'admin',
    });
    // 응답에 passwordHash가 노출되면 안 됨
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});

describe('PUT /api/auth/password (비밀번호 변경)', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  test('필드 누락 시 400 반환', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'old' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/입력해주세요/);
  });

  test('새 비밀번호 정책 위반(8자 미만) → 400 반환', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin', passwordHash: 'hash' });
    bcrypt.compare.mockResolvedValue(true); // 현재 비밀번호 일치
    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'old1234', newPassword: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8자 이상/);
  });

  test('현재 비밀번호 불일치 → 401 반환', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, passwordHash: 'hash' });
    bcrypt.compare.mockResolvedValue(false);
    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/현재 비밀번호/);
  });

  test('정상 변경 → 200 반환', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin', passwordHash: 'oldhash' });
    // 1번째 compare: 현재 비밀번호 일치(true) / 2번째 compare: 새 비밀번호가 기존과 다름(false)
    bcrypt.compare
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    bcrypt.hash = jest.fn().mockResolvedValue('newhash');
    prisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'old1234', newPassword: 'NewPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/변경되었습니다/);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });
});
