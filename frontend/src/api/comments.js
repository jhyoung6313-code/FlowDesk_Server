import api from './axios';

export const getComments = (taskId) =>
  api.get(`/tasks/${taskId}/comments`).then((r) => r.data);

export const createComment = (taskId, content) =>
  api.post(`/tasks/${taskId}/comments`, { content }).then((r) => r.data);

export const updateComment = (commentId, content) =>
  api.put(`/tasks/comments/${commentId}`, { content }).then((r) => r.data);

export const deleteComment = (commentId) =>
  api.delete(`/tasks/comments/${commentId}`).then((r) => r.data);

export const uploadCommentAttachment = (taskId, commentId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api
    .post(`/tasks/${taskId}/comments/${commentId}/attachment`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};
