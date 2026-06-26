import { create } from 'zustand';
import { THEMES, DEFAULT_THEME, CSS_VAR_MAP, flattenColors } from '../utils/themes';

const STORAGE_THEME = 'flowdesk_theme_key';
const STORAGE_DARK  = 'flowdesk_dark';

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
function applyTheme(base, isDark) {
  applyCssVars(base.tokens);
  const root = document.documentElement;
  if (isDark) {
    // 거의-검정 대신 부드러운 슬레이트(콘텐츠 레벨). 카드(#272c38)가 그 위에서 떠 보이도록.
    root.style.setProperty('--fd-content-bg-light', '#1e222c');
  }
  root.dataset.dark = isDark ? 'true' : 'false';
}

function buildTheme(base) {
  return { ...base, colors: flattenColors(base.tokens) };
}

/* 초기 로드 시 즉시 CSS 변수 + 모드 적용 */
const _initKey  = localStorage.getItem(STORAGE_THEME) || DEFAULT_THEME;
const _initBase = THEMES[_initKey] || THEMES[DEFAULT_THEME];
const _initDark = localStorage.getItem(STORAGE_DARK) === '1';
applyTheme(_initBase, _initDark);

const useThemeStore = create((set, get) => ({
  themeKey: _initKey,
  theme:    buildTheme(_initBase),
  isDark:   _initDark,

  setTheme: (key) => {
    const base = THEMES[key] || THEMES[DEFAULT_THEME];
    applyTheme(base, get().isDark);
    localStorage.setItem(STORAGE_THEME, key);
    set({ themeKey: key, theme: buildTheme(base) });
  },

  setDark: (isDark) => {
    const base = THEMES[get().themeKey] || THEMES[DEFAULT_THEME];
    applyTheme(base, isDark);
    localStorage.setItem(STORAGE_DARK, isDark ? '1' : '0');
    set({ isDark });
  },

  toggleDark: () => get().setDark(!get().isDark),
}));

export default useThemeStore;
