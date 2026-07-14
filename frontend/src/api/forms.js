import api from './axios';

// Forms(설문/투표) 엔진 (F-66)
export const getForms = () => api.get('/forms').then((r) => r.data);
export const getForm = (id) => api.get(`/forms/${id}`).then((r) => r.data);
export const createForm = (data) => api.post('/forms', data).then((r) => r.data);
export const updateForm = (id, data) => api.put(`/forms/${id}`, data).then((r) => r.data);
export const deleteForm = (id) => api.delete(`/forms/${id}`).then((r) => r.data);
export const setFormStatus = (id, status) => api.patch(`/forms/${id}/status`, { status }).then((r) => r.data);
export const submitForm = (id, answers) => api.post(`/forms/${id}/responses`, { answers }).then((r) => r.data);
export const getFormResults = (id) => api.get(`/forms/${id}/results`).then((r) => r.data);
