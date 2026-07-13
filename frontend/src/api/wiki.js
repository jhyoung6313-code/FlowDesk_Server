import api from './axios';

// 스페이스 (문서 트리 포함)
export const getSpaces = () => api.get('/wiki/spaces').then((r) => r.data);
export const createSpace = (data) => api.post('/wiki/spaces', data).then((r) => r.data);
export const updateSpace = (id, data) => api.put(`/wiki/spaces/${id}`, data).then((r) => r.data);
export const deleteSpace = (id) => api.delete(`/wiki/spaces/${id}`).then((r) => r.data);

// 문서
export const getDoc = (id) => api.get(`/wiki/docs/${id}`).then((r) => r.data);
export const createDoc = (data) => api.post('/wiki/docs', data).then((r) => r.data);
export const updateDoc = (id, data) => api.put(`/wiki/docs/${id}`, data).then((r) => r.data);
export const deleteDoc = (id) => api.delete(`/wiki/docs/${id}`).then((r) => r.data);

// 버전
export const getVersions = (id) => api.get(`/wiki/docs/${id}/versions`).then((r) => r.data);
export const restoreVersion = (id, vid) =>
  api.post(`/wiki/docs/${id}/versions/${vid}/restore`).then((r) => r.data);

// 댓글
export const getComments = (id) => api.get(`/wiki/docs/${id}/comments`).then((r) => r.data);
export const createComment = (id, content) =>
  api.post(`/wiki/docs/${id}/comments`, { content }).then((r) => r.data);
export const deleteComment = (cid) => api.delete(`/wiki/docs/comments/${cid}`).then((r) => r.data);
