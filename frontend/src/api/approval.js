import api from './axios';

// ── 결재 양식 종류 ────────────────────────────────────────────
export const getApprovalFormTypes = () => api.get('/approval-types').then(r => r.data);
export const createApprovalFormType = (data) => api.post('/approval-types', data).then(r => r.data);
export const updateApprovalFormType = (id, data) => api.put(`/approval-types/${id}`, data).then(r => r.data);
export const deleteApprovalFormType = (id) => api.delete(`/approval-types/${id}`).then(r => r.data);
export const reorderApprovalFormTypes = (items) => api.put('/approval-types/reorder', items).then(r => r.data);

// ── 결재 양식 템플릿 ──────────────────────────────────────────
export const getApprovalTemplates = (params) => api.get('/approval-templates', { params }).then(r => r.data);
export const getApprovalTemplate = (id) => api.get(`/approval-templates/${id}`).then(r => r.data);
// 관리자가 양식을 미리 만들어두지 않아도 바로 쓸 수 있는 시스템 기본 "자유 양식"(제목+본문만)
export const getFreeformApprovalTemplate = () => api.get('/approval-templates/freeform').then(r => r.data);
export const resolveApprovalLine = (id, formData = {}) =>
  api.post(`/approval-templates/${id}/resolve-line`, { formData }).then(r => r.data);
export const createApprovalTemplate = (data) => api.post('/approval-templates', data).then(r => r.data);
export const updateApprovalTemplate = (id, data) => api.put(`/approval-templates/${id}`, data).then(r => r.data);
export const deleteApprovalTemplate = (id) => api.delete(`/approval-templates/${id}`).then(r => r.data);

// ── 결재자 그룹 (재사용 가능한 사용자 묶음) ───────────────────
export const getApprovalApproverGroups = () => api.get('/approval-approver-groups').then(r => r.data);
export const createApprovalApproverGroup = (data) => api.post('/approval-approver-groups', data).then(r => r.data);
export const updateApprovalApproverGroup = (id, data) => api.put(`/approval-approver-groups/${id}`, data).then(r => r.data);
export const deleteApprovalApproverGroup = (id) => api.delete(`/approval-approver-groups/${id}`).then(r => r.data);

// ── 결재 현황 통계 (관리자) ────────────────────────────────────
export const getApprovalStats = (params) => api.get('/approvals/stats', { params }).then(r => r.data);

// ── 결재 문서 ──────────────────────────────────────────────────
export const getApprovals = (params) => api.get('/approvals', { params }).then(r => r.data);
export const getApprovalTree = (params) => api.get('/approvals/tree', { params }).then(r => r.data);
export const getApproval = (id) => api.get(`/approvals/${id}`).then(r => r.data);
export const createApproval = (data) => api.post('/approvals', data).then(r => r.data);
export const updateApproval = (id, data) => api.put(`/approvals/${id}`, data).then(r => r.data);
export const submitApproval = (id) => api.post(`/approvals/${id}/submit`).then(r => r.data);
export const approveApproval = (id, comment) => api.post(`/approvals/${id}/approve`, { comment }).then(r => r.data);
export const rejectApproval = (id, comment, category) => api.post(`/approvals/${id}/reject`, { comment, category }).then(r => r.data);
export const getRejectCategories = () => api.get('/approvals/reject-categories').then(r => r.data);
export const cancelApproval = (id) => api.post(`/approvals/${id}/cancel`).then(r => r.data);
export const delegateApproval = (id, toUserId, comment) => api.post(`/approvals/${id}/delegate`, { toUserId, comment }).then(r => r.data);
export const resubmitApproval = (id) => api.post(`/approvals/${id}/resubmit`).then(r => r.data);
export const resumeApproval = (id) => api.post(`/approvals/${id}/resume`).then(r => r.data);
export const deleteApproval = (id) => api.delete(`/approvals/${id}`).then(r => r.data);
export const getApprovalPendingCount = () => api.get('/approvals/pending-count').then(r => r.data);
// 상신 후 결재자/참조자 추가·제거 — 참조는 언제나, 승인/합의/전결은 아직 지나지 않은 미래 차수에만 허용
export const addApprovalStep = (id, data) => api.post(`/approvals/${id}/steps`, data).then(r => r.data);
export const removeApprovalStep = (id, stepId) => api.delete(`/approvals/${id}/steps/${stepId}`).then(r => r.data);

// ── 결재 문서 첨부파일 ────────────────────────────────────────
export const uploadApprovalAttachment = (documentId, file, commentId) => {
  const form = new FormData();
  form.append('file', file);
  if (commentId) form.append('commentId', commentId);
  return api.post(`/approvals/${documentId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
export const downloadApprovalAttachmentUrl = (documentId, aid) =>
  `/api/approvals/${documentId}/attachments/${aid}/download`;
export const deleteApprovalAttachment = (documentId, aid) =>
  api.delete(`/approvals/${documentId}/attachments/${aid}`).then(r => r.data);

// ── 결재 의견 ──────────────────────────────────────────────────
export const getApprovalComments = (documentId) => api.get(`/approvals/${documentId}/comments`).then(r => r.data);
export const createApprovalComment = (documentId, content) =>
  api.post(`/approvals/${documentId}/comments`, { content }).then(r => r.data);
export const updateApprovalComment = (documentId, cid, content) =>
  api.put(`/approvals/${documentId}/comments/${cid}`, { content }).then(r => r.data);
export const deleteApprovalComment = (documentId, cid) =>
  api.delete(`/approvals/${documentId}/comments/${cid}`).then(r => r.data);
