/**
 * PriorityBadge 컴포넌트 테스트
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriorityBadge from '../components/Task/PriorityBadge';

describe('PriorityBadge 컴포넌트', () => {
  test('high → "높음" 렌더링', () => {
    render(<PriorityBadge priority="high" />);
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  test('normal → "보통" 렌더링', () => {
    render(<PriorityBadge priority="normal" />);
    expect(screen.getByText('보통')).toBeInTheDocument();
  });

  test('low → "낮음" 렌더링', () => {
    render(<PriorityBadge priority="low" />);
    expect(screen.getByText('낮음')).toBeInTheDocument();
  });

  test('알 수 없는 priority → 기본값 "보통" 렌더링 (normal fallback)', () => {
    render(<PriorityBadge priority="unknown_value" />);
    // PRIORITY_COLORS fallback이 normal
    expect(screen.getByText('보통')).toBeInTheDocument();
  });
});
