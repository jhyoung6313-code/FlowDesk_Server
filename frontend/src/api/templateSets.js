import api from './axios';

// 템플릿 세트(F-41 확장) — 여러 업무 템플릿을 묶어 한 번에 생성
export const getTemplateSets = () => api.get('/template-sets').then((r) => r.data);

export const createTemplateSet = (data) => api.post('/template-sets', data).then((r) => r.data);

export const updateTemplateSet = (id, data) => api.put(`/template-sets/${id}`, data).then((r) => r.data);

export const deleteTemplateSet = (id) => api.delete(`/template-sets/${id}`).then((r) => r.data);

export const applyTemplateSet = (id, kickoffDate) =>
  api.post(`/template-sets/${id}/apply`, { kickoffDate }).then((r) => r.data);
