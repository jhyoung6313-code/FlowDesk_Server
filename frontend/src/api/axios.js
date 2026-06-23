import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      if (error.response?.data?.code === 'SESSION_REPLACED') {
        sessionStorage.setItem('loginNotice', '다른 기기에서 로그인되어 현재 세션이 종료되었습니다.');
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
