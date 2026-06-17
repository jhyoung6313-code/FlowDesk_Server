import api from './axios';

export const getComments = (taskId) =>
  api.get(`/tasks/${taskId}/comments`).then((r) => r.data);

export const createComment = (taskId, content) =>
  api.post(`/tasks/${taskId}/comments`, { content }).then((r) => r.data);

export const updateComment = (commentId, content) =>
  api.put(`/tasks/comments/${commentId}`, { content }).then((r) => r.data);

export const deleteComment = (commentId) =>
  api.delete(`/tasks/comments/${commentId}`).then((r) => r.data);
