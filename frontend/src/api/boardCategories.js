import api from './axios';

// 보드 카테고리
export const getBoardCategories = () => api.get('/board-categories').then(r => r.data);
export const createBoardCategory = (data) => api.post('/board-categories', data).then(r => r.data);
export const updateBoardCategory = (id, data) => api.put(`/board-categories/${id}`, data).then(r => r.data);
export const deleteBoardCategory = (id) => api.delete(`/board-categories/${id}`).then(r => r.data);
export const reorderBoardCategories = (items) =>
  api.patch('/board-categories/reorder', { items }).then(r => r.data);

// 보드 순서/카테고리 이동 일괄 갱신
export const reorderBoards = (items) =>
  api.patch('/boards/reorder', { items }).then(r => r.data);
