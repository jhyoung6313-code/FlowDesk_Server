const { applyProgressRollup, weightOf } = require('../src/services/wbsRollup');

describe('weightOf', () => {
  test('시작/종료일 없으면 가중치 1', () => {
    expect(weightOf({})).toBe(1);
  });
  test('기간 일수(양끝 포함)를 가중치로 사용', () => {
    expect(weightOf({ startDate: '2026-01-01', endDate: '2026-01-05' })).toBe(5);
  });
});

describe('applyProgressRollup', () => {
  test('리프 작업은 값 그대로 유지', () => {
    const tree = [{ id: 1, name: 'leaf', plannedProgress: 40, actualProgress: 30, children: [] }];
    const result = applyProgressRollup(tree);
    expect(result[0].plannedProgress).toBe(40);
    expect(result[0].actualProgress).toBe(30);
    expect(result[0].isRollup).toBeUndefined();
  });

  test('부모는 자식의 기간 가중평균으로 덮어씀', () => {
    const tree = [{
      id: 1, name: 'parent', plannedProgress: 999, actualProgress: 999, // 기존 저장값 — 무시되어야 함
      children: [
        { id: 2, name: 'c1', startDate: '2026-01-01', endDate: '2026-01-04', plannedProgress: 100, actualProgress: 50, children: [] }, // 4일
        { id: 3, name: 'c2', startDate: '2026-01-05', endDate: '2026-01-05', plannedProgress: 0, actualProgress: 0, children: [] }, // 1일
      ],
    }];
    const result = applyProgressRollup(tree);
    // (100*4 + 0*1)/5 = 80, (50*4 + 0*1)/5 = 40
    expect(result[0].plannedProgress).toBe(80);
    expect(result[0].actualProgress).toBe(40);
    expect(result[0].isRollup).toBe(true);
  });

  test('손자까지 중첩되어도 후위순회로 올바르게 집계', () => {
    const tree = [{
      id: 1, name: 'root', children: [
        {
          id: 2, name: 'mid', children: [
            { id: 4, name: 'leaf1', startDate: '2026-01-01', endDate: '2026-01-01', plannedProgress: 100, actualProgress: 100, children: [] },
            { id: 5, name: 'leaf2', startDate: '2026-01-02', endDate: '2026-01-02', plannedProgress: 0, actualProgress: 0, children: [] },
          ],
        },
      ],
    }];
    const result = applyProgressRollup(tree);
    expect(result[0].children[0].actualProgress).toBe(50); // mid = (100+0)/2
    expect(result[0].actualProgress).toBe(50); // root는 mid 하나뿐이므로 동일 전파
  });

  test('자식이 날짜 없으면 동일 가중치(1)로 단순평균', () => {
    const tree = [{
      id: 1, children: [
        { id: 2, actualProgress: 0, plannedProgress: 0, children: [] },
        { id: 3, actualProgress: 100, plannedProgress: 100, children: [] },
      ],
    }];
    const result = applyProgressRollup(tree);
    expect(result[0].actualProgress).toBe(50);
  });
});
