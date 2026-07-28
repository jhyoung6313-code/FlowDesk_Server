/**
 * automationService (F-62 규칙 엔진) 심층 테스트
 * 조건 연산자 전체, 템플릿 렌더링, emit 흐름(조건 스킵·액션 실행·오류 격리·구스키마 안전).
 */
jest.mock('@prisma/client', () => {
  const m = {
    automationRule: { findMany: jest.fn(), update: jest.fn() },
    automationLog: { create: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    task: { create: jest.fn().mockResolvedValue({ id: 77 }) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/sseService', () => ({ pushNotification: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ sendGenericEmail: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/services/linkedRoomService', () => ({ postMessage: jest.fn().mockResolvedValue({}) }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const svc = require('../src/services/automationService');
const { pushNotification } = require('../src/services/sseService');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.notification.create.mockResolvedValue({ id: 1 });
  prisma.task.create.mockResolvedValue({ id: 77 });
});

describe('evalCondition — 연산자별', () => {
  const cases = [
    ['eq 일치', { field: 'status', op: 'eq', value: 'done' }, { status: 'done' }, true],
    ['eq 불일치', { field: 'status', op: 'eq', value: 'done' }, { status: 'todo' }, false],
    ['ne', { field: 'status', op: 'ne', value: 'done' }, { status: 'todo' }, true],
    ['in 포함', { field: 'priority', op: 'in', value: 'high,urgent' }, { priority: 'high' }, true],
    ['nin 미포함', { field: 'priority', op: 'nin', value: 'high,urgent' }, { priority: 'low' }, true],
    ['contains 문자열', { field: 'title', op: 'contains', value: '긴급' }, { title: '긴급 장애' }, true],
    ['contains 배열', { field: 'assigneeIds', op: 'contains', value: 5 }, { assigneeIds: [5, 6] }, true],
    ['gt', { field: 'n', op: 'gt', value: 10 }, { n: 20 }, true],
    ['lt', { field: 'n', op: 'lt', value: 10 }, { n: 5 }, true],
    ['is_empty', { field: 'x', op: 'is_empty' }, { x: '' }, true],
    ['not_empty', { field: 'x', op: 'not_empty' }, { x: 'v' }, true],
    ['dotted field', { field: 'meta.level', op: 'eq', value: '3' }, { meta: { level: 3 } }, true],
    ['field 없으면 항상 통과', { op: 'eq', value: 'x' }, {}, true],
  ];
  test.each(cases)('%s', (_label, cond, ctx, expected) => {
    expect(svc.evalCondition(cond, ctx)).toBe(expected);
  });

  test('changed_to: status가 값으로 바뀌었고 이전값은 달라야 true (field 지정 시)', () => {
    expect(svc.evalCondition({ field: 'status', op: 'changed_to', value: 'done' }, { status: 'done', prevStatus: 'todo' })).toBe(true);
    expect(svc.evalCondition({ field: 'status', op: 'changed_to', value: 'done' }, { status: 'done', prevStatus: 'done' })).toBe(false);
  });

  // 알려진 함정(로버스트니스): field 없이 만든 changed_to 조건은 !cond.field 단락으로 항상 true.
  test('field 없는 changed_to는 (단락 규칙상) 항상 통과 — 현재 동작 고정', () => {
    expect(svc.evalCondition({ op: 'changed_to', value: 'done' }, { status: 'done', prevStatus: 'done' })).toBe(true);
  });
});

describe('evaluateConditions — AND 결합', () => {
  test('모든 조건 통과해야 true', () => {
    const conds = [{ field: 'status', op: 'eq', value: 'done' }, { field: 'priority', op: 'eq', value: 'high' }];
    expect(svc.evaluateConditions(conds, { status: 'done', priority: 'high' })).toBe(true);
    expect(svc.evaluateConditions(conds, { status: 'done', priority: 'low' })).toBe(false);
  });
  test('조건 없으면 항상 통과', () => {
    expect(svc.evaluateConditions([], {})).toBe(true);
    expect(svc.evaluateConditions(null, {})).toBe(true);
  });
});

describe('render — 템플릿 치환', () => {
  test('{{field}} 치환, 배열은 콤마 조인, 없는 값은 빈문자', () => {
    expect(svc.render('업무: {{title}} / {{tags}} / {{missing}}', { title: 'A', tags: ['x', 'y'] }))
      .toBe('업무: A / x, y / ');
  });
  test('null 템플릿 → 빈문자', () => {
    expect(svc.render(null, {})).toBe('');
  });
});

describe('emit — 규칙 실행 흐름', () => {
  test('automationRule 모델 없으면 안전하게 무시 (구 스키마)', async () => {
    const saved = prisma.automationRule;
    delete prisma.automationRule;
    await expect(svc.emit('task.created', {})).resolves.toBeUndefined();
    prisma.automationRule = saved;
  });

  test('조건 불충족 시 액션 미실행 + skipped 로그', async () => {
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 1, name: 'R', conditions: JSON.stringify([{ field: 'status', op: 'eq', value: 'done' }]), actions: JSON.stringify([{ type: 'notify', config: { userIds: '5' } }]) },
    ]);
    await svc.emit('task.status_changed', { status: 'todo' });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.automationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'skipped' }) }));
  });

  test('notify 액션: 대상에게 알림 생성 + runCount 증가', async () => {
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 1, name: 'R', createdBy: 1, conditions: null, actions: JSON.stringify([{ type: 'notify', config: { userIds: '5,6', toCreator: true, message: '{{title}} 처리' } }]) },
    ]);
    prisma.automationRule.update.mockResolvedValue({});
    await svc.emit('task.created', { title: '배포', createdBy: 9 });
    // 5, 6, 9(createdBy) → 3명
    expect(prisma.notification.create).toHaveBeenCalledTimes(3);
    expect(prisma.notification.create.mock.calls[0][0].data.message).toBe('배포 처리');
    expect(prisma.automationRule.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ runCount: { increment: 1 }, lastError: null }),
    }));
  });

  test('액션 오류는 격리되어 lastError에 기록(다른 규칙 흐름 무손상)', async () => {
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 1, name: 'R', createdBy: 1, conditions: null, actions: JSON.stringify([{ type: 'notify', config: { userIds: '5' } }]) },
    ]);
    prisma.notification.create.mockRejectedValueOnce(new Error('DB 다운'));
    prisma.automationRule.update.mockResolvedValue({});
    await svc.emit('task.created', {});
    const upd = prisma.automationRule.update.mock.calls[0][0].data;
    expect(upd.lastError).toMatch(/오류:notify/);
    expect(prisma.automationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });

  test('create_task 액션: rule.createdBy로 업무 생성', async () => {
    prisma.automationRule.findMany.mockResolvedValue([
      { id: 1, name: 'R', createdBy: 3, conditions: null, actions: JSON.stringify([{ type: 'create_task', config: { title: '점검: {{title}}', assigneeIds: '5' } }]) },
    ]);
    prisma.automationRule.update.mockResolvedValue({});
    await svc.emit('bbs.post_created', { title: '공지' });
    expect(prisma.task.create).toHaveBeenCalled();
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.title).toBe('점검: 공지');
    expect(data.createdBy).toBe(3);
    expect(data.assignees.create[0].userId).toBe(5);
  });
});
