import api from './axios';

export const getUsers = () => api.get('/users').then((r) => r.data);

export const createUser = (data) => api.post('/users', data).then((r) => r.data);

export const updateUser = (id, data) => api.put(`/users/${id}`, data).then((r) => r.data);

export const deactivateUser = (id) =>
  api.patch(`/users/${id}/deactivate`).then((r) => r.data);

export const activateUser = (id) =>
  api.patch(`/users/${id}/activate`).then((r) => r.data);

export const resetUserPassword = (id) =>
  api.patch(`/users/${id}/reset-password`).then((r) => r.data);

export const updateMyAvatarColor = (color) =>
  api.patch('/users/me/avatar-color', { color }).then((r) => r.data);

export const setMyStatus = (statusEmoji, statusText) =>
  api.put('/users/me/status', { statusEmoji, statusText }).then((r) => r.data);
