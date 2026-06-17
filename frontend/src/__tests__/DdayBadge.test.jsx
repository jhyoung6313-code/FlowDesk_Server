/**
 * DdayBadge 컴포넌트 테스트
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DdayBadge from '../components/Task/DdayBadge';

const TODAY = '2026-04-14';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TODAY));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DdayBadge 컴포넌트', () => {
  test('dueDate 없으면 렌더링 안 됨', () => {
    const { container } = render(<DdayBadge dueDate={null} status="pending" />);
    expect(container.firstChild).toBeNull();
  });

  test('status=done이면 렌더링 안 됨', () => {
    const { container } = render(<DdayBadge dueDate="2026-04-20" status="done" />);
    expect(container.firstChild).toBeNull();
  });

  test('미래 날짜 → D-n 표시', () => {
    render(<DdayBadge dueDate="2026-04-20" status="pending" />);
    expect(screen.getByText('D-6')).toBeInTheDocument();
  });

  test('당일 → D-Day 표시', () => {
    render(<DdayBadge dueDate={TODAY} status="pending" />);
    expect(screen.getByText('D-Day')).toBeInTheDocument();
  });

  test('과거 날짜 → D+n 표시', () => {
    render(<DdayBadge dueDate="2026-04-10" status="in_progress" />);
    expect(screen.getByText('D+4')).toBeInTheDocument();
  });

  test('마감 초과 시 빨강 스타일 적용', () => {
    render(<DdayBadge dueDate="2026-04-10" status="pending" />);
    const badge = screen.getByText('D+4');
    expect(badge).toHaveStyle({ color: '#ff4d4f' });
  });

  test('여유 있는 날짜는 초록 스타일 적용', () => {
    render(<DdayBadge dueDate="2026-04-20" status="pending" />);
    const badge = screen.getByText('D-6');
    expect(badge).toHaveStyle({ color: '#52c41a' });
  });
});
