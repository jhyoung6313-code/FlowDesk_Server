/**
 * securitySettingsService (F-57) 테스트
 * buildUpserts 범위검증·화이트리스트·불리언 처리, refresh 후 getter 오버라이드 반영.
 */
jest.mock('@prisma/client', () => {
  const m = { appSetting: { findMany: jest.fn().mockResolvedValue([]) } };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const svc = require('../src/services/securitySettingsService');

describe('buildUpserts — 검증', () => {
  test('정상 값 → out에 문자열로 적재, errors 없음', () => {
    const { out, errors } = svc.buildUpserts({
      maxFailedAttempts: 5, lockDurationMinutes: 30, passwordMinLength: 8,
      passwordMinClasses: 3, passwordExpireDays: 90, passwordHistoryCount: 5,
      enforceOtp: true, jwtExpiresIn: '8h',
    });
    expect(errors).toHaveLength(0);
    const map = Object.fromEntries(out.map((o) => [o.key, o.value]));
    expect(map.sec_max_failed).toBe('5');
    expect(map.sec_enforce_otp).toBe('true');
    expect(map.sec_jwt_expires).toBe('8h');
  });

  test('범위 밖 값 → errors 수집, 해당 키는 out에서 제외', () => {
    const { out, errors } = svc.buildUpserts({
      maxFailedAttempts: 999,     // 1~20 초과
      passwordMinLength: 2,       // 4~64 미만
      passwordMinClasses: 5,      // 1~4 초과
    });
    expect(errors.length).toBe(3);
    expect(out.find((o) => o.key === 'sec_max_failed')).toBeUndefined();
  });

  test('jwtExpiresIn 화이트리스트 밖 → error', () => {
    const { errors } = svc.buildUpserts({ jwtExpiresIn: '99h' });
    expect(errors.some((e) => e.includes('세션 만료'))).toBe(true);
  });

  test('enforceOtp false → 문자열 "false"', () => {
    const { out } = svc.buildUpserts({ enforceOtp: false });
    expect(out.find((o) => o.key === 'sec_enforce_otp').value).toBe('false');
  });

  test('빈 값/미지정은 건너뜀(부분 저장 허용)', () => {
    const { out, errors } = svc.buildUpserts({ maxFailedAttempts: '', lockDurationMinutes: 15 });
    expect(errors).toHaveLength(0);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('sec_lock_minutes');
  });
});

describe('getters — 기본값/오버라이드', () => {
  test('오버라이드 없으면 config 기본값(유한한 숫자) 반환', async () => {
    prisma.appSetting.findMany.mockResolvedValue([]);
    await svc.refresh();
    const pw = svc.password();
    expect(Number.isFinite(pw.MIN_LENGTH)).toBe(true);
    expect(Number.isFinite(pw.HISTORY_COUNT)).toBe(true);
  });

  test('DB 오버라이드가 getter에 반영됨', async () => {
    prisma.appSetting.findMany.mockResolvedValue([
      { key: 'sec_pw_min_length', value: '12' },
      { key: 'sec_enforce_otp', value: 'true' },
      { key: 'sec_jwt_expires', value: '1h' },
    ]);
    await svc.refresh();
    expect(svc.password().MIN_LENGTH).toBe(12);
    expect(svc.auth().ENFORCE_OTP).toBe(true);
    expect(svc.auth().JWT_EXPIRES_IN).toBe('1h');
  });
});
