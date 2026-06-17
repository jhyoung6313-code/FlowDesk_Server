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
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

// bcrypt mock
jest.mock('bcrypt');

// node-cron mock (app.js에서 import됨)
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

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

  test('새 비밀번호 6자 미만 → 400 반환', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'old1234', newPassword: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6자 이상/);
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
    prisma.user.findUnique.mockResolvedValue({ id: 1, passwordHash: 'oldhash' });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash = jest.fn().mockResolvedValue('newhash');
    prisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'old1234', newPassword: 'new1234' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/변경되었습니다/);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });
});
