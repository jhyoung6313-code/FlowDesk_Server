/**
 * teamController 단위 테스트 (구 part.test.js 대체)
 * F-40 조직개편으로 파트→부서·팀 구조가 되면서 partController가 teamController로 대체됨.
 */

const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    team: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    department: { findUnique: jest.fn() },
    task: { updateMany: jest.fn().mockResolvedValue({}) },
    recurringTask: { updateMany: jest.fn().mockResolvedValue({}) },
    taskTemplate: { updateMany: jest.fn().mockResolvedValue({}) },
    user: { updateMany: jest.fn().mockResolvedValue({}) },
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const teamController = require('../src/controllers/teamController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: 1, role: 'admin' }; next(); });
  app.get('/api/teams', teamController.list);
  app.post('/api/teams', teamController.create);
  app.put('/api/teams/:id', teamController.update);
  app.delete('/api/teams/:id', teamController.remove);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

const mockTeam = { id: 1, name: '백엔드팀', departmentId: 1, description: null, order: 0, department: { id: 1, name: '개발부' }, _count: { tasks: 3, users: 2 } };

describe('GET /api/teams (팀 목록)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('목록 조회 → 200 + 배열 반환', async () => {
    prisma.team.findMany.mockResolvedValue([mockTeam]);
    const res = await request(createApp()).get('/api/teams');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('백엔드팀');
  });

  test('departmentId 쿼리 → where 필터 적용', async () => {
    prisma.team.findMany.mockResolvedValue([]);
    await request(createApp()).get('/api/teams?departmentId=5');
    const callArg = prisma.team.findMany.mock.calls[0][0];
    expect(callArg.where.departmentId).toBe(5);
  });
});

describe('POST /api/teams (팀 생성)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('name 누락 → 400 반환', async () => {
    const res = await request(createApp()).post('/api/teams').send({ departmentId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/필수/);
  });

  test('departmentId 누락 → 400 반환', async () => {
    const res = await request(createApp()).post('/api/teams').send({ name: '기획팀' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/부서/);
  });

  test('존재하지 않는 부서 → 404 반환', async () => {
    prisma.department.findUnique.mockResolvedValue(null);
    const res = await request(createApp()).post('/api/teams').send({ name: '기획팀', departmentId: 99 });
    expect(res.status).toBe(404);
  });

  test('같은 부서 내 중복 팀명 → 409 반환', async () => {
    prisma.department.findUnique.mockResolvedValue({ id: 1, name: '개발부' });
    prisma.team.findFirst.mockResolvedValue(mockTeam);
    const res = await request(createApp()).post('/api/teams').send({ name: '백엔드팀', departmentId: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/동일한 팀명/);
  });

  test('정상 생성 → 201 반환', async () => {
    prisma.department.findUnique.mockResolvedValue({ id: 1, name: '개발부' });
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.create.mockResolvedValue({ id: 2, name: '기획팀', departmentId: 1 });
    const res = await request(createApp()).post('/api/teams').send({ name: '기획팀', departmentId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('기획팀');
  });
});

describe('PUT /api/teams/:id (팀 수정)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('없는 팀 → 404 반환', async () => {
    prisma.team.findUnique.mockResolvedValue(null);
    const res = await request(createApp()).put('/api/teams/1').send({ name: '백엔드팀' });
    expect(res.status).toBe(404);
  });

  test('같은 부서 중복 팀명(다른 id) → 409 반환', async () => {
    prisma.team.findUnique.mockResolvedValue(mockTeam);
    prisma.team.findFirst.mockResolvedValue({ id: 3, name: '기획팀', departmentId: 1 });
    const res = await request(createApp()).put('/api/teams/1').send({ name: '기획팀' });
    expect(res.status).toBe(409);
  });

  test('정상 수정 → 200 반환', async () => {
    prisma.team.findUnique.mockResolvedValue(mockTeam);
    prisma.team.findFirst.mockResolvedValue(null);
    prisma.team.update.mockResolvedValue({ id: 1, name: '플랫폼팀', departmentId: 1 });
    const res = await request(createApp()).put('/api/teams/1').send({ name: '플랫폼팀' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('플랫폼팀');
  });
});

describe('DELETE /api/teams/:id (팀 삭제)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('정상 삭제 → 200 + 연결 데이터 해제', async () => {
    prisma.team.delete.mockResolvedValue(mockTeam);
    const res = await request(createApp()).delete('/api/teams/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/삭제되었습니다/);
    // 연결된 업무/반복업무/템플릿/사용자의 팀 참조 해제 확인
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { partId: 1 }, data: { partId: null } });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { teamId: 1 }, data: { teamId: null } });
  });
});
