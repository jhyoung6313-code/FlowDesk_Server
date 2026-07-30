import api from './axios';

export const getEmailSettings = () => api.get('/settings/email').then((r) => r.data);

export const updateEmailSettings = (data) => api.put('/settings/email', data).then((r) => r.data);

export const testEmailSettings = (data) => api.post('/settings/email/test', data).then((r) => r.data);

export const getWidgetSettings = () => api.get('/settings/widgets').then((r) => r.data);

export const updateWidgetSettings = (data) => api.put('/settings/widgets', data).then((r) => r.data);

export const getThemePrefs = () => api.get('/settings/theme').then((r) => r.data);

export const updateThemePrefs = (data) => api.put('/settings/theme', data).then((r) => r.data);

export const getDashboardLayout = () => api.get('/settings/dashboard-layout').then((r) => r.data);

export const updateDashboardLayout = (data) => api.put('/settings/dashboard-layout', data).then((r) => r.data);

export const getApprovalLinePresets = () => api.get('/settings/approval-lines').then((r) => r.data);

export const updateApprovalLinePresets = (data) => api.put('/settings/approval-lines', data).then((r) => r.data);
