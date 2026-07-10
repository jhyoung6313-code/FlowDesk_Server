import api from './axios';

// 주기
export const getCycles = () => api.get('/okr/cycles').then((r) => r.data);
export const createCycle = (data) => api.post('/okr/cycles', data).then((r) => r.data);
export const deleteCycle = (id) => api.delete(`/okr/cycles/${id}`).then((r) => r.data);

// 목표 트리
export const getTree = (cycleId) => api.get('/okr/tree', { params: { cycleId } }).then((r) => r.data);

// 목표
export const createObjective = (data) => api.post('/okr/objectives', data).then((r) => r.data);
export const updateObjective = (id, data) => api.put(`/okr/objectives/${id}`, data).then((r) => r.data);
export const deleteObjective = (id) => api.delete(`/okr/objectives/${id}`).then((r) => r.data);

// 핵심결과(KR)
export const createKeyResult = (objId, data) =>
  api.post(`/okr/objectives/${objId}/key-results`, data).then((r) => r.data);
export const updateKeyResult = (krId, data) =>
  api.put(`/okr/key-results/${krId}`, data).then((r) => r.data);
export const deleteKeyResult = (krId) => api.delete(`/okr/key-results/${krId}`).then((r) => r.data);

// 체크인
export const getCheckins = (krId) => api.get(`/okr/key-results/${krId}/checkins`).then((r) => r.data);
export const createCheckin = (krId, data) =>
  api.post(`/okr/key-results/${krId}/checkins`, data).then((r) => r.data);
