import api from './axios';

// 개인 "내 하루" 통합 홈 (F-64)
export const getMyToday = () => api.get('/me/today').then((r) => r.data);
