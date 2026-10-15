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

// 관리자: 계정의 현재 접속을 강제 종료 (1계정 1로그인 잠김 해소)
export const forceLogoutUser = (id) =>
  api.patch(`/users/${id}/force-logout`).then((r) => r.data);

export const updateMyAvatarColor = (color) =>
  api.patch('/users/me/avatar-color', { color }).then((r) => r.data);

export const setMyStatus = (statusEmoji, statusText) =>
  api.put('/users/me/status', { statusEmoji, statusText }).then((r) => r.data);

export const uploadMySignature = (file, kind = 'sign') => {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  return api.post('/users/me/signature', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const deleteMySignature = (kind = 'sign') =>
  api.delete('/users/me/signature', { params: { kind } }).then((r) => r.data);
