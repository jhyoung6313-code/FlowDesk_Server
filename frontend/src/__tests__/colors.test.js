/**
 * colors 유틸리티 테스트
 */
import { describe, test, expect } from 'vitest';
import { PRIORITY_COLORS, STATUS_COLORS, getAvatarColor } from '../utils/colors';

describe('PRIORITY_COLORS', () => {
  test('high/normal/low 키 존재', () => {
    expect(PRIORITY_COLORS).toHaveProperty('high');
    expect(PRIORITY_COLORS).toHaveProperty('normal');
    expect(PRIORITY_COLORS).toHaveProperty('low');
  });

  test('각 항목에 color, bg, label 필드 존재', () => {
    ['high', 'normal', 'low'].forEach((key) => {
      expect(PRIORITY_COLORS[key]).toHaveProperty('color');
      expect(PRIORITY_COLORS[key]).toHaveProperty('bg');
      expect(PRIORITY_COLORS[key]).toHaveProperty('label');
    });
  });

  test('한글 레이블 확인', () => {
    expect(PRIORITY_COLORS.high.label).toBe('높음');
    expect(PRIORITY_COLORS.normal.label).toBe('보통');
    expect(PRIORITY_COLORS.low.label).toBe('낮음');
  });
});

describe('STATUS_COLORS', () => {
  test('pending/in_progress/done/hold 키 존재', () => {
    ['pending', 'in_progress', 'done', 'hold'].forEach((key) => {
      expect(STATUS_COLORS).toHaveProperty(key);
    });
  });

  test('한글 레이블 확인', () => {
    expect(STATUS_COLORS.pending.label).toBe('대기');
    expect(STATUS_COLORS.in_progress.label).toBe('진행중');
    expect(STATUS_COLORS.done.label).toBe('완료');
    expect(STATUS_COLORS.hold.label).toBe('보류');
  });
});

describe('getAvatarColor()', () => {
  test('유효한 색상 문자열 반환', () => {
    const color = getAvatarColor(1);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('id=0 처리 가능', () => {
    expect(() => getAvatarColor(0)).not.toThrow();
  });

  test('null/undefined 처리 가능', () => {
    expect(() => getAvatarColor(null)).not.toThrow();
    expect(() => getAvatarColor(undefined)).not.toThrow();
  });

  test('같은 id는 항상 같은 색상 반환 (결정론적)', () => {
    expect(getAvatarColor(3)).toBe(getAvatarColor(3));
    expect(getAvatarColor(7)).toBe(getAvatarColor(7));
  });

  test('색상이 8가지 순환', () => {
    // id=0과 id=8은 같은 색상 (8개 순환)
    expect(getAvatarColor(0)).toBe(getAvatarColor(8));
    expect(getAvatarColor(1)).toBe(getAvatarColor(9));
  });
});
