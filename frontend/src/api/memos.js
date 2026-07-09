import api from './axios';

export const getMemos = () => api.get('/memos').then((r) => r.data);

export const createMemo = (data) => api.post('/memos', data).then((r) => r.data);

export const updateMemo = (id, data) =>
  api.put(`/memos/${id}`, data).then((r) => r.data);

export const deleteMemo = (id) => api.delete(`/memos/${id}`).then((r) => r.data);
