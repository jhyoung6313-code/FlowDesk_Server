import api from './axios';

export const getMailList = (params) => api.get('/mail', { params }).then(r => r.data);
// params: { folder, page, limit, q, labelId }
export const getMail = (id) => api.get(`/mail/${id}`).then(r => r.data);
export const composeMail = (data) => api.post('/mail', data).then(r => r.data);
export const updateDraft = (id, data) => api.put(`/mail/${id}`, data).then(r => r.data);
export const sendDraft = (id) => api.post(`/mail/${id}/send`).then(r => r.data);
export const replyMail = (id, data) => api.post(`/mail/${id}/reply`, data).then(r => r.data);
export const forwardMail = (id, data) => api.post(`/mail/${id}/forward`, data).then(r => r.data);
export const toggleStar = (id) => api.patch(`/mail/${id}/star`).then(r => r.data);
export const markRead = (id, isRead) => api.patch(`/mail/${id}/read`, { isRead }).then(r => r.data);
export const trashMail = (id) => api.delete(`/mail/${id}`).then(r => r.data);
export const emptyTrash = () => api.delete('/mail/trash').then(r => r.data);
export const getUnreadCount = () => api.get('/mail/unread-count').then(r => r.data);

export const uploadMailAttachment = (mailId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/mail/${mailId}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};
export const downloadMailAttachment = (mailId, attId) =>
  `${api.defaults.baseURL}/mail/${mailId}/attachments/${attId}/download`;
export const deleteMailAttachment = (mailId, attId) =>
  api.delete(`/mail/${mailId}/attachments/${attId}`).then(r => r.data);

// 댓글
export const getMailComments = (mailId) => api.get(`/mail/${mailId}/comments`).then(r => r.data);
export const createMailComment = (mailId, content) => api.post(`/mail/${mailId}/comments`, { content }).then(r => r.data);
export const deleteMailComment = (mailId, cid) => api.delete(`/mail/${mailId}/comments/${cid}`).then(r => r.data);

// 라벨
export const getMailLabels = () => api.get('/mail/labels').then(r => r.data);
export const createMailLabel = (name, color) => api.post('/mail/labels', { name, color }).then(r => r.data);
export const updateMailLabel = (id, data) => api.put(`/mail/labels/${id}`, data).then(r => r.data);
export const deleteMailLabel = (id) => api.delete(`/mail/labels/${id}`).then(r => r.data);
export const setMailLabels = (mailId, labelIds) => api.put(`/mail/${mailId}/labels`, { labelIds }).then(r => r.data);

// 일괄 처리
export const bulkMailAction = (ids, action) => api.post('/mail/bulk', { ids, action }).then(r => r.data);
