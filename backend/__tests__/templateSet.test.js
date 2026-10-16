/**
 * 템플릿 세트(F-41 확장) 단위 테스트 — templateSetController
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    taskTemplateSet: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    taskTemplate: { findMany: jest.fn() },
    task: { create: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    team: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg())),
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/templateSetController');

function app(role = 'member', uid = 5) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/template-sets', ctrl.list);
  a.post('/template-sets', ctrl.create);
  a.put('/template-sets/:id', ctrl.update);
  a.delete('/template-sets/:id', ctrl.remove);
  a.post('/template-sets/:id/apply', ctrl.apply);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('create', () => {
  test('이름 없으면 400', async () => {
    const res = await request(app()).post('/template-sets').send({});
    expect(res.status).toBe(400);
  });
  test('정상 생성 → 201', async () => {
    prisma.taskTemplateSet.create.mockResolvedValue({ id: 1, name: '신규 프로젝트 킥오프' });
    const res = await request(app()).post('/template-sets').send({ name: '신규 프로젝트 킥오프' });
    expect(res.status).toBe(201);
  });
});

describe('remove', () => {
  test('본인 소유 아니고 관리자도 아니면 403', async () => {
    prisma.taskTemplateSet.findUnique.mockResolvedValue({ id: 1, createdBy: 99 });
    const res = await request(app('member', 5)).delete('/template-sets/1');
    expect(res.status).toBe(403);
    expect(prisma.taskTemplateSet.delete).not.toHaveBeenCalled();
  });
  test('본인 소유면 삭제 가능', async () => {
    prisma.taskTemplateSet.findUnique.mockResolvedValue({ id: 1, createdBy: 5 });
    prisma.taskTemplateSet.delete.mockResolvedValue({});
    const res = await request(app('member', 5)).delete('/template-sets/1');
    expect(res.status).toBe(200);
  });
});

describe('apply', () => {
  test('kickoffDate 없으면 400', async () => {
    const res = await request(app()).post('/template-sets/1/apply').send({});
    expect(res.status).toBe(400);
  });

  test('세트에 템플릿이 없으면 400', async () => {
    prisma.taskTemplateSet.findUnique.mockResolvedValue({ id: 1 });
    prisma.taskTemplate.findMany.mockResolvedValue([]);
    const res = await request(app()).post('/template-sets/1/apply').send({ kickoffDate: '2026-03-01' });
    expect(res.status).toBe(400);
  });

  test('dayOffset만큼 밀린 마감일로 업무를 일괄 생성', async () => {
    prisma.taskTemplateSet.findUnique.mockResolvedValue({ id: 1 });
    prisma.taskTemplate.findMany.mockResolvedValue([
      { id: 1, title: '킥오프 미팅', description: null, partId: null, priority: 'normal', dayOffset: 0, durationDays: null, assigneeIdsJson: null, extraNamesJson: null },
      { id: 2, title: '요구사항 정리', description: null, partId: null, priority: 'high', dayOffset: 5, durationDays: 2, assigneeIdsJson: '[7]', extraNamesJson: null },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 7 }]); // 담당자 7은 유효(활성) 사용자
    prisma.task.create.mockImplementation(async ({ data }) => ({ id: data.title.length, title: data.title, dueDate: data.dueDate }));

    const res = await request(app('member', 5)).post('/template-sets/1/apply').send({ kickoffDate: '2026-03-01' });

    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.warnings).toBeUndefined();
    const calls = prisma.task.create.mock.calls;
    expect(calls[0][0].data.dueDate.toISOString().slice(0, 10)).toBe('2026-03-01'); // offset 0
    expect(calls[1][0].data.dueDate.toISOString().slice(0, 10)).toBe('2026-03-06'); // offset 5
    expect(calls[1][0].data.assignees.create).toEqual([{ userId: 7 }]);
    expect(calls[1][0].data.startDate.toISOString().slice(0, 10)).toBe('2026-03-04'); // dueDate - durationDays(2)
  });

  test('9회차 리뷰 §2 수정: 삭제된 담당자/팀은 제외하고 나머지 업무는 정상 생성(전체 롤백 금지) + warnings 반환', async () => {
    prisma.taskTemplateSet.findUnique.mockResolvedValue({ id: 1 });
    prisma.taskTemplate.findMany.mockResolvedValue([
      { id: 1, title: '설계 검토', description: null, partId: 99, priority: 'normal', dayOffset: 0, durationDays: null, assigneeIdsJson: '[7,8]', extraNamesJson: null },
    ]);
    // 8번 사용자는 더 이상 존재(또는 비활성)하지 않음, 99번 팀도 삭제됨 — 둘 다 조회 결과에서 빠짐
    prisma.user.findMany.mockResolvedValue([{ id: 7 }]);
    prisma.team.findMany.mockResolvedValue([]);
    prisma.task.create.mockImplementation(async ({ data }) => ({ id: 1, title: data.title, dueDate: data.dueDate }));

    const res = await request(app('member', 5)).post('/template-sets/1/apply').send({ kickoffDate: '2026-03-01' });

    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.warnings.length).toBe(2); // 담당자 제외 경고 + 팀 제외 경고
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.assignees.create).toEqual([{ userId: 7 }]); // 8은 제외
    expect(data.partId).toBeNull(); // 99는 제외
  });
});
