import api from './axios';

export const getMilestones = (params) => api.get('/milestones', { params }).then((r) => r.data);

export const createMilestone = (data) => api.post('/milestones', data).then((r) => r.data);

export const updateMilestone = (id, data) => api.put(`/milestones/${id}`, data).then((r) => r.data);

export const deleteMilestone = (id) => api.delete(`/milestones/${id}`).then((r) => r.data);
