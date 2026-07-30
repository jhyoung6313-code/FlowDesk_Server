/**
 * anomalyService (F-57 이상탐지) 테스트 — 경보 쿨다운(중복 발송 방지).
 * 동일 버스트를 두 번 스캔해도 관리자 알림은 1회만 생성돼야 한다.
 * 쿨다운 상태는 모듈 수명 동안 유지되므로, 테스트마다 resetModules로 새 인스턴스를 로드한다.
 */
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ record: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@prisma/client', () => {
  const m = {
    auditLog: { groupBy: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { PrismaClient: jest.fn(() => m) };
});

let prisma, runScan, AUDIT_ACTION;

beforeEach(() => {
  jest.resetModules(); // anomalyService의 쿨다운 Map을 테스트마다 초기화
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  ({ AUDIT_ACTION } = require('../src/config/security'));
  ({ runScan } = require('../src/services/anomalyService'));

  prisma.auditLog.findMany.mockResolvedValue([]);
  prisma.auditLog.findFirst.mockResolvedValue(null);
  prisma.user.findMany.mockResolvedValue([{ id: 1 }]);
  prisma.notification.createMany.mockResolvedValue({ count: 1 });
  prisma.auditLog.groupBy.mockImplementation(async ({ where }) =>
    where.action === AUDIT_ACTION.PII_READ
      ? [{ userId: 5, username: 'u5', _count: { _all: 9999 } }]
      : []);
});

describe('이상탐지 경보 쿨다운', () => {
  test('첫 스캔은 경보 발송', async () => {
    await runScan();
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  test('같은 버스트를 연속 스캔해도 쿨다운 내 재발송 안 함', async () => {
    await runScan();
    await runScan();
    await runScan();
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  test('경보 메시지에 대상/건수 포함', async () => {
    await runScan();
    const msg = prisma.notification.createMany.mock.calls[0][0].data[0].message;
    expect(msg).toMatch(/u5/);
    expect(msg).toMatch(/개인정보/);
  });
});
