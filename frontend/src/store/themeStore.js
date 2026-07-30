import { create } from 'zustand';
import { THEMES, DEFAULT_THEME, CSS_VAR_MAP, flattenColors, applyCustomAccent } from '../utils/themes';
import { SKINS, DEFAULT_SKIN, applySkin } from '../utils/skins';
import { updateThemePrefs } from '../api/settings';

const STORAGE_DARK = 'flowdesk_dark';
const STORAGE_DENS = 'flowdesk_density';   // 'default' | 'compact'
const STORAGE_SKIN = 'flowdesk_skin';      // 'default' | 'brutal' | 'clay' | 'mono' | 'glass' | 'pop' | 'slick' | 'paper'

/* 색상 테마 선택 기능은 제거됨 — 강조색·표면은 이제 스킨(skins.js)이 담당한다.
   themes.js 의 베이스 팔레트(slate)는 스킨이 다루지 않는 잔여 CSS 변수
   (로그인 페이지 그라디언트 등)의 중립 기본값으로만 사용한다. */
const BASE = THEMES[DEFAULT_THEME];

function applyCssVars(tokens) {
  const root = document.documentElement;
  for (const [group, vars] of Object.entries(CSS_VAR_MAP)) {
    for (const [key, varName] of Object.entries(vars)) {
      root.style.setProperty(varName, tokens[group][key]);
    }
  }
}

/* 스킨의 강조색 (라이트/다크) */
function skinAccent(skin, isDark) {
  const s = SKINS[skin] || SKINS[DEFAULT_SKIN];
  return (s.accent && s.accent[isDark ? 'dark' : 'light']) || BASE.tokens.accent.mid;
}

/* 베이스 팔레트 + 스킨 강조색 + 스킨 형태 + 라이트/다크 를 함께 적용 */
function applyTheme(isDark, skin) {
  const accent = skinAccent(skin, isDark);
  const eff = applyCustomAccent(BASE, accent);   // 강조색만 스킨 값으로 덮어씀
  applyCssVars(eff.tokens);
  const root = document.documentElement;
  root.dataset.dark = isDark ? 'true' : 'false';
  applySkin(skin, isDark);                        // --fd-sk-* (형태·표면·레일·KPI) 주입
  const set = (SKINS[skin] || SKINS[DEFAULT_SKIN])[isDark ? 'dark' : 'light'];
  root.style.setProperty('--fd-content-bg-light', set['page-bg']);
}

/* 컴포넌트가 참조하는 flat colors (강조색 = 스킨 강조색) */
function buildTheme(skin, isDark) {
  const eff = applyCustomAccent(BASE, skinAccent(skin, isDark));
  return { ...eff, colors: flattenColors(eff.tokens) };
}

/* 초기 로드 시 즉시 적용 */
const _initDark = localStorage.getItem(STORAGE_DARK) === '1';
const _initDens = localStorage.getItem(STORAGE_DENS) === 'compact' ? 'compact' : 'default';
const _initSkin = SKINS[localStorage.getItem(STORAGE_SKIN)] ? localStorage.getItem(STORAGE_SKIN) : DEFAULT_SKIN;
applyTheme(_initDark, _initSkin);

/* 서버 저장 (디바운스, 로그인 상태가 아니면 401 → 조용히 무시) */
let _saveTimer = null;
function persist(get) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const s = get();
    updateThemePrefs({ isDark: s.isDark, density: s.density, skin: s.skin }).catch(() => {});
  }, 400);
}

const useThemeStore = create((set, get) => ({
  theme:    buildTheme(_initSkin, _initDark),
  isDark:   _initDark,
  density:  _initDens,
  skin:     _initSkin,

  setDark: (isDark) => {
    applyTheme(isDark, get().skin);
    localStorage.setItem(STORAGE_DARK, isDark ? '1' : '0');
    set({ isDark, theme: buildTheme(get().skin, isDark) });
    persist(get);
  },

  toggleDark: () => get().setDark(!get().isDark),

  /* 스킨(형태+강조색) 지정 — 커스터마이즈의 단일 축.
     스킨에 선호 모드(mode: 'light'|'dark')가 있으면 라이트/다크를 자동 전환한다. */
  setSkin: (skin) => {
    const key = SKINS[skin] ? skin : DEFAULT_SKIN;
    const pref = SKINS[key].mode;
    const isDark = pref === 'dark' ? true : pref === 'light' ? false : get().isDark;
    applyTheme(isDark, key);
    localStorage.setItem(STORAGE_SKIN, key);
    localStorage.setItem(STORAGE_DARK, isDark ? '1' : '0');
    set({ skin: key, isDark, theme: buildTheme(key, isDark) });
    persist(get);
  },

  setDensity: (density) => {
    const d = density === 'compact' ? 'compact' : 'default';
    localStorage.setItem(STORAGE_DENS, d);
    set({ density: d });
    persist(get);
  },

  /* 로그인 후 서버 저장값으로 동기화 (없으면 로컬 유지) */
  hydrateFromServer: (prefs) => {
    if (!prefs || typeof prefs !== 'object') return;
    const isDark = typeof prefs.isDark === 'boolean' ? prefs.isDark : get().isDark;
    const density = prefs.density === 'compact' ? 'compact' : 'default';
    const skin = SKINS[prefs.skin] ? prefs.skin : get().skin;
    applyTheme(isDark, skin);
    localStorage.setItem(STORAGE_DARK, isDark ? '1' : '0');
    localStorage.setItem(STORAGE_DENS, density);
    localStorage.setItem(STORAGE_SKIN, skin);
    set({ isDark, density, skin, theme: buildTheme(skin, isDark) });
  },
}));

export default useThemeStore;
