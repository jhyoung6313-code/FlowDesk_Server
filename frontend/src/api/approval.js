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
export const resolveApprovalLine = (id, formData = {}) =>
  api.post(`/approval-templates/${id}/resolve-line`, { formData }).then(r => r.data);
export const createApprovalTemplate = (data) => api.post('/approval-templates', data).then(r => r.data);
export const updateApprovalTemplate = (id, data) => api.put(`/approval-templates/${id}`, data).then(r => r.data);
export const deleteApprovalTemplate = (id) => api.delete(`/approval-templates/${id}`).then(r => r.data);

// ── 결재 문서 ──────────────────────────────────────────────────
export const getApprovals = (params) => api.get('/approvals', { params }).then(r => r.data);
export const getApproval = (id) => api.get(`/approvals/${id}`).then(r => r.data);
export const createApproval = (data) => api.post('/approvals', data).then(r => r.data);
export const updateApproval = (id, data) => api.put(`/approvals/${id}`, data).then(r => r.data);
export const submitApproval = (id) => api.post(`/approvals/${id}/submit`).then(r => r.data);
export const approveApproval = (id, comment) => api.post(`/approvals/${id}/approve`, { comment }).then(r => r.data);
export const rejectApproval = (id, comment) => api.post(`/approvals/${id}/reject`, { comment }).then(r => r.data);
export const cancelApproval = (id) => api.post(`/approvals/${id}/cancel`).then(r => r.data);
export const resubmitApproval = (id) => api.post(`/approvals/${id}/resubmit`).then(r => r.data);
export const resumeApproval = (id) => api.post(`/approvals/${id}/resume`).then(r => r.data);
export const deleteApproval = (id) => api.delete(`/approvals/${id}`).then(r => r.data);
export const getApprovalPendingCount = () => api.get('/approvals/pending-count').then(r => r.data);

// ── 결재 문서 첨부파일 ────────────────────────────────────────
export const uploadApprovalAttachment = (documentId, file) => {
  const form = new FormData();
  form.append('file', file);
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
