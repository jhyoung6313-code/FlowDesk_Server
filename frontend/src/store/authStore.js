import { create } from 'zustand';
import { getMe, login as apiLogin, logout as apiLogout } from '../api/auth';
import useNotificationStore from './notificationStore';

const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const user = await getMe();
      set({ user, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    const data = await apiLogin(username, password);
    localStorage.setItem('token', data.token);
    set({ user: data.user });
    return data;
  },

  logout: async () => {
    try {
      await apiLogout();
    } catch {}
    localStorage.removeItem('token');
    useNotificationStore.getState().resetSeenIds();
    set({ user: null });
  },

  setUser: (user) => set({ user }),

  // 외부에서 토큰+유저 직접 저장 (다단계 로그인/회원가입용)
  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    set({ user });
  },
}));

export default useAuthStore;
