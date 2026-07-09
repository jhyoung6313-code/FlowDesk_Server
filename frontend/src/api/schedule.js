import api from './axios';

/* ── 일정 이벤트 ── */
export const getScheduleEvents = (params) =>
  api.get('/schedules', { params }).then((r) => r.data);

export const createScheduleEvent = (data) =>
  api.post('/schedules', data).then((r) => r.data);

export const updateScheduleEvent = (id, data) =>
  api.put(`/schedules/${id}`, data).then((r) => r.data);

export const deleteScheduleEvent = (id) =>
  api.delete(`/schedules/${id}`).then((r) => r.data);

/* ── 자원(회의실·차량) ── */
export const getScheduleResources = (kind) =>
  api.get('/schedules/resources', { params: kind ? { kind } : {} }).then((r) => r.data);

export const createScheduleResource = (data) =>
  api.post('/schedules/resources', data).then((r) => r.data);

export const updateScheduleResource = (id, data) =>
  api.put(`/schedules/resources/${id}`, data).then((r) => r.data);

export const deleteScheduleResource = (id) =>
  api.delete(`/schedules/resources/${id}`).then((r) => r.data);
