import { create } from 'zustand';
import { NAV_BY_KEY, DEFAULT_PINNED } from '../utils/navRegistry';
import { DEFAULT_HOME_LAYOUT, isHomeLayout } from '../utils/homeLayouts';
import { updatePreferences } from '../api/settings';

const STORAGE_NAV = 'flowdesk_nav_pinned';
const STORAGE_HOME = 'flowdesk_home_layout';
const STORAGE_OWNER = 'flowdesk_nav_owner';   // 로컬 캐시를 만든 사용자 id — 계정이 바뀌면 캐시를 버린다

/* 존재하지 않는 키(삭제된 화면 등)와 중복을 걸러낸다.
   사용자가 의도적으로 비운 목록([])은 그대로 두되, 저장된 키가 전부 무효해서 비게 된 경우는 null(=기본값 사용). */
function sanitize(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = list.filter((k) => NAV_BY_KEY[k] && !seen.has(k) && seen.add(k));
  return out.length === 0 && list.length > 0 ? null : out;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function loadLocal() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_NAV))) || DEFAULT_PINNED;
  } catch {
    return DEFAULT_PINNED;
  }
}

function loadLocalHome() {
  try {
    const v = localStorage.getItem(STORAGE_HOME);
    return isHomeLayout(v) ? v : DEFAULT_HOME_LAYOUT;
  } catch {
    return DEFAULT_HOME_LAYOUT;
  }
}

function writeLocal(key, value, owner) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    if (owner != null) localStorage.setItem(STORAGE_OWNER, String(owner));
  } catch { /* 저장 불가 환경 무시 */ }
}

let _timer = null;
let _dirty = false;                 // 이번 세션에서 사용자가 직접 편집했는가 — 늦게 도착한 서버 응답이 편집을 덮지 않게 함
const _pending = new Set();          // 아직 서버로 보내지 않은 키 ('nav' | 'home') — 바뀐 것만 보낸다
let _owner = null;

/* 사용자별 개인 화면 설정 (서버 병합 저장 + localStorage 캐시) */
const usePreferenceStore = create((set, get) => {
  const pushNow = () => {
    clearTimeout(_timer);
    _timer = null;
    const patch = {};
    if (_pending.has('nav')) patch.nav = { pinned: get().navPinned };
    if (_pending.has('home')) patch.home = { layout: get().homeLayout };
    _pending.clear();
    if (!Object.keys(patch).length) return Promise.resolve();
    return updatePreferences(patch).catch(() => {});
  };
  const schedule = (key) => {
    _dirty = true;
    _pending.add(key);
    clearTimeout(_timer);
    _timer = setTimeout(pushNow, 400);
  };

  return {
    navPinned: loadLocal(),
    homeLayout: loadLocalHome(),

    setNavPinned: (list) => {
      const next = sanitize(list) || DEFAULT_PINNED;
      writeLocal(STORAGE_NAV, next, _owner);
      set({ navPinned: next });
      schedule('nav');
    },

    resetNav: () => get().setNavPinned(DEFAULT_PINNED),

    /* 메인 화면 레이아웃 선택 ('classic' | 'command' | 'focus' | 'board' | 'brief') */
    setHomeLayout: (layout) => {
      const next = isHomeLayout(layout) ? layout : DEFAULT_HOME_LAYOUT;
      writeLocal(STORAGE_HOME, next, _owner);
      set({ homeLayout: next });
      schedule('home');
    },

    /* 대기 중인 저장을 즉시 전송 (로그아웃 직전 호출 — 토큰이 살아 있을 때) */
    flush: async () => {
      if (_timer) await pushNow();
    },

    /* 로그아웃: 이전 사용자의 설정이 다음 사용자에게 보이지 않도록 메모리·캐시를 모두 초기화 */
    reset: () => {
      clearTimeout(_timer);
      _timer = null;
      _dirty = false;
      _owner = null;
      _pending.clear();
      try {
        localStorage.removeItem(STORAGE_NAV);
        localStorage.removeItem(STORAGE_HOME);
        localStorage.removeItem(STORAGE_OWNER);
      } catch { /* 무시 */ }
      set({ navPinned: DEFAULT_PINNED, homeLayout: DEFAULT_HOME_LAYOUT });
    },

    /* 로그인 후 서버 저장값으로 동기화.
       - 사용자가 이미 편집했다면(_dirty) 서버 응답을 무시
       - 로컬 캐시가 다른 사용자의 것이면 버림
       - 서버에 설정이 없고 로컬이 기본값과 다르면 1회 서버로 올림 */
    hydrateFromServer: (prefs, userId) => {
      if (userId != null) {
        let cachedOwner = null;
        try { cachedOwner = localStorage.getItem(STORAGE_OWNER); } catch { /* 무시 */ }
        if (cachedOwner !== String(userId) && !_dirty) {
          try { localStorage.removeItem(STORAGE_NAV); localStorage.removeItem(STORAGE_HOME); } catch { /* 무시 */ }
          set({ navPinned: DEFAULT_PINNED, homeLayout: DEFAULT_HOME_LAYOUT });
        }
        _owner = userId;
      }
      if (_dirty) return;

      const pinned = sanitize(prefs?.nav?.pinned);
      if (pinned) {
        writeLocal(STORAGE_NAV, pinned, _owner);
        set({ navPinned: pinned });
      } else if (!prefs?.nav) {
        const cur = get().navPinned;
        writeLocal(STORAGE_NAV, cur, _owner);
        if (!sameList(cur, DEFAULT_PINNED)) { _pending.add('nav'); pushNow(); }
      }

      const home = prefs?.home?.layout;
      if (isHomeLayout(home)) {
        writeLocal(STORAGE_HOME, home, _owner);
        set({ homeLayout: home });
      } else if (!prefs?.home) {
        const cur = get().homeLayout;
        writeLocal(STORAGE_HOME, cur, _owner);
        if (cur !== DEFAULT_HOME_LAYOUT) { _pending.add('home'); pushNow(); }
      }
    },
  };
});

export default usePreferenceStore;
