/**
 * StatusBadge 컴포넌트 테스트
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../components/Task/StatusBadge';

describe('StatusBadge 컴포넌트', () => {
  test('pending → "대기" 렌더링', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('대기')).toBeInTheDocument();
  });

  test('in_progress → "진행중" 렌더링', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('진행중')).toBeInTheDocument();
  });

  test('done → "완료" 렌더링', () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText('완료')).toBeInTheDocument();
  });

  test('hold → "보류" 렌더링', () => {
    render(<StatusBadge status="hold" />);
    expect(screen.getByText('보류')).toBeInTheDocument();
  });

  test('알 수 없는 status → 기본값 "대기" 렌더링 (pending fallback)', () => {
    render(<StatusBadge status="unknown_value" />);
    expect(screen.getByText('대기')).toBeInTheDocument();
  });
});
