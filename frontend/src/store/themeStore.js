import { create } from 'zustand';
import { THEMES, DEFAULT_THEME, CSS_VAR_MAP, flattenColors, applyCustomAccent } from '../utils/themes';
import { updateThemePrefs } from '../api/settings';

const STORAGE_THEME  = 'flowdesk_theme_key';
const STORAGE_DARK   = 'flowdesk_dark';
const STORAGE_ACCENT = 'flowdesk_accent';   // 커스텀 강조색 (없으면 프리셋)
const STORAGE_DENS   = 'flowdesk_density';   // 'default' | 'compact'

function applyCssVars(tokens) {
  const root = document.documentElement;
  for (const [group, vars] of Object.entries(CSS_VAR_MAP)) {
    for (const [key, varName] of Object.entries(vars)) {
      root.style.setProperty(varName, tokens[group][key]);
    }
  }
}

/* 테마 토큰 + 라이트/다크 모드를 함께 적용.
   다크일 때는 컴포넌트가 참조하는 "라이트 표면" 변수를 테마의 다크값으로 덮어쓴다.
   (AntD 컴포넌트 색은 ConfigProvider의 darkAlgorithm이 담당) */
function applyTheme(base, isDark, accent) {
  const eff = applyCustomAccent(base, accent);
  applyCssVars(eff.tokens);
  const root = document.documentElement;
  if (isDark) {
    // 거의-검정 대신 부드러운 슬레이트(콘텐츠 레벨). 카드(#272c38)가 그 위에서 떠 보이도록.
    root.style.setProperty('--fd-content-bg-light', '#1e222c');
  }
  root.dataset.dark = isDark ? 'true' : 'false';
}

function buildTheme(base, accent) {
  const eff = applyCustomAccent(base, accent);
  return { ...eff, colors: flattenColors(eff.tokens) };
}

/* 초기 로드 시 즉시 CSS 변수 + 모드 적용 (localStorage = 빠른 로컬 캐시) */
const _initKey    = localStorage.getItem(STORAGE_THEME) || DEFAULT_THEME;
const _initBase   = THEMES[_initKey] || THEMES[DEFAULT_THEME];
const _initDark   = localStorage.getItem(STORAGE_DARK) === '1';
const _initAccent = localStorage.getItem(STORAGE_ACCENT) || null;
const _initDens   = localStorage.getItem(STORAGE_DENS) === 'compact' ? 'compact' : 'default';
applyTheme(_initBase, _initDark, _initAccent);

/* 서버 저장 (디바운스, 로그인 상태가 아니면 401 → 조용히 무시) */
let _saveTimer = null;
function persist(get) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const s = get();
    updateThemePrefs({
      themeKey: s.themeKey,
      isDark: s.isDark,
      customAccent: s.customAccent,
      density: s.density,
    }).catch(() => {});
  }, 400);
}

const useThemeStore = create((set, get) => ({
  themeKey:     _initKey,
  theme:        buildTheme(_initBase, _initAccent),
  isDark:       _initDark,
  customAccent: _initAccent,
  density:      _initDens,

  setTheme: (key) => {
    const base = THEMES[key] || THEMES[DEFAULT_THEME];
    const { isDark, customAccent } = get();
    applyTheme(base, isDark, customAccent);
    localStorage.setItem(STORAGE_THEME, key);
    set({ themeKey: key, theme: buildTheme(base, customAccent) });
    persist(get);
  },

  setDark: (isDark) => {
    const base = THEMES[get().themeKey] || THEMES[DEFAULT_THEME];
    applyTheme(base, isDark, get().customAccent);
    localStorage.setItem(STORAGE_DARK, isDark ? '1' : '0');
    set({ isDark });
    persist(get);
  },

  toggleDark: () => get().setDark(!get().isDark),

  /* 커스텀 강조색 지정 (null = 프리셋 accent 로 복귀) */
  setCustomAccent: (accent) => {
    const base = THEMES[get().themeKey] || THEMES[DEFAULT_THEME];
    applyTheme(base, get().isDark, accent);
    if (accent) localStorage.setItem(STORAGE_ACCENT, accent);
    else localStorage.removeItem(STORAGE_ACCENT);
    set({ customAccent: accent || null, theme: buildTheme(base, accent) });
    persist(get);
  },

  setDensity: (density) => {
    const d = density === 'compact' ? 'compact' : 'default';
    localStorage.setItem(STORAGE_DENS, d);
    set({ density: d });
    persist(get);
  },

  /* 로그인 후 서버 저장값으로 동기화 (없으면 로컬 유지). 서버 재저장은 하지 않음. */
  hydrateFromServer: (prefs) => {
    if (!prefs || typeof prefs !== 'object') return;
    const key    = THEMES[prefs.themeKey] ? prefs.themeKey : get().themeKey;
    const isDark = typeof prefs.isDark === 'boolean' ? prefs.isDark : get().isDark;
    const accent = prefs.customAccent || null;
    const density = prefs.density === 'compact' ? 'compact' : 'default';
    const base = THEMES[key] || THEMES[DEFAULT_THEME];
    applyTheme(base, isDark, accent);
    localStorage.setItem(STORAGE_THEME, key);
    localStorage.setItem(STORAGE_DARK, isDark ? '1' : '0');
    if (accent) localStorage.setItem(STORAGE_ACCENT, accent); else localStorage.removeItem(STORAGE_ACCENT);
    localStorage.setItem(STORAGE_DENS, density);
    set({ themeKey: key, isDark, customAccent: accent, density, theme: buildTheme(base, accent) });
  },
}));

export default useThemeStore;
