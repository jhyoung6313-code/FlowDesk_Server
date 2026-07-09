import api from './axios';

// ── 카테고리 ──────────────────────────────────────────────────
export const getBbsCategories = () => api.get('/bbs-categories').then(r => r.data);
export const createBbsCategory = (data) => api.post('/bbs-categories', data).then(r => r.data);
export const updateBbsCategory = (id, data) => api.put(`/bbs-categories/${id}`, data).then(r => r.data);
export const deleteBbsCategory = (id) => api.delete(`/bbs-categories/${id}`).then(r => r.data);
export const reorderBbsCategories = (items) => api.put('/bbs-categories/reorder', items).then(r => r.data);

// ── 대시보드 게시판 (관리자 지정 + 개인 지정) ────────────────────
export const getDashboardBbsCategories = () => api.get('/bbs-categories/dashboard').then(r => r.data);
export const setPersonalDashboardBbsCategories = (categoryIds) =>
  api.put('/bbs-categories/dashboard', { categoryIds }).then(r => r.data);

// ── 게시글 ────────────────────────────────────────────────────
export const getBbsPosts = (params) => api.get('/bbs', { params }).then(r => r.data);
export const getBbsPost = (id) => api.get(`/bbs/${id}`).then(r => r.data);
export const createBbsPost = (data) => api.post('/bbs', data).then(r => r.data);
export const updateBbsPost = (id, data) => api.put(`/bbs/${id}`, data).then(r => r.data);
export const deleteBbsPost = (id) => api.delete(`/bbs/${id}`).then(r => r.data);
export const pinBbsPost = (id) => api.put(`/bbs/${id}/pin`).then(r => r.data);

// ── 댓글 ──────────────────────────────────────────────────────
export const getBbsComments = (postId) => api.get(`/bbs/${postId}/comments`).then(r => r.data);
export const createBbsComment = (postId, data) => api.post(`/bbs/${postId}/comments`, data).then(r => r.data);
export const updateBbsComment = (postId, cid, data) => api.put(`/bbs/${postId}/comments/${cid}`, data).then(r => r.data);
export const deleteBbsComment = (postId, cid) => api.delete(`/bbs/${postId}/comments/${cid}`).then(r => r.data);

// ── 첨부파일 ──────────────────────────────────────────────────
export const uploadBbsAttachment = (postId, file, commentId = null) => {
  const form = new FormData();
  form.append('file', file);
  if (commentId) form.append('commentId', commentId);
  return api.post(`/bbs/${postId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
export const downloadBbsAttachmentUrl = (postId, aid) => `/api/bbs/${postId}/attachments/${aid}/download`;
export const deleteBbsAttachment = (postId, aid) => api.delete(`/bbs/${postId}/attachments/${aid}`).then(r => r.data);
