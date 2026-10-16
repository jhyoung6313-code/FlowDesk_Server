import { create } from 'zustand';
import { NAV_BY_KEY, DEFAULT_PINNED } from '../utils/navRegistry';
import { DEFAULT_HOME_LAYOUT, DEFAULT_HOME_SCOPE, isHomeLayout, isHomeScope } from '../utils/homeLayouts';
import { updatePreferences } from '../api/settings';

const STORAGE_NAV = 'flowdesk_nav_pinned';
const STORAGE_HOME = 'flowdesk_home_layout';
const STORAGE_SCOPE = 'flowdesk_home_scope';
const STORAGE_OWNER = 'flowdesk_nav_owner';   // 로컬 캐시를 만든 사용자 id — 계정이 바뀌면 캐시를 버린다
const RETRY_DELAYS = [3000, 10000, 30000];     // 저장 실패 시 재시도 간격

/* 존재하지 않는 키(삭제된 화면 등)와 중복을 걸러낸다.
   사용자가 의도적으로 비운 목록([])은 그대로 두되, 저장된 키가 전부 무효해서 비게 된 경우는 null(=기본값 사용). */
function sanitize(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = list.filter((k) => NAV_BY_KEY[k] && !seen.has(k) && seen.add(k));
  return out.length === 0 && list.length > 0 ? null : out;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const readLocal = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
function loadLocal() {
  try {
    return sanitize(JSON.parse(readLocal(STORAGE_NAV))) || DEFAULT_PINNED;
  } catch {
    return DEFAULT_PINNED;
  }
}
const loadLocalHome = () => (isHomeLayout(readLocal(STORAGE_HOME)) ? readLocal(STORAGE_HOME) : DEFAULT_HOME_LAYOUT);
const loadLocalScope = () => (isHomeScope(readLocal(STORAGE_SCOPE)) ? readLocal(STORAGE_SCOPE) : DEFAULT_HOME_SCOPE);

function writeLocal(key, value, owner) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    if (owner != null) localStorage.setItem(STORAGE_OWNER, String(owner));
  } catch { /* 저장 불가 환경 무시 */ }
}
const removeLocal = (...keys) => { try { keys.forEach((k) => localStorage.removeItem(k)); } catch { /* 무시 */ } };

let _timer = null;
let _retryTimer = null;
let _retryCount = 0;
let _inflight = null;               // 전송 중인 저장 요청 — 로그아웃 직전 flush 가 기다린다
const _pending = new Set();          // 아직 서버로 보내지 않은 키 ('nav' | 'home') — 바뀐 것만 보낸다
let _owner = null;

/* 사용자별 개인 화면 설정 (서버 병합 저장 + localStorage 캐시) */
const usePreferenceStore = create((set, get) => {
  const buildPatch = (keys) => {
    const patch = {};
    if (keys.has('nav')) patch.nav = { pinned: get().navPinned };
    if (keys.has('home')) patch.home = { layout: get().homeLayout, scope: get().homeScope };
    return patch;
  };

  const pushNow = () => {
    clearTimeout(_timer);
    _timer = null;
    clearTimeout(_retryTimer);
    const keys = new Set(_pending);
    _pending.clear();
    if (keys.size === 0) return _inflight || Promise.resolve();
    const req = updatePreferences(buildPatch(keys))
      .then(() => { _retryCount = 0; })
      .catch(() => {
        // 네트워크·서버 오류: 보낼 키를 되돌려 놓고 간격을 늘리며 재시도한다 (값은 로컬 캐시에 남아 있음)
        keys.forEach((k) => _pending.add(k));
        if (_retryCount < RETRY_DELAYS.length) {
          _retryTimer = setTimeout(pushNow, RETRY_DELAYS[_retryCount]);
          _retryCount += 1;
        }
      })
      .finally(() => { if (_inflight === req) _inflight = null; });
    _inflight = req;
    return req;
  };
  const schedule = (key) => {
    _pending.add(key);
    _retryCount = 0;
    clearTimeout(_timer);
    _timer = setTimeout(pushNow, 400);
  };

  return {
    navPinned: loadLocal(),
    homeLayout: loadLocalHome(),
    homeScope: loadLocalScope(),

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

    /* 새 레이아웃이 보여 줄 업무 범위 ('all' | 'mine') */
    setHomeScope: (scope) => {
      const next = isHomeScope(scope) ? scope : DEFAULT_HOME_SCOPE;
      writeLocal(STORAGE_SCOPE, next, _owner);
      set({ homeScope: next });
      schedule('home');
    },

    /* 대기 중이거나 전송 중인 저장을 모두 끝낸다 (로그아웃 직전 호출 — 토큰이 살아 있을 때) */
    flush: async () => {
      if (_timer || _pending.size) await pushNow();
      if (_inflight) await _inflight;
    },

    /* 로그아웃: 이전 사용자의 설정이 다음 사용자에게 보이지 않도록 메모리·캐시를 모두 초기화 */
    reset: () => {
      clearTimeout(_timer);
      clearTimeout(_retryTimer);
      _timer = null;
      _retryTimer = null;
      _retryCount = 0;
      _owner = null;
      _pending.clear();
      removeLocal(STORAGE_NAV, STORAGE_HOME, STORAGE_SCOPE, STORAGE_OWNER);
      set({ navPinned: DEFAULT_PINNED, homeLayout: DEFAULT_HOME_LAYOUT, homeScope: DEFAULT_HOME_SCOPE });
    },

    /* 로그인 후 서버 저장값으로 동기화.
       - 사용자가 이미 편집한(아직 서버에 못 보낸) 키(_pending)는 서버 응답으로 덮지 않는다
       - 로컬 캐시가 다른 사용자의 것이면 (편집하지 않은 키는) 버림
       - 서버에 설정이 없거나 값이 잘못됐으면 로컬 값으로 1회 복구(서버로 올림) */
    hydrateFromServer: (prefs, userId) => {
      if (userId != null) {
        if (readLocal(STORAGE_OWNER) !== String(userId)) {
          if (!_pending.has('nav')) { removeLocal(STORAGE_NAV); set({ navPinned: DEFAULT_PINNED }); }
          if (!_pending.has('home')) { removeLocal(STORAGE_HOME, STORAGE_SCOPE); set({ homeLayout: DEFAULT_HOME_LAYOUT, homeScope: DEFAULT_HOME_SCOPE }); }
        }
        _owner = userId;
        writeLocal(STORAGE_OWNER, String(userId), null);
      }

      if (!_pending.has('nav')) {
        const pinned = sanitize(prefs?.nav?.pinned);
        if (pinned) {
          writeLocal(STORAGE_NAV, pinned, _owner);
          set({ navPinned: pinned });
        } else {
          const cur = get().navPinned;
          writeLocal(STORAGE_NAV, cur, _owner);
          // 서버에 없거나 잘못된 값이면 로컬(또는 기본) 값으로 복구
          if (!sameList(cur, DEFAULT_PINNED) || (prefs?.nav && !sanitize(prefs.nav.pinned))) { _pending.add('nav'); pushNow(); }
        }
      }

      if (!_pending.has('home')) {
        const h = prefs?.home;
        const layoutOk = isHomeLayout(h?.layout);
        const scopeOk = isHomeScope(h?.scope);
        const layout = layoutOk ? h.layout : get().homeLayout;
        const scope = scopeOk ? h.scope : get().homeScope;
        writeLocal(STORAGE_HOME, layout, _owner);
        writeLocal(STORAGE_SCOPE, scope, _owner);
        set({ homeLayout: layout, homeScope: scope });
        // 서버 값이 없거나 일부/전부 잘못됐고, 로컬이 기본값과 다르거나 서버에 잘못된 값이 있으면 올려서 복구
        const needsRepair = h
          ? (!layoutOk || !scopeOk)
          : (layout !== DEFAULT_HOME_LAYOUT || scope !== DEFAULT_HOME_SCOPE);
        if (needsRepair) { _pending.add('home'); pushNow(); }
      }
    },
  };
});

export default usePreferenceStore;
