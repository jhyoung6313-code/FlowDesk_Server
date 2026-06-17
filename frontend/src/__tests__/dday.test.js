/**
 * dday 유틸리티 함수 단위 테스트
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import dayjs from 'dayjs';
import { calcDday, getDdayColor, isOverdue, isDueSoon } from '../utils/dday';

// 고정 날짜 기준 테스트
const TODAY = '2026-04-14';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TODAY));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('calcDday()', () => {
  test('null 입력 시 null 반환', () => {
    expect(calcDday(null)).toBeNull();
  });

  test('미래 날짜 → D-n 형식 반환', () => {
    expect(calcDday('2026-04-20')).toBe('D-6');
    expect(calcDday('2026-04-15')).toBe('D-1');
  });

  test('당일 → D-Day 반환', () => {
    expect(calcDday(TODAY)).toBe('D-Day');
  });

  test('과거 날짜 → D+n 형식 반환', () => {
    expect(calcDday('2026-04-13')).toBe('D+1');
    expect(calcDday('2026-04-07')).toBe('D+7');
  });
});

describe('getDdayColor()', () => {
  test('null 입력 시 null 반환', () => {
    expect(getDdayColor(null)).toBeNull();
  });

  test('마감 초과 → 빨강(#ff4d4f)', () => {
    expect(getDdayColor('2026-04-10')).toBe('#ff4d4f');
  });

  test('당일 → 주황(#ff7a00)', () => {
    expect(getDdayColor(TODAY)).toBe('#ff7a00');
  });

  test('3일 이내 → 노랑(#faad14)', () => {
    expect(getDdayColor('2026-04-16')).toBe('#faad14');
    expect(getDdayColor('2026-04-17')).toBe('#faad14');
  });

  test('4일 이상 남음 → 초록(#52c41a)', () => {
    expect(getDdayColor('2026-04-20')).toBe('#52c41a');
  });
});

describe('isOverdue()', () => {
  test('dueDate 없으면 false', () => {
    expect(isOverdue(null, 'pending')).toBe(false);
  });

  test('완료 상태는 초과가 아님', () => {
    expect(isOverdue('2026-04-01', 'done')).toBe(false);
  });

  test('과거 날짜 + 미완료 → true', () => {
    expect(isOverdue('2026-04-13', 'pending')).toBe(true);
    expect(isOverdue('2026-04-01', 'in_progress')).toBe(true);
  });

  test('오늘 날짜는 초과 아님', () => {
    expect(isOverdue(TODAY, 'pending')).toBe(false);
  });

  test('미래 날짜 → false', () => {
    expect(isOverdue('2026-04-20', 'pending')).toBe(false);
  });
});

describe('isDueSoon()', () => {
  test('dueDate 없으면 false', () => {
    expect(isDueSoon(null, 'pending')).toBe(false);
  });

  test('완료 상태는 임박 아님', () => {
    expect(isDueSoon(TODAY, 'done')).toBe(false);
  });

  test('오늘 ~ 3일 이내 → true', () => {
    expect(isDueSoon(TODAY, 'pending')).toBe(true);
    expect(isDueSoon('2026-04-17', 'in_progress')).toBe(true);
  });

  test('4일 이상 남음 → false', () => {
    expect(isDueSoon('2026-04-20', 'pending')).toBe(false);
  });

  test('이미 지난 날짜 → false', () => {
    expect(isDueSoon('2026-04-10', 'pending')).toBe(false);
  });
});
