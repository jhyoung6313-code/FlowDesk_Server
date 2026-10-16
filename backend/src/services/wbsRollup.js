// WBS 상위 작업 진척률 자동 집계 — 하위 작업 기간(일수) 가중평균.
// 저장하지 않고 조회 시점에 계산(read-time rollup)해, 하위 작업이 바뀔 때마다 별도 재계산 로직/정합성 관리가 필요 없다.
// 자식이 없는 리프 작업은 사용자가 입력한 값을 그대로 사용한다.

const { durationDays } = require('./wbsCriticalPath');

// 기간(일수) 계산은 wbsCriticalPath.durationDays를 그대로 재사용한다 — 이전에는 이 파일과
// wbsController.js의 엑셀 내보내기까지 총 3곳에 거의 같은 수식(round vs ceil 혼용)이 따로
// 존재해서, 정확히 하루 단위로 나눠지지 않는 기간에 대해 서로 다른 결과를 낼 수 있었다.
function weightOf(node) {
  if (!node.startDate || !node.endDate) return 1;
  return durationDays(node.startDate, node.endDate);
}

// 트리(children 중첩)를 받아 상위 작업의 plannedProgress/actualProgress를
// 하위 작업 가중평균으로 덮어쓴 새 트리를 반환(후위 순회: 자식 먼저 계산).
function applyProgressRollup(nodes) {
  return nodes.map((node) => {
    if (!node.children || node.children.length === 0) {
      return node; // 리프: 사용자가 입력한 값 그대로
    }
    const rolledChildren = applyProgressRollup(node.children);
    let totalWeight = 0;
    let plannedSum = 0;
    let actualSum = 0;
    rolledChildren.forEach((c) => {
      const w = weightOf(c);
      totalWeight += w;
      plannedSum += w * (Number(c.plannedProgress) || 0);
      actualSum += w * (Number(c.actualProgress) || 0);
    });
    return {
      ...node,
      children: rolledChildren,
      plannedProgress: totalWeight ? Math.round((plannedSum / totalWeight) * 100) / 100 : 0,
      actualProgress: totalWeight ? Math.round((actualSum / totalWeight) * 100) / 100 : 0,
      isRollup: true,
    };
  });
}

module.exports = { applyProgressRollup, weightOf };
