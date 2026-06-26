import axios from 'axios';

// 탭(브라우저 창)마다 고유한 ID. 업무 변경 소켓 echo에서 "변경을 일으킨 바로 그 탭"만
// 식별해 중복 조회를 막되, 같은 계정의 다른 탭은 정상적으로 실시간 동기화되도록 한다.
export const CLIENT_ID =
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Client-Id'] = CLIENT_ID;
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
