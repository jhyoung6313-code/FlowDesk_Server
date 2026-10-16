// 전자결재 문서 가시성 규칙의 단일 진실 원천.
// "이 결재문서를 누가 볼 수 있는가" = 작성자 본인 또는 결재선의 결재자(참조 포함) 또는 admin.
// approvalController(get/downloadAttachment) · documentController(통합 문서함) · searchController(전역검색)
// 세 곳이 각자 재구현하면 규칙이 갈라질 수 있어 이 모듈로 통일한다.

// Prisma where절 조각 — steps 서브쿼리를 직접 걸 때 사용(문서를 아직 로드하지 않은 목록/집계 쿼리용)
function approvalVisibilityWhere(userId) {
  return { OR: [{ createdBy: userId }, { steps: { some: { approverId: userId } } }] };
}

// 이미 로드한 문서(steps 포함)에 대한 boolean 체크 — admin은 호출부에서 별도 예외 처리
function canViewApprovalDoc(doc, userId) {
  if (doc.createdBy === userId) return true;
  return (doc.steps || []).some((s) => s.approverId === userId);
}

// "지금 이 사용자 차례인 결재 대기 단계"의 Prisma where 조각(참조 제외).
// 병렬결재 지원을 위해 이것만으로는 부족하다 — 문서의 현재 그룹(currentStep)과 stepOrder가
// 일치하는지 반드시 isMyTurnNow()로 한 번 더 검증해야 한다(같은 문서에 순서가 다른 미처리 단계가
// 동시에 존재할 수 있기 때문). approvalController.pendingCount/meController.today가 공유한다.
function myPendingStepWhere(userId) {
  return { approverId: userId, status: 'pending', type: { not: 'reference' } };
}

// 문서(currentStep 포함)와 "내 미처리 단계들(stepOrder만 있으면 됨)"을 받아 지금이 내 차례인지 판정.
function isMyTurnNow(document, myPendingSteps) {
  return (myPendingSteps || []).some((s) => s.stepOrder === document.currentStep);
}

module.exports = { approvalVisibilityWhere, canViewApprovalDoc, myPendingStepWhere, isMyTurnNow };
