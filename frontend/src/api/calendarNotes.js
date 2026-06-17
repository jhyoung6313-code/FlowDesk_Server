import api from './axios';

export const getCalendarNotes = (start, end) =>
  api.get('/calendar-notes', { params: { start, end } }).then((r) => r.data);

export const createCalendarNote = (data) =>
  api.post('/calendar-notes', data).then((r) => r.data);

export const updateCalendarNote = (id, data) =>
  api.put(`/calendar-notes/${id}`, data).then((r) => r.data);

export const deleteCalendarNote = (id) =>
  api.delete(`/calendar-notes/${id}`).then((r) => r.data);
