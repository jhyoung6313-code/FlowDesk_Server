/**
 * partController 단위 테스트
 */

const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    part: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const partController = require('../src/controllers/partController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 1, role: 'admin' };
    next();
  });
  app.get('/api/parts', partController.list);
  app.post('/api/parts', partController.create);
  app.put('/api/parts/:id', partController.update);
  app.delete('/api/parts/:id', partController.remove);
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

const mockPart = { id: 1, name: '개발팀', description: null, _count: { tasks: 3 } };

describe('GET /api/parts (파트 목록)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('목록 조회 → 200 + 배열 반환', async () => {
    prisma.part.findMany.mockResolvedValue([mockPart]);
    const res = await request(createApp()).get('/api/parts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('개발팀');
  });
});

describe('POST /api/parts (파트 생성)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('name 누락 → 400 반환', async () => {
    const res = await request(createApp()).post('/api/parts').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/필수/);
  });

  test('중복 파트명 → 409 반환', async () => {
    prisma.part.findUnique.mockResolvedValue(mockPart);
    const res = await request(createApp())
      .post('/api/parts')
      .send({ name: '개발팀' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/이미 존재/);
  });

  test('정상 생성 → 201 반환', async () => {
    prisma.part.findUnique.mockResolvedValue(null);
    prisma.part.create.mockResolvedValue({ id: 2, name: '기획팀', description: null });
    const res = await request(createApp())
      .post('/api/parts')
      .send({ name: '기획팀' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('기획팀');
  });
});

describe('PUT /api/parts/:id (파트 수정)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('중복 파트명(다른 id) → 409 반환', async () => {
    prisma.part.findFirst.mockResolvedValue({ id: 3, name: '기획팀' });
    const res = await request(createApp())
      .put('/api/parts/1')
      .send({ name: '기획팀' });
    expect(res.status).toBe(409);
  });

  test('정상 수정 → 200 반환', async () => {
    prisma.part.findFirst.mockResolvedValue(null);
    prisma.part.update.mockResolvedValue({ id: 1, name: '백엔드팀' });
    const res = await request(createApp())
      .put('/api/parts/1')
      .send({ name: '백엔드팀' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('백엔드팀');
  });
});

describe('DELETE /api/parts/:id (파트 삭제)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('정상 삭제 → 200 반환', async () => {
    prisma.part.delete.mockResolvedValue(mockPart);
    const res = await request(createApp()).delete('/api/parts/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/삭제되었습니다/);
  });
});
