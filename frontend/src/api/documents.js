import api from './axios';

// 통합 문서/첨부 허브 (F-68)
export const getDocuments = (params) => api.get('/documents', { params }).then((r) => r.data);
