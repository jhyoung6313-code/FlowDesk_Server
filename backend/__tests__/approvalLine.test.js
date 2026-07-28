/**
 * approvalLine 서비스 (F-52 결재선 프리셋/조건) 심층 테스트
 * evalCondition 연산자, resolvePresetLine(고정 사용자·직급규칙·scope·조건필터·formType 폴백).
 */
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
const { evalCondition, resolvePresetLine } = require('../src/services/approvalLine');

describe('evalCondition', () => {
  test('조건 없으면 항상 true', () => {
    expect(evalCondition(null, {})).toBe(true);
    expect(evalCondition({}, {})).toBe(true);
  });
  test('truthy: 값이 참(0/false/아니오/N 제외)', () => {
    expect(evalCondition({ field: 'urgent', op: 'truthy' }, { urgent: '예' })).toBe(true);
    expect(evalCondition({ field: 'urgent', op: 'truthy' }, { urgent: '아니오' })).toBe(false);
    expect(evalCondition({ field: 'urgent', op: 'truthy' }, { urgent: 'N' })).toBe(false);
    expect(evalCondition({ field: 'urgent', op: 'truthy' }, { urgent: '0' })).toBe(false);
  });
  test('eq/ne 문자열 비교', () => {
    expect(evalCondition({ field: 'amt', op: 'eq', value: '100' }, { amt: 100 })).toBe(true);
    expect(evalCondition({ field: 'amt', op: 'ne', value: '100' }, { amt: 200 })).toBe(true);
  });
  test('gt/gte/lt/lte 숫자 비교', () => {
    expect(evalCondition({ field: 'amt', op: 'gt', value: 100 }, { amt: 200 })).toBe(true);
    expect(evalCondition({ field: 'amt', op: 'gte', value: 200 }, { amt: 200 })).toBe(true);
    expect(evalCondition({ field: 'amt', op: 'lt', value: 100 }, { amt: 50 })).toBe(true);
    expect(evalCondition({ field: 'amt', op: 'lte', value: 50 }, { amt: 50 })).toBe(true);
  });
  test('contains: 배열/문자열', () => {
    expect(evalCondition({ field: 'tags', op: 'contains', value: 'a' }, { tags: ['a', 'b'] })).toBe(true);
    expect(evalCondition({ field: 'title', op: 'contains', value: '휴가' }, { title: '연차휴가원' })).toBe(true);
  });
});

describe('resolvePresetLine', () => {
  function mkPrisma({ users = {}, matches = [], formType = null } = {}) {
    return {
      user: {
        findUnique: jest.fn(async ({ where }) => users[where.id] ?? null),
        findMany: jest.fn(async () => matches),
      },
      approvalFormType: { findUnique: jest.fn(async () => formType) },
    };
  }

  test('고정 사용자(approverId) 해석 — 비활성 사용자는 unresolved', async () => {
    const prisma = mkPrisma({
      users: { 1: { departmentId: 1, teamId: 1 }, 2: { id: 2, displayName: '김부장', isActive: true }, 3: { id: 3, displayName: '퇴사자', isActive: false } },
    });
    const template = { lineJson: JSON.stringify([
      { stepOrder: 1, type: 'approval', approverId: 2 },
      { stepOrder: 2, type: 'approval', approverId: 3 },
    ]) };
    const { steps, unresolved } = await resolvePresetLine(prisma, template, {}, 1);
    expect(steps).toHaveLength(1);
    expect(steps[0].approverId).toBe(2);
    expect(unresolved).toHaveLength(1);
  });

  test('condition 미통과 항목은 제외', async () => {
    const prisma = mkPrisma({ users: { 1: { departmentId: 1, teamId: 1 }, 2: { id: 2, displayName: '임원', isActive: true } } });
    const template = { lineJson: JSON.stringify([
      { stepOrder: 1, type: 'approval', approverId: 2, condition: { field: 'amount', op: 'gte', value: 1000000 } },
    ]) };
    // 금액이 조건 미달 → 제외
    const low = await resolvePresetLine(prisma, template, { amount: 500000 }, 1);
    expect(low.steps).toHaveLength(0);
    // 조건 충족 → 포함 + conditional 플래그
    const high = await resolvePresetLine(prisma, template, { amount: 2000000 }, 1);
    expect(high.steps).toHaveLength(1);
    expect(high.steps[0].conditional).toBe(true);
  });

  test('직급 규칙(position) + team scope: 드래프터 팀으로 필터', async () => {
    const prisma = mkPrisma({
      users: { 1: { departmentId: 10, teamId: 20 } },
      matches: [{ id: 5, displayName: '팀장' }],
    });
    const template = { lineJson: JSON.stringify([
      { stepOrder: 1, type: 'approval', rule: { by: 'position', value: '팀장', scope: 'team' } },
    ]) };
    const { steps } = await resolvePresetLine(prisma, template, {}, 1);
    expect(steps[0].approverId).toBe(5);
    // team scope → teamId 조건 포함해서 조회
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.teamId).toBe(20);
  });

  test('템플릿 lineJson 없으면 formType 기본 결재선으로 폴백', async () => {
    const prisma = mkPrisma({
      users: { 1: { departmentId: 1, teamId: 1 }, 9: { id: 9, displayName: '대표', isActive: true } },
      formType: { lineJson: JSON.stringify([{ stepOrder: 1, type: 'approval', approverId: 9 }]) },
    });
    const template = { lineJson: null, formTypeId: 3 };
    const { steps } = await resolvePresetLine(prisma, template, {}, 1);
    expect(prisma.approvalFormType.findUnique).toHaveBeenCalled();
    expect(steps[0].approverId).toBe(9);
  });
});
