/**
 * 자동화 규칙 엔진(F-62) 테스트
 *  - 순수 로직(조건 평가·템플릿 렌더링): DB 불필요
 *  - 컨트롤러: Prisma mock으로 검증 (task.test.js 패턴)
 */

const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    automationRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    automationLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    task: { create: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const automation = require('../src/services/automationService');
const automationController = require('../src/controllers/automationController');

// ─────────────────────────── 순수 로직 ───────────────────────────
describe('automationService.evaluateConditions', () => {
  test('조건 없으면 항상 통과', () => {
    expect(automation.evaluateConditions([], { status: 'done' })).toBe(true);
    expect(automation.evaluateConditions(undefined, {})).toBe(true);
  });

  test('eq / ne 연산', () => {
    const ctx = { status: 'done', priority: 'high' };
    expect(automation.evaluateConditions([{ field: 'status', op: 'eq', value: 'done' }], ctx)).toBe(true);
    expect(automation.evaluateConditions([{ field: 'status', op: 'eq', value: 'hold' }], ctx)).toBe(false);
    expect(automation.evaluateConditions([{ field: 'priority', op: 'ne', value: 'low' }], ctx)).toBe(true);
  });

  test('in / contains(배열) 연산', () => {
    const ctx = { priority: 'high', assigneeIds: [2, 5, 9] };
    expect(automation.evaluateConditions([{ field: 'priority', op: 'in', value: ['high', 'normal'] }], ctx)).toBe(true);
    expect(automation.evaluateConditions([{ field: 'assigneeIds', op: 'contains', value: 5 }], ctx)).toBe(true);
    expect(automation.evaluateConditions([{ field: 'assigneeIds', op: 'contains', value: 7 }], ctx)).toBe(false);
  });

  test('changed_to: 새 상태로 전이된 경우에만 true', () => {
    expect(automation.evalCondition({ op: 'changed_to', value: 'done', field: 'status' }, { status: 'done', prevStatus: 'in_progress' })).toBe(true);
    expect(automation.evalCondition({ op: 'changed_to', value: 'done', field: 'status' }, { status: 'done', prevStatus: 'done' })).toBe(false);
  });

  test('여러 조건은 AND 결합', () => {
    const ctx = { status: 'done', priority: 'high' };
    const conds = [{ field: 'status', op: 'eq', value: 'done' }, { field: 'priority', op: 'eq', value: 'high' }];
    expect(automation.evaluateConditions(conds, ctx)).toBe(true);
    conds[1].value = 'low';
    expect(automation.evaluateConditions(conds, ctx)).toBe(false);
  });
});

describe('automationService.render', () => {
  test('{{field}} 치환', () => {
    expect(automation.render('업무 "{{title}}" 완료', { title: '배포' })).toBe('업무 "배포" 완료');
  });
  test('없는 필드는 빈 문자열', () => {
    expect(automation.render('{{missing}}!', {})).toBe('!');
  });
  test('배열은 콤마 결합', () => {
    expect(automation.render('{{ids}}', { ids: [1, 2, 3] })).toBe('1, 2, 3');
  });
});

// ─────────────────────────── 컨트롤러 ───────────────────────────
function createApp(role = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: 1, role }; next(); });
  app.get('/automations/catalog', automationController.catalog);
  app.get('/automations', automationController.list);
  app.post('/automations', automationController.create);
  app.put('/automations/:id', automationController.update);
  app.delete('/automations/:id', automationController.remove);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}

describe('automationController', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET /catalog → 이벤트/액션/연산자 반환', async () => {
    const res = await request(createApp()).get('/automations/catalog');
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
    expect(res.body.actions.some((a) => a.value === 'webhook')).toBe(true);
  });

  test('POST 이름 누락 → 400', async () => {
    const res = await request(createApp()).post('/automations').send({ event: 'task.created', actions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/이름/);
  });

  test('POST 유효하지 않은 이벤트 → 400', async () => {
    const res = await request(createApp()).post('/automations').send({ name: 'R', event: 'bogus.event', actions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/이벤트/);
  });

  test('POST 정상 → 201, JSON 직렬화 저장', async () => {
    prisma.automationRule.create.mockResolvedValue({
      id: 1, name: 'R', event: 'task.created', isActive: true,
      conditions: '[]', actions: '[{"type":"notify","config":{}}]', createdBy: 1,
    });
    const res = await request(createApp()).post('/automations').send({
      name: 'R', event: 'task.created',
      conditions: [{ field: 'priority', op: 'eq', value: 'high' }],
      actions: [{ type: 'notify', config: { toAssignees: true, message: 'hi' } }],
    });
    expect(res.status).toBe(201);
    // 컨트롤러가 conditions/actions를 JSON 문자열로 저장하는지 확인
    const createArg = prisma.automationRule.create.mock.calls[0][0].data;
    expect(typeof createArg.conditions).toBe('string');
    expect(typeof createArg.actions).toBe('string');
    // 응답은 파싱된 객체
    expect(Array.isArray(res.body.actions)).toBe(true);
  });

  test('DELETE → 200', async () => {
    prisma.automationRule.delete.mockResolvedValue({});
    const res = await request(createApp()).delete('/automations/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/삭제/);
  });
});

// ─────────────────────────── emit 안전성 ───────────────────────────
describe('automationService.emit 안전성', () => {
  beforeEach(() => jest.clearAllMocks());

  test('규칙 없으면 조용히 반환', async () => {
    prisma.automationRule.findMany.mockResolvedValue([]);
    await expect(automation.emit('task.created', { taskId: 1 })).resolves.toBeUndefined();
  });

  test('조건 불충족 규칙은 skipped 로그만 남기고 액션 미실행', async () => {
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 7, event: 'task.created', conditions: '[{"field":"priority","op":"eq","value":"high"}]', actions: '[{"type":"notify","config":{"toCreator":true}}]', createdBy: 1 },
    ]);
    await automation.emit('task.created', { taskId: 1, priority: 'low', createdBy: 3 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.automationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'skipped' }) }));
  });

  test('조건 충족 시 notify 액션이 대상자에게 알림 생성', async () => {
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 8, event: 'task.created', conditions: '[]', actions: '[{"type":"notify","config":{"toCreator":true,"message":"{{title}}"}}]', createdBy: 1 },
    ]);
    prisma.automationRule.update.mockResolvedValue({});
    await automation.emit('task.created', { taskId: 1, title: '배포', createdBy: 3 });
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 3, type: 'automation', message: '배포' }),
    }));
  });

  test('액션 실행 중 예외가 나도 emit은 throw하지 않음', async () => {
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 9, event: 'task.created', conditions: '[]', actions: '[{"type":"notify","config":{"toCreator":true}}]', createdBy: 1 },
    ]);
    prisma.notification.create.mockRejectedValueOnce(new Error('DB down'));
    prisma.automationRule.update.mockResolvedValue({});
    await expect(automation.emit('task.created', { taskId: 1, createdBy: 3 })).resolves.toBeUndefined();
    expect(prisma.automationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });
});
