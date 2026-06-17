import api from './axios';

export const getRooms = () => api.get('/chat/rooms').then((r) => r.data);
export const getPublicRooms = () => api.get('/chat/rooms/public').then((r) => r.data);

export const createRoom = (data) => api.post('/chat/rooms', data).then((r) => r.data);
export const joinPublicRoom = (roomId) => api.post(`/chat/rooms/${roomId}/join`).then((r) => r.data);
export const updateRoom = (roomId, data) => api.put(`/chat/rooms/${roomId}`, data).then((r) => r.data);
export const toggleArchive = (roomId) => api.put(`/chat/rooms/${roomId}/archive`).then((r) => r.data);
export const toggleFavorite = (roomId) => api.put(`/chat/rooms/${roomId}/favorite`).then((r) => r.data);
export const toggleMute = (roomId) => api.put(`/chat/rooms/${roomId}/mute`).then((r) => r.data);

export const getMessages = (roomId, params = {}) =>
  api.get(`/chat/rooms/${roomId}/messages`, { params }).then((r) => r.data);

export const getThread = (messageId) =>
  api.get(`/chat/messages/${messageId}/thread`).then((r) => r.data);

export const markRead = (roomId) => api.put(`/chat/rooms/${roomId}/read`).then((r) => r.data);
export const markUnread = (roomId, messageId) =>
  api.put(`/chat/rooms/${roomId}/unread`, { messageId }).then((r) => r.data);

export const editMessage = (messageId, content) =>
  api.put(`/chat/messages/${messageId}`, { content }).then((r) => r.data);
export const deleteMessage = (messageId) =>
  api.delete(`/chat/messages/${messageId}`).then((r) => r.data);

export const toggleReaction = (messageId, emoji) =>
  api.post(`/chat/messages/${messageId}/reaction`, { emoji }).then((r) => r.data);

export const getPinnedMessages = (roomId) =>
  api.get(`/chat/rooms/${roomId}/pinned`).then((r) => r.data);
export const togglePin = (messageId) =>
  api.post(`/chat/messages/${messageId}/pin`).then((r) => r.data);

export const getSavedMessages = () => api.get('/chat/saved').then((r) => r.data);
export const toggleSave = (messageId) =>
  api.post(`/chat/messages/${messageId}/save`).then((r) => r.data);

export const forwardMessage = (messageId, targetRoomIds) =>
  api.post(`/chat/messages/${messageId}/forward`, { targetRoomIds }).then((r) => r.data);

export const searchMessages = (params) =>
  api.get('/chat/search', { params }).then((r) => r.data);

export const addMember = (roomId, userIds) =>
  api.post(`/chat/rooms/${roomId}/members`, { userIds }).then((r) => r.data);
export const leaveRoom = (roomId) =>
  api.delete(`/chat/rooms/${roomId}/leave`).then((r) => r.data);

export const uploadFile = (roomId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/chat/rooms/${roomId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const getLinkPreview = (url) => api.get('/chat/link-preview', { params: { url } }).then((r) => r.data);
export const setAnnouncement = (roomId, announcement) => api.put(`/chat/rooms/${roomId}/announcement`, { announcement }).then((r) => r.data);
export const createScheduledMessage = (roomId, data) => api.post(`/chat/rooms/${roomId}/scheduled`, data).then((r) => r.data);
export const listScheduledMessages = (roomId) => api.get(`/chat/rooms/${roomId}/scheduled`).then((r) => r.data);
export const cancelScheduledMessage = (roomId, msgId) => api.delete(`/chat/rooms/${roomId}/scheduled/${msgId}`).then((r) => r.data);
