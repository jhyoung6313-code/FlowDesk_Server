import { create } from 'zustand';
import { getMe, login as apiLogin, logout as apiLogout } from '../api/auth';
import useNotificationStore from './notificationStore';
import usePreferenceStore from './preferenceStore';
import useThemeStore from './themeStore';
import { setUiUserId, tokenUserId } from '../utils/sessionIdentity';

const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false });
      return;
    }
    // 토큰이 실제로 거부된 경우(401)에만 로그아웃 처리한다. 속도 제한(429)·서버 재시작·네트워크 단절 같은
    // 일시 오류로는 토큰을 지우지 않고 잠시 후 재시도한다 (예전에는 어떤 오류든 로그인 화면으로 쫓겨났음).
    const RETRY_DELAYS = [1000, 2500, 5000];
    for (let attempt = 0; ; attempt++) {
      try {
        const user = await getMe();
        set({ user, loading: false });
        return;
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403 || attempt >= RETRY_DELAYS.length) {
          if (status === 401 || status === 403) localStorage.removeItem('token');
          set({ user: null, loading: false });
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  },

  login: async (username, password) => {
    const data = await apiLogin(username, password);
    localStorage.setItem('token', data.token);
    set({ user: data.user });
    return data;
  },

  logout: async () => {
    // 대기 중인 개인 설정 저장을 토큰이 살아 있을 때 먼저 보낸다
    try { await usePreferenceStore.getState().flush(); } catch {}
    try { await useThemeStore.getState().flush(); } catch {}
    try {
      await apiLogout();
    } catch {}
    // 다른 탭이 다른 계정으로 로그인한 상태라면 그 탭의 토큰은 지우지 않는다
    const cur = useAuthStore.getState().user;
    const tid = tokenUserId(localStorage.getItem('token') || '');
    if (!cur || tid == null || tid === cur.id) localStorage.removeItem('token');
    useNotificationStore.getState().resetSeenIds();
    usePreferenceStore.getState().reset();   // 다음 사용자에게 이전 사용자의 메뉴 설정이 보이지 않게
    useThemeStore.getState().resetToDefaults();   // 테마·스킨·밀도도 계정별 — 로컬 캐시 초기화
    set({ user: null });
    // 메모·업무·채팅·미읽음 등 모든 스토어와 소켓을 확실히 비우기 위해 페이지를 새로 불러온다
    // (SPA 내 이동만 하면 이전 계정의 메모/채팅 캐시가 다음 계정 화면에 남는다)
    try {
      ['dashboard_bbs_cat'].forEach((k) => localStorage.removeItem(k));
      Object.keys(localStorage).filter((k) => k.startsWith('wbs_snapshots_')).forEach((k) => localStorage.removeItem(k));
    } catch { /* 무시 */ }
    window.location.replace('/login');
  },

  setUser: (user) => set({ user }),

  // 외부에서 토큰+유저 직접 저장 (다단계 로그인/회원가입용)
  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    set({ user });
  },
}));

// 화면이 보여 주는 계정을 토큰 불일치 감지기에 알린다 (utils/sessionIdentity.js)
useAuthStore.subscribe((s) => setUiUserId(s.user?.id));

export default useAuthStore;
