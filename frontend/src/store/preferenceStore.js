import { create } from 'zustand';
import { NAV_BY_KEY, DEFAULT_PINNED } from '../utils/navRegistry';
import { updatePreferences } from '../api/settings';

const STORAGE_NAV = 'flowdesk_nav_pinned';

/* 존재하지 않는 키(삭제된 화면 등)와 중복을 걸러낸다 */
function sanitize(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = list.filter((k) => NAV_BY_KEY[k] && !seen.has(k) && seen.add(k));
  return out;
}

function loadLocal() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_NAV))) || DEFAULT_PINNED;
  } catch {
    return DEFAULT_PINNED;
  }
}

let _timer = null;

/* 사용자별 개인 화면 설정 (서버 병합 저장 + localStorage 캐시) */
const usePreferenceStore = create((set, get) => ({
  navPinned: loadLocal(),

  setNavPinned: (list) => {
    const next = sanitize(list) || DEFAULT_PINNED;
    try { localStorage.setItem(STORAGE_NAV, JSON.stringify(next)); } catch { /* 저장 불가 환경 무시 */ }
    set({ navPinned: next });
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      updatePreferences({ nav: { pinned: get().navPinned } }).catch(() => {});
    }, 400);
  },

  resetNav: () => get().setNavPinned(DEFAULT_PINNED),

  /* 로그인 후 서버 저장값으로 동기화 (없으면 로컬 유지) */
  hydrateFromServer: (prefs) => {
    const pinned = sanitize(prefs?.nav?.pinned);
    if (!pinned) return;
    try { localStorage.setItem(STORAGE_NAV, JSON.stringify(pinned)); } catch { /* 무시 */ }
    set({ navPinned: pinned });
  },
}));

export default usePreferenceStore;
