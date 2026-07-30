import api from './axios';

// 범용 자동화 규칙 (F-62)
export const getAutomationCatalog = () => api.get('/automations/catalog').then((r) => r.data);
export const getAutomationRules = () => api.get('/automations').then((r) => r.data);
export const getAutomationRule = (id) => api.get(`/automations/${id}`).then((r) => r.data);
export const createAutomationRule = (data) => api.post('/automations', data).then((r) => r.data);
export const updateAutomationRule = (id, data) => api.put(`/automations/${id}`, data).then((r) => r.data);
export const deleteAutomationRule = (id) => api.delete(`/automations/${id}`).then((r) => r.data);
export const testAutomationRule = (id, context) => api.post(`/automations/${id}/test`, { context }).then((r) => r.data);
