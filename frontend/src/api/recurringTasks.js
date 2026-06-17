import api from './axios';

export const getRecurringTasks = () => api.get('/recurring-tasks').then((r) => r.data);

export const getRecurringTask = (id) => api.get(`/recurring-tasks/${id}`).then((r) => r.data);

export const createRecurringTask = (data) => api.post('/recurring-tasks', data).then((r) => r.data);

export const updateRecurringTask = (id, data) => api.put(`/recurring-tasks/${id}`, data).then((r) => r.data);

export const deleteRecurringTask = (id) => api.delete(`/recurring-tasks/${id}`).then((r) => r.data);

export const generateRecurringTasksNow = () => api.post('/recurring-tasks/generate').then((r) => r.data);
