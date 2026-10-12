const { computeCriticalPath, durationDays } = require('../src/services/wbsCriticalPath');

describe('durationDays', () => {
  test('같은 날이면 1일', () => {
    expect(durationDays('2026-01-01', '2026-01-01')).toBe(1);
  });
  test('4일 차이면 5일(양끝 포함)', () => {
    expect(durationDays('2026-01-01', '2026-01-05')).toBe(5);
  });
});

describe('computeCriticalPath', () => {
  const t = (id, start, end) => ({ id, startDate: start, endDate: end });

  test('엣지 없음 → 빈 집합', () => {
    const tasks = [t(1, '2026-01-01', '2026-01-05')];
    expect(computeCriticalPath(tasks, [])).toEqual(new Set());
  });

  test('단일 체인(A→B→C) 전부 크리티컬', () => {
    const tasks = [
      t(1, '2026-01-01', '2026-01-02'),
      t(2, '2026-01-03', '2026-01-04'),
      t(3, '2026-01-05', '2026-01-06'),
    ];
    const edges = [{ predecessorId: 1, successorId: 2 }, { predecessorId: 2, successorId: 3 }];
    expect(computeCriticalPath(tasks, edges)).toEqual(new Set([1, 2, 3]));
  });

  test('병렬 경로 중 더 긴 쪽(float=0)만 크리티컬, 짧은 쪽은 제외', () => {
    // A(5일)→C(1일) 긴 경로, B(1일)→C(1일) 짧은 경로. A,C만 크리티컬.
    const tasks = [
      t(1, '2026-01-01', '2026-01-05'), // A: 5일
      t(2, '2026-01-01', '2026-01-01'), // B: 1일
      t(3, '2026-01-06', '2026-01-06'), // C: 1일
    ];
    const edges = [{ predecessorId: 1, successorId: 3 }, { predecessorId: 2, successorId: 3 }];
    const critical = computeCriticalPath(tasks, edges);
    expect(critical.has(1)).toBe(true);
    expect(critical.has(3)).toBe(true);
    expect(critical.has(2)).toBe(false);
  });

  test('순환 의존성이 섞이면 빈 집합(계산 불가)', () => {
    const tasks = [t(1, '2026-01-01', '2026-01-02'), t(2, '2026-01-03', '2026-01-04')];
    const edges = [{ predecessorId: 1, successorId: 2 }, { predecessorId: 2, successorId: 1 }];
    expect(computeCriticalPath(tasks, edges)).toEqual(new Set());
  });

  test('날짜 없는 작업을 가리키는 엣지는 무시', () => {
    const tasks = [t(1, '2026-01-01', '2026-01-02'), { id: 2, startDate: null, endDate: null }];
    const edges = [{ predecessorId: 1, successorId: 2 }];
    expect(computeCriticalPath(tasks, edges)).toEqual(new Set());
  });
});
