// WBS 크리티컬패스(CPM) 계산 — 선후행 의존성(F-13 확장)으로 연결된 작업만 대상.
// 표준 CPM(순방향 ES/EF, 역방향 LS/LF, float=0 → 크리티컬)을 사용하되,
// 사용자가 직접 입력한 시작/종료일의 "기간(일수)"만 가중치로 쓰고 실제 달력 위치는 사용하지 않는다.
// 즉, 의존 체인의 총 소요기간이 전체 일정에 미치는 영향(여유시간 0)을 식별하는 용도.

function durationDays(startDate, endDate) {
  const ms = new Date(endDate) - new Date(startDate);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/**
 * @param {{id:number, startDate:Date|string|null, endDate:Date|string|null}[]} tasks
 * @param {{predecessorId:number, successorId:number}[]} edges
 * @returns {Set<number>} 크리티컬(float===0) 작업 id 집합
 */
function computeCriticalPath(tasks, edges) {
  const taskMap = new Map(tasks.filter((t) => t.startDate && t.endDate).map((t) => [t.id, t]));

  // 양끝 노드가 모두 유효 기간을 가진 엣지만 사용
  const validEdges = edges.filter((e) => taskMap.has(e.predecessorId) && taskMap.has(e.successorId));
  if (validEdges.length === 0) return new Set();

  const nodeIds = new Set();
  validEdges.forEach((e) => { nodeIds.add(e.predecessorId); nodeIds.add(e.successorId); });

  const predecessors = new Map([...nodeIds].map((id) => [id, []]));
  const successors = new Map([...nodeIds].map((id) => [id, []]));
  validEdges.forEach((e) => {
    predecessors.get(e.successorId).push(e.predecessorId);
    successors.get(e.predecessorId).push(e.successorId);
  });

  const duration = new Map([...nodeIds].map((id) => [id, durationDays(taskMap.get(id).startDate, taskMap.get(id).endDate)]));

  // Kahn 위상정렬 (순환 방지)
  const inDegree = new Map([...nodeIds].map((id) => [id, predecessors.get(id).length]));
  const queue = [...nodeIds].filter((id) => inDegree.get(id) === 0);
  const topoOrder = [];
  const q = [...queue];
  while (q.length) {
    const id = q.shift();
    topoOrder.push(id);
    successors.get(id).forEach((succId) => {
      inDegree.set(succId, inDegree.get(succId) - 1);
      if (inDegree.get(succId) === 0) q.push(succId);
    });
  }
  if (topoOrder.length !== nodeIds.size) return new Set(); // 순환 존재 → 계산 불가

  // 순방향: ES/EF
  const ES = new Map(); const EF = new Map();
  topoOrder.forEach((id) => {
    const preds = predecessors.get(id);
    const es = preds.length ? Math.max(...preds.map((p) => EF.get(p))) : 0;
    ES.set(id, es);
    EF.set(id, es + duration.get(id));
  });

  const projectDuration = Math.max(...[...nodeIds].map((id) => EF.get(id)));

  // 역방향: LS/LF
  const LS = new Map(); const LF = new Map();
  [...topoOrder].reverse().forEach((id) => {
    const succs = successors.get(id);
    const lf = succs.length ? Math.min(...succs.map((s) => LS.get(s))) : projectDuration;
    LF.set(id, lf);
    LS.set(id, lf - duration.get(id));
  });

  const critical = new Set();
  nodeIds.forEach((id) => {
    if (LS.get(id) - ES.get(id) === 0) critical.add(id);
  });
  return critical;
}

module.exports = { computeCriticalPath, durationDays };
