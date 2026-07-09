import api from './axios';

export const getHolidays = (params) =>
  api.get('/holidays', { params }).then((r) => r.data);

export const createHoliday = (data) =>
  api.post('/holidays', data).then((r) => r.data);

export const deleteHoliday = (id) =>
  api.delete(`/holidays/${id}`).then((r) => r.data);
