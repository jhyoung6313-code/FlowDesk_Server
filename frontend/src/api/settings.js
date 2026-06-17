import api from './axios';

export const getEmailSettings = () => api.get('/settings/email').then((r) => r.data);

export const updateEmailSettings = (data) => api.put('/settings/email', data).then((r) => r.data);

export const testEmailSettings = (data) => api.post('/settings/email/test', data).then((r) => r.data);

export const getWidgetSettings = () => api.get('/settings/widgets').then((r) => r.data);

export const updateWidgetSettings = (data) => api.put('/settings/widgets', data).then((r) => r.data);
