import api from './axios';

export const getTasks = (params) => api.get('/tasks', { params }).then((r) => r.data);

export const createTask = (data) => api.post('/tasks', data).then((r) => r.data);

export const getTask = (id) => api.get(`/tasks/${id}`).then((r) => r.data);

export const updateTask = (id, data) => api.put(`/tasks/${id}`, data).then((r) => r.data);

export const deleteTask = (id) => api.delete(`/tasks/${id}`).then((r) => r.data);

export const updateTaskStatus = (id, status) =>
  api.patch(`/tasks/${id}/status`, { status }).then((r) => r.data);

export const getCalendarTasks = (start, end) =>
  api.get('/tasks/calendar', { params: { start, end } }).then((r) => r.data);

export const getGanttTasks = () => api.get('/tasks/gantt').then((r) => r.data);

// 첨부파일
export const getAttachments = (taskId) =>
  api.get(`/tasks/${taskId}/attachments`).then((r) => r.data);

export const uploadAttachment = (taskId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/tasks/${taskId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const deleteAttachment = (attachmentId) =>
  api.delete(`/tasks/attachments/${attachmentId}`).then((r) => r.data);

export const getAttachmentDownloadUrl = (attachmentId) =>
  `/api/tasks/attachments/${attachmentId}/download`;

// 히스토리
export const getTaskHistory = (taskId) =>
  api.get(`/tasks/${taskId}/history`).then((r) => r.data);

// 일괄 처리
export const bulkAction = (ids, action, status) =>
  api.post('/tasks/bulk', { ids, action, status }).then((r) => r.data);
