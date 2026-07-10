import api from './axios';

export const getMeetings = (filter) =>
  api.get('/meetings', { params: filter ? { filter } : {} }).then((r) => r.data);
export const getMeeting = (id) => api.get(`/meetings/${id}`).then((r) => r.data);
export const createMeeting = (data) => api.post('/meetings', data).then((r) => r.data);
export const updateMeeting = (id, data) => api.put(`/meetings/${id}`, data).then((r) => r.data);
export const deleteMeeting = (id) => api.delete(`/meetings/${id}`).then((r) => r.data);

export const rsvpMeeting = (id, rsvp) =>
  api.patch(`/meetings/${id}/rsvp`, { rsvp }).then((r) => r.data);

// AI 회의록 요약 (모델 추론 시간이 길 수 있어 넉넉한 타임아웃)
export const aiSummarizeMeeting = (id) =>
  api.post(`/meetings/${id}/ai-summary`, {}, { timeout: 90000 }).then((r) => r.data);

// 결정사항
export const addDecision = (id, content) =>
  api.post(`/meetings/${id}/decisions`, { content }).then((r) => r.data);
export const deleteDecision = (id, did) =>
  api.delete(`/meetings/${id}/decisions/${did}`).then((r) => r.data);

// 액션아이템
export const addActionItem = (id, data) =>
  api.post(`/meetings/${id}/action-items`, data).then((r) => r.data);
export const updateActionItem = (id, aid, data) =>
  api.put(`/meetings/${id}/action-items/${aid}`, data).then((r) => r.data);
export const deleteActionItem = (id, aid) =>
  api.delete(`/meetings/${id}/action-items/${aid}`).then((r) => r.data);
export const actionItemToTask = (id, aid) =>
  api.post(`/meetings/${id}/action-items/${aid}/to-task`).then((r) => r.data);
