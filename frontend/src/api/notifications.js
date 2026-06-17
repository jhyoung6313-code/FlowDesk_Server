import api from './axios';

export const getNotifications = () => api.get('/notifications').then((r) => r.data);

export const readNotification = (id) =>
  api.patch(`/notifications/${id}/read`).then((r) => r.data);

export const readAllNotifications = () =>
  api.patch('/notifications/read-all').then((r) => r.data);
