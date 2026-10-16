// 결재선(approvalLine: [{approverId, type, stepOrder, ...}]) 공통 헬퍼.
// 참조(reference)는 진행에 영향을 주지 않으므로 그룹(차수) 계산 대상에서 제외한다.
// DocumentForm.jsx(결재 작성)와 Admin/ApprovalLineEditor.jsx(양식 기본 결재선 관리) 양쪽에서 공유.

export function flowStepsOf(line) {
  return line.filter(s => s.type !== 'reference');
}

// 비참조 스텝의 고유 차수(stepOrder) 오름차순 목록
export function groupOrdersOf(line) {
  return [...new Set(flowStepsOf(line).map(s => s.stepOrder))].sort((a, b) => a - b);
}

// 다음에 추가할 결재자가 받을 새 차수(기존 최대값+1)
export function nextGroupNo(line) {
  const orders = flowStepsOf(line).map(s => s.stepOrder);
  return orders.length ? Math.max(...orders) + 1 : 1;
}

// 차수를 1..N으로 압축(공백 제거) — 오름차순 상대 순서는 보존. 참조는 항상 0.
export function compactGroups(line) {
  const orders = groupOrdersOf(line);
  const orderMap = new Map(orders.map((o, idx) => [o, idx + 1]));
  return line.map(s => (s.type === 'reference' ? { ...s, stepOrder: 0 } : { ...s, stepOrder: orderMap.get(s.stepOrder) }));
}
