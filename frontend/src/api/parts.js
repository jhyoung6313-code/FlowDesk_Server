import api from './axios';

export const getParts = () => api.get('/parts').then((r) => r.data);

export const createPart = (data) => api.post('/parts', data).then((r) => r.data);

export const updatePart = (id, data) => api.put(`/parts/${id}`, data).then((r) => r.data);

export const deletePart = (id) => api.delete(`/parts/${id}`).then((r) => r.data);
