import { create } from 'zustand';
import { THEMES, DEFAULT_THEME, CSS_VAR_MAP, flattenColors } from '../utils/themes';

const STORAGE_THEME = 'flowdesk_theme_key';
const STORAGE_DARK  = 'flowdesk_dark_mode';

function applyCssVars(tokens) {
  const root = document.documentElement;
  for (const [group, vars] of Object.entries(CSS_VAR_MAP)) {
    for (const [key, varName] of Object.entries(vars)) {
      root.style.setProperty(varName, tokens[group][key]);
    }
  }
}

function applyDarkAttr(isDark) {
  document.documentElement.dataset.dark = isDark ? 'true' : 'false';
}

function buildTheme(base) {
  return { ...base, colors: flattenColors(base.tokens) };
}

/* 초기 로드 시 즉시 CSS 변수 + 다크 속성 적용 */
const _initKey  = localStorage.getItem(STORAGE_THEME) || DEFAULT_THEME;
const _initBase = THEMES[_initKey] || THEMES[DEFAULT_THEME];
const _initDark = localStorage.getItem(STORAGE_DARK) === 'true';
applyCssVars(_initBase.tokens);
applyDarkAttr(_initDark);

const useThemeStore = create((set) => ({
  themeKey: _initKey,
  theme:    buildTheme(_initBase),
  isDark:   _initDark,

  setTheme: (key) => {
    const base = THEMES[key] || THEMES[DEFAULT_THEME];
    applyCssVars(base.tokens);
    localStorage.setItem(STORAGE_THEME, key);
    set({ themeKey: key, theme: buildTheme(base) });
  },

  toggleDark: () => {
    set((s) => {
      const next = !s.isDark;
      applyDarkAttr(next);
      localStorage.setItem(STORAGE_DARK, next ? 'true' : 'false');
      return { isDark: next };
    });
  },
}));

export default useThemeStore;
