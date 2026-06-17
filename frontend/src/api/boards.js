import api from './axios';

// 보드
export const getBoards = () => api.get('/boards').then(r => r.data);
export const getBoardUnreadCount = () => api.get('/boards/unread-count').then(r => r.data);
export const markBoardRead = (id) => api.post(`/boards/${id}/read`).then(r => r.data);
export const createBoard = (data) => api.post('/boards', data).then(r => r.data);
export const getBoard = (id) => api.get(`/boards/${id}`).then(r => r.data);
export const updateBoard = (id, data) => api.put(`/boards/${id}`, data).then(r => r.data);
export const deleteBoard = (id) => api.delete(`/boards/${id}`).then(r => r.data);
export const exportBoard = (id) => api.get(`/boards/${id}/export`).then(r => r.data);
export const importBoard = (data) => api.post('/boards/import', data).then(r => r.data);

// 저장 뷰
export const getBoardViews = (boardId) => api.get(`/boards/${boardId}/views`).then(r => r.data);
export const createBoardView = (boardId, data) => api.post(`/boards/${boardId}/views`, data).then(r => r.data);
export const updateBoardView = (boardId, viewId, data) =>
  api.put(`/boards/${boardId}/views/${viewId}`, data).then(r => r.data);
export const deleteBoardView = (boardId, viewId) =>
  api.delete(`/boards/${boardId}/views/${viewId}`).then(r => r.data);
export const reorderBoardViews = (boardId, items) =>
  api.patch(`/boards/${boardId}/views/reorder`, { items }).then(r => r.data);

// 카드
export const getCards = (boardId) => api.get(`/boards/${boardId}/cards`).then(r => r.data);
export const createCard = (boardId, data) => api.post(`/boards/${boardId}/cards`, data).then(r => r.data);
export const updateCard = (boardId, cardId, data) => api.put(`/boards/${boardId}/cards/${cardId}`, data).then(r => r.data);
export const deleteCard = (boardId, cardId) => api.delete(`/boards/${boardId}/cards/${cardId}`).then(r => r.data);
export const updateCardProperties = (boardId, cardId, propertyValues) =>
  api.patch(`/boards/${boardId}/cards/${cardId}/properties`, { propertyValues }).then(r => r.data);
export const reorderCards = (boardId, orders) =>
  api.patch(`/boards/${boardId}/cards/reorder`, { orders }).then(r => r.data);
export const getCardPreview = (boardId, cardId) =>
  api.get(`/boards/${boardId}/cards/${cardId}/preview`).then(r => r.data);

// 카드 커버 이미지
export const uploadCoverImage = (boardId, cardId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/boards/${boardId}/cards/${cardId}/cover-image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
export const deleteCoverImage = (boardId, cardId) =>
  api.delete(`/boards/${boardId}/cards/${cardId}/cover-image`).then(r => r.data);

// 카드 댓글
export const createCardComment = (boardId, cardId, content, mentions = []) =>
  api.post(`/boards/${boardId}/cards/${cardId}/comments`, { content, mentions }).then(r => r.data);
export const updateCardComment = (boardId, cardId, commentId, content) =>
  api.put(`/boards/${boardId}/cards/${cardId}/comments/${commentId}`, { content }).then(r => r.data);
export const deleteCardComment = (boardId, cardId, commentId) =>
  api.delete(`/boards/${boardId}/cards/${cardId}/comments/${commentId}`).then(r => r.data);
export const uploadCommentAttachment = (boardId, cardId, commentId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/boards/${boardId}/cards/${cardId}/comments/${commentId}/attachment`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

// 카드 첨부파일
export const uploadCardAttachment = (boardId, cardId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/boards/${boardId}/cards/${cardId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
export const downloadCardAttachmentUrl = (boardId, cardId, attachmentId) =>
  `/api/boards/${boardId}/cards/${cardId}/attachments/${attachmentId}/download`;
export const deleteCardAttachment = (boardId, cardId, attachmentId) =>
  api.delete(`/boards/${boardId}/cards/${cardId}/attachments/${attachmentId}`).then(r => r.data);

// 카드 체크리스트
export const createChecklistItem = (boardId, cardId, content) =>
  api.post(`/boards/${boardId}/cards/${cardId}/checklists`, { content }).then(r => r.data);
export const updateChecklistItem = (boardId, cardId, itemId, data) =>
  api.patch(`/boards/${boardId}/cards/${cardId}/checklists/${itemId}`, data).then(r => r.data);
export const deleteChecklistItem = (boardId, cardId, itemId) =>
  api.delete(`/boards/${boardId}/cards/${cardId}/checklists/${itemId}`).then(r => r.data);

// 속성
export const getProperties = (boardId) => api.get(`/boards/${boardId}/properties`).then(r => r.data);
export const createProperty = (boardId, data) => api.post(`/boards/${boardId}/properties`, data).then(r => r.data);
export const updateProperty = (boardId, propId, data) => api.put(`/boards/${boardId}/properties/${propId}`, data).then(r => r.data);
export const deleteProperty = (boardId, propId) => api.delete(`/boards/${boardId}/properties/${propId}`).then(r => r.data);

// 멤버
export const getMembers = (boardId) => api.get(`/boards/${boardId}/members`).then(r => r.data);
export const addMember = (boardId, data) => api.post(`/boards/${boardId}/members`, data).then(r => r.data);
export const removeMember = (boardId, userId) => api.delete(`/boards/${boardId}/members/${userId}`).then(r => r.data);

// 즐겨찾기
export const toggleFavorite = (boardId) => api.post(`/boards/${boardId}/favorite`).then(r => r.data);

// 카드 복제
export const duplicateCard = (boardId, cardId) =>
  api.post(`/boards/${boardId}/cards/${cardId}/duplicate`).then(r => r.data);

// 의존성
export const getDependencies = (boardId, cardId) =>
  api.get(`/boards/${boardId}/cards/${cardId}/dependencies`).then(r => r.data);
export const addDependency = (boardId, cardId, blockingId) =>
  api.post(`/boards/${boardId}/cards/${cardId}/dependencies`, { blockingId }).then(r => r.data);
export const removeDependency = (boardId, cardId, depId) =>
  api.delete(`/boards/${boardId}/cards/${cardId}/dependencies/${depId}`).then(r => r.data);

// 업무 연결
export const linkTask = (boardId, cardId, taskId) =>
  api.patch(`/boards/${boardId}/cards/${cardId}/link-task`, { taskId }).then(r => r.data);

// 자동화
export const getAutomations = (boardId) => api.get(`/boards/${boardId}/automations`).then(r => r.data);
export const createAutomation = (boardId, data) => api.post(`/boards/${boardId}/automations`, data).then(r => r.data);
export const updateAutomation = (boardId, autoId, data) =>
  api.put(`/boards/${boardId}/automations/${autoId}`, data).then(r => r.data);
export const deleteAutomation = (boardId, autoId) =>
  api.delete(`/boards/${boardId}/automations/${autoId}`).then(r => r.data);
