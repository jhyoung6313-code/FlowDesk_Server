/* ═══════════════════════════════════════════════════════════════
   FlowDesk 스킨(형태 테마) 정의
   ─────────────────────────────────────────────────────────────
   색상 테마(themes.js)와 직교(orthogonal)한 "형태" 축.
   색상 테마 = 강조색·사이드바 틴트,  스킨 = 모서리·테두리·그림자·표면·폰트.
   두 축은 서로 독립적으로 조합된다.

   스킨은 --fd-sk-* CSS 변수 묶음을 :root 에 주입한다.
   index.css / 인라인 스타일은 이 변수를 참조해 스킨에 반응한다.
   각 스킨은 light / dark 두 벌을 갖는다.
   ═══════════════════════════════════════════════════════════════ */

/* 주입되는 CSS 변수 목록 (키 = 변수 접미사) */
export const SKIN_VARS = [
  'radius-lg',      // 카드·패널·모달
  'radius',         // 버튼·입력·태그·칩
  'radius-sm',      // 작은 요소·배지
  'border-w',       // 테두리 두께
  'border-color',   // 테두리 색 (스킨이 --fd-border 대신 이걸 쓰도록 유도)
  'shadow',         // 카드 기본 그림자
  'shadow-hover',   // 카드 hover 그림자
  'shadow-sm',      // 작은 요소(칩/버튼) 그림자
  'card-bg',        // 떠 있는 표면
  'surface-sunken', // 살짝 가라앉은 배경
  'page-bg',        // 콘텐츠 페이지 배경
  'font-num',       // 숫자/통계용 폰트(모노 스킨에서 교체)
  'font-weight-hd', // 제목 굵기
  // ── 시그니처 (스킨 고유 색·표면) ──
  'rail-bg',        // 1차 아이콘 레일 배경
  'rail-border',    // 레일 우측 경계
  'rail-idle',      // 레일 비활성 아이콘색
  'rail-hover-bg',  // 레일 hover 배경
  'kpi-a',          // KPI 강조(그린) 블록 배경
  'kpi-b',          // KPI 위험(레드) 블록 배경
  'kpi-c',          // KPI 정보(블루) 블록 배경
  'kpi-txt',        // KPI 컬러 블록 위 글자색
  'kpi-mode',       // 'flat' | 'grad' | 'tint' | 'line' — 대시보드가 분기
];

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif";
const MONO = "'Space Mono', 'JetBrains Mono', 'Consolas', monospace";

export const SKINS = {
  /* ── 기본 (현재 Notion Warm 디자인) ─────────────────────────── */
  default: {
    key: 'default',
    name: '기본',
    desc: '노션 웜 · 부드러운 카드',
    mode: 'light',
    accent: { light: '#2563eb', dark: '#3b82f6' },
    light: {
      'radius-lg': '12px', 'radius': '9px', 'radius-sm': '6px',
      'border-w': '1px', 'border-color': '#e9e7e2',
      'shadow': '0 1px 2px rgba(55,53,47,.05), 0 1px 3px rgba(55,53,47,.04)',
      'shadow-hover': '0 4px 14px rgba(55,53,47,.08)',
      'shadow-sm': 'none',
      'card-bg': '#ffffff', 'surface-sunken': '#faf9f6', 'page-bg': '#f4f4f2',
      'font-num': SANS, 'font-weight-hd': '700',
      'rail-bg': '#f4f3ef', 'rail-border': '#e9e7e2', 'rail-idle': '#8a827a', 'rail-hover-bg': '#e7e5df',
      'kpi-a': 'linear-gradient(140deg,#e7f5ec,#f2fbf5)', 'kpi-b': 'linear-gradient(140deg,#fdf3f1,#fdf8f6)',
      'kpi-c': '#ffffff', 'kpi-txt': '#37352f', 'kpi-mode': 'tint',
    },
    dark: {
      'radius-lg': '12px', 'radius': '9px', 'radius-sm': '6px',
      'border-w': '1px', 'border-color': '#3a4150',
      'shadow': '0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.25)',
      'shadow-hover': '0 10px 30px rgba(0,0,0,.4)',
      'shadow-sm': 'none',
      'card-bg': '#272c38', 'surface-sunken': '#1e222c', 'page-bg': '#1e222c',
      'font-num': SANS, 'font-weight-hd': '700',
      'rail-bg': '#1f1f1f', 'rail-border': '#303030', 'rail-idle': 'rgba(255,255,255,0.5)', 'rail-hover-bg': 'rgba(255,255,255,0.08)',
      'kpi-a': 'rgba(22,163,74,.12)', 'kpi-b': 'rgba(199,58,47,.12)',
      'kpi-c': '#272c38', 'kpi-txt': '#e8e8ee', 'kpi-mode': 'tint',
    },
  },

  /* ── 뉴브루탈리즘 ──────────────────────────────────────────── */
  brutal: {
    key: 'brutal',
    name: '뉴브루탈',
    desc: '두꺼운 테두리 · 하드 그림자',
    mode: 'light',
    accent: { light: '#7c5cff', dark: '#8b7bff' },
    light: {
      'radius-lg': '14px', 'radius': '10px', 'radius-sm': '8px',
      'border-w': '2.5px', 'border-color': '#111111',
      'shadow': '4px 4px 0 #111111',
      'shadow-hover': '6px 6px 0 #111111',
      'shadow-sm': '2px 2px 0 #111111',
      'card-bg': '#ffffff', 'surface-sunken': '#faf7ef', 'page-bg': '#f4f1e8',
      'font-num': SANS, 'font-weight-hd': '900',
      'rail-bg': '#ffde59', 'rail-border': '#111111', 'rail-idle': '#111111', 'rail-hover-bg': '#ffffff',
      'kpi-a': '#12b886', 'kpi-b': '#ff5c9d', 'kpi-c': '#59b0ff', 'kpi-txt': '#111111', 'kpi-mode': 'flat',
    },
    dark: {
      'radius-lg': '14px', 'radius': '10px', 'radius-sm': '8px',
      'border-w': '2.5px', 'border-color': '#f0ede4',
      'shadow': '4px 4px 0 #000000',
      'shadow-hover': '6px 6px 0 #000000',
      'shadow-sm': '2px 2px 0 #000000',
      'card-bg': '#20242d', 'surface-sunken': '#181b22', 'page-bg': '#14161c',
      'font-num': SANS, 'font-weight-hd': '900',
      'rail-bg': '#ffde59', 'rail-border': '#000000', 'rail-idle': '#111111', 'rail-hover-bg': 'rgba(0,0,0,0.12)',
      'kpi-a': '#12b886', 'kpi-b': '#ff5c9d', 'kpi-c': '#59b0ff', 'kpi-txt': '#111111', 'kpi-mode': 'flat',
    },
  },

  /* ── 클레이 (소프트 3D) ───────────────────────────────────── */
  clay: {
    key: 'clay',
    name: '클레이',
    desc: '아주 둥근 · 말랑한 그림자',
    mode: 'light',
    accent: { light: '#635bff', dark: '#8b7bff' },
    light: {
      'radius-lg': '26px', 'radius': '16px', 'radius-sm': '12px',
      'border-w': '0px', 'border-color': 'transparent',
      'shadow': '0 10px 30px rgba(90,90,130,.14), 0 2px 6px rgba(90,90,130,.08)',
      'shadow-hover': '0 16px 42px rgba(90,90,130,.22)',
      'shadow-sm': '0 4px 10px rgba(90,90,130,.12)',
      'card-bg': '#ffffff', 'surface-sunken': '#eef0fb', 'page-bg': '#eef0fb',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': '#eef0fb', 'rail-border': 'transparent', 'rail-idle': '#9a9cc4', 'rail-hover-bg': 'rgba(255,255,255,0.7)',
      'kpi-a': 'linear-gradient(145deg,#3fd7a5,#12b886)', 'kpi-b': 'linear-gradient(145deg,#ff8a9b,#f0475f)',
      'kpi-c': 'linear-gradient(145deg,#6db8ff,#3b82f6)', 'kpi-txt': '#ffffff', 'kpi-mode': 'grad',
    },
    dark: {
      'radius-lg': '26px', 'radius': '16px', 'radius-sm': '12px',
      'border-w': '0px', 'border-color': 'transparent',
      'shadow': '0 12px 34px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.3)',
      'shadow-hover': '0 18px 46px rgba(0,0,0,.55)',
      'shadow-sm': '0 4px 12px rgba(0,0,0,.4)',
      'card-bg': '#242838', 'surface-sunken': '#1b1e2b', 'page-bg': '#1b1e2b',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': '#1b1e2b', 'rail-border': 'transparent', 'rail-idle': '#7a7f9c', 'rail-hover-bg': 'rgba(255,255,255,0.05)',
      'kpi-a': 'linear-gradient(145deg,#2aa87f,#12805f)', 'kpi-b': 'linear-gradient(145deg,#e0596a,#c0334a)',
      'kpi-c': 'linear-gradient(145deg,#4a8fd8,#2f6ad0)', 'kpi-txt': '#ffffff', 'kpi-mode': 'grad',
    },
  },

  /* ── 미니멀 모노 (에디토리얼) ─────────────────────────────── */
  mono: {
    key: 'mono',
    name: '미니멀 모노',
    desc: '헤어라인 · 각진 · 무채색',
    mode: 'light',
    accent: { light: '#1a1a1a', dark: '#5a606e' },
    light: {
      'radius-lg': '0px', 'radius': '0px', 'radius-sm': '0px',
      'border-w': '1.5px', 'border-color': '#111111',
      'shadow': 'none',
      'shadow-hover': 'none',
      'shadow-sm': 'none',
      'card-bg': '#ffffff', 'surface-sunken': '#f5f5f3', 'page-bg': '#f7f7f4',
      'font-num': MONO, 'font-weight-hd': '800',
      'rail-bg': '#111111', 'rail-border': '#111111', 'rail-idle': '#8a8a8a', 'rail-hover-bg': 'rgba(255,255,255,0.12)',
      'kpi-a': '#ffffff', 'kpi-b': '#ffffff', 'kpi-c': '#ffffff', 'kpi-txt': '#111111', 'kpi-mode': 'line',
    },
    dark: {
      'radius-lg': '0px', 'radius': '0px', 'radius-sm': '0px',
      'border-w': '1.5px', 'border-color': '#4a4f5c',
      'shadow': 'none',
      'shadow-hover': 'none',
      'shadow-sm': 'none',
      'card-bg': '#15161c', 'surface-sunken': '#101118', 'page-bg': '#0b0c10',
      'font-num': MONO, 'font-weight-hd': '800',
      'rail-bg': '#000000', 'rail-border': '#4a4f5c', 'rail-idle': '#6a6f80', 'rail-hover-bg': 'rgba(255,255,255,0.08)',
      'kpi-a': '#15161c', 'kpi-b': '#15161c', 'kpi-c': '#15161c', 'kpi-txt': '#eef0f6', 'kpi-mode': 'line',
    },
  },

  /* ── 아우로라 글래스 (글래스모피즘) ───────────────────────── */
  glass: {
    key: 'glass',
    name: '아우로라 글래스',
    desc: '그라데이션 · 프로스트 유리',
    mode: 'dark',
    accent: { light: '#7c5cff', dark: '#8b7bff' },
    light: {
      'radius-lg': '20px', 'radius': '13px', 'radius-sm': '10px',
      'border-w': '1px', 'border-color': 'rgba(120,92,255,.18)',
      'shadow': '0 12px 40px rgba(90,70,180,.16)', 'shadow-hover': '0 18px 50px rgba(90,70,180,.24)', 'shadow-sm': '0 6px 18px rgba(90,70,180,.12)',
      'card-bg': 'rgba(255,255,255,.62)', 'surface-sunken': 'rgba(255,255,255,.4)',
      'page-bg': 'radial-gradient(900px 520px at 5% -8%,#c9bcff88,transparent 55%),radial-gradient(800px 600px at 100% 0,#ffc2e088,transparent 52%),radial-gradient(760px 700px at 55% 120%,#bff5ec88,transparent 55%),#eef0fb',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': 'rgba(255,255,255,.45)', 'rail-border': 'rgba(120,92,255,.14)', 'rail-idle': '#7b74a8', 'rail-hover-bg': 'rgba(255,255,255,.6)',
      'kpi-a': 'linear-gradient(145deg,#14e0c9,#0ea472)', 'kpi-b': 'linear-gradient(145deg,#ff6f91,#f0475f)',
      'kpi-c': 'linear-gradient(145deg,#9a7cff,#7c5cff)', 'kpi-txt': '#ffffff', 'kpi-mode': 'grad',
    },
    dark: {
      'radius-lg': '20px', 'radius': '13px', 'radius-sm': '10px',
      'border-w': '1px', 'border-color': 'rgba(255,255,255,.12)',
      'shadow': '0 14px 44px rgba(0,0,0,.35)', 'shadow-hover': '0 20px 54px rgba(0,0,0,.45)', 'shadow-sm': '0 6px 18px rgba(0,0,0,.3)',
      'card-bg': 'rgba(255,255,255,.06)', 'surface-sunken': 'rgba(255,255,255,.04)',
      'page-bg': 'radial-gradient(1000px 600px at 5% -8%,#6d5cff55,transparent 55%),radial-gradient(900px 700px at 100% 0,#ff4d9d3a,transparent 50%),radial-gradient(800px 800px at 55% 120%,#14e0c93a,transparent 55%),#0b0a16',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': 'rgba(255,255,255,.05)', 'rail-border': 'rgba(255,255,255,.08)', 'rail-idle': '#9a9ec4', 'rail-hover-bg': 'rgba(255,255,255,.09)',
      'kpi-a': 'linear-gradient(145deg,#14e0c9,#0ea472)', 'kpi-b': 'linear-gradient(145deg,#ff4d7a,#f03e5e)',
      'kpi-c': 'linear-gradient(145deg,#7c5cff,#a855f7)', 'kpi-txt': '#ffffff', 'kpi-mode': 'grad',
    },
  },

  /* ── 소프트 팝 (플랫 비비드 · 통굽 그림자) ────────────────── */
  pop: {
    key: 'pop',
    name: '소프트 팝',
    desc: '플랫 원색 · 통굽 그림자',
    mode: 'light',
    accent: { light: '#7c5cff', dark: '#8b7bff' },
    light: {
      'radius-lg': '20px', 'radius': '13px', 'radius-sm': '10px',
      'border-w': '0px', 'border-color': 'transparent',
      'shadow': '0 6px 0 #e6ddff', 'shadow-hover': '0 8px 0 #e0d5ff', 'shadow-sm': '0 3px 0 #ece6ff',
      'card-bg': '#ffffff', 'surface-sunken': '#faf8ff', 'page-bg': '#fff5ec',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': '#7c5cff', 'rail-border': 'transparent', 'rail-idle': 'rgba(255,255,255,.65)', 'rail-hover-bg': 'rgba(255,255,255,.16)',
      'kpi-a': '#12c98d', 'kpi-b': '#ff5c9d', 'kpi-c': '#7c5cff', 'kpi-txt': '#ffffff', 'kpi-mode': 'flat',
    },
    dark: {
      'radius-lg': '20px', 'radius': '13px', 'radius-sm': '10px',
      'border-w': '0px', 'border-color': 'transparent',
      'shadow': '0 6px 0 rgba(0,0,0,.35)', 'shadow-hover': '0 8px 0 rgba(0,0,0,.45)', 'shadow-sm': '0 3px 0 rgba(0,0,0,.3)',
      'card-bg': '#241f38', 'surface-sunken': '#1c1830', 'page-bg': '#161226',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': '#7c5cff', 'rail-border': 'transparent', 'rail-idle': 'rgba(255,255,255,.6)', 'rail-hover-bg': 'rgba(255,255,255,.16)',
      'kpi-a': '#12c98d', 'kpi-b': '#ff5c9d', 'kpi-c': '#7c5cff', 'kpi-txt': '#ffffff', 'kpi-mode': 'flat',
    },
  },

  /* ── 슬릭 다크 (Linear/Vercel 계열) ───────────────────────── */
  slick: {
    key: 'slick',
    name: '슬릭 다크',
    desc: '크리스프 다크 · 미세 보더',
    mode: 'dark',
    accent: { light: '#3b6fe0', dark: '#5b8cff' },
    light: {
      'radius-lg': '13px', 'radius': '9px', 'radius-sm': '7px',
      'border-w': '1px', 'border-color': '#e6e8ee',
      'shadow': '0 1px 2px rgba(20,22,40,.04), 0 8px 24px rgba(20,22,40,.05)', 'shadow-hover': '0 12px 30px rgba(20,22,40,.10)', 'shadow-sm': '0 1px 3px rgba(20,22,40,.06)',
      'card-bg': '#ffffff', 'surface-sunken': '#f4f5f8', 'page-bg': '#f7f8fc',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': '#12131a', 'rail-border': '#12131a', 'rail-idle': '#6b7080', 'rail-hover-bg': 'rgba(255,255,255,.08)',
      'kpi-a': '#eafaf1', 'kpi-b': '#fdecee', 'kpi-c': '#ffffff', 'kpi-txt': '#12131a', 'kpi-mode': 'tint',
    },
    dark: {
      'radius-lg': '13px', 'radius': '9px', 'radius-sm': '7px',
      'border-w': '1px', 'border-color': '#1e2027',
      'shadow': 'none', 'shadow-hover': '0 0 0 1px #2a2d38', 'shadow-sm': 'none',
      'card-bg': '#111318', 'surface-sunken': '#16181f', 'page-bg': '#0c0d11',
      'font-num': SANS, 'font-weight-hd': '800',
      'rail-bg': '#0c0d11', 'rail-border': '#1c1e26', 'rail-idle': '#5a5f6c', 'rail-hover-bg': '#16181f',
      'kpi-a': 'linear-gradient(180deg,#12211a,#111318)', 'kpi-b': 'linear-gradient(180deg,#221315,#111318)',
      'kpi-c': '#111318', 'kpi-txt': '#eef0f6', 'kpi-mode': 'tint',
    },
  },

  /* ── 페이퍼 (따뜻한 에디토리얼) ───────────────────────────── */
  paper: {
    key: 'paper',
    name: '페이퍼',
    desc: '크림 종이 · 세리프 제목',
    mode: 'light',
    accent: { light: '#c96f3f', dark: '#d98a5a' },
    light: {
      'radius-lg': '10px', 'radius': '8px', 'radius-sm': '6px',
      'border-w': '1px', 'border-color': '#e2d8c4',
      'shadow': '0 1px 2px rgba(90,70,40,.06)', 'shadow-hover': '0 4px 14px rgba(90,70,40,.10)', 'shadow-sm': 'none',
      'card-bg': '#fbf7ee', 'surface-sunken': '#f2ebdc', 'page-bg': '#f2ebdc',
      'font-num': "'Fraunces', 'Noto Sans KR', serif", 'font-weight-hd': '700',
      'rail-bg': '#2f2a20', 'rail-border': '#453f32', 'rail-idle': '#9a917c', 'rail-hover-bg': 'rgba(255,255,255,.08)',
      'kpi-a': '#eef0e2', 'kpi-b': '#f8ece4', 'kpi-c': '#fbf7ee', 'kpi-txt': '#3a3428', 'kpi-mode': 'tint',
    },
    dark: {
      'radius-lg': '10px', 'radius': '8px', 'radius-sm': '6px',
      'border-w': '1px', 'border-color': '#3d372b',
      'shadow': 'none', 'shadow-hover': '0 4px 16px rgba(0,0,0,.4)', 'shadow-sm': 'none',
      'card-bg': '#221e17', 'surface-sunken': '#1a1712', 'page-bg': '#15120d',
      'font-num': "'Fraunces', 'Noto Sans KR', serif", 'font-weight-hd': '700',
      'rail-bg': '#100e0a', 'rail-border': '#2c281f', 'rail-idle': '#8a8069', 'rail-hover-bg': 'rgba(255,255,255,.06)',
      'kpi-a': '#1a2416', 'kpi-b': '#2a1a13', 'kpi-c': '#221e17', 'kpi-txt': '#efe6d4', 'kpi-mode': 'tint',
    },
  },
};

export const SKIN_LIST = Object.values(SKINS).map((s) => ({ key: s.key, name: s.name, desc: s.desc }));
export const DEFAULT_SKIN = 'default';

/* 스킨 + 라이트/다크 → :root 에 --fd-sk-* 변수 주입.
   또한 스킨이 표면/테두리 색을 갖는 경우 기존 시맨틱 변수(--fd-surface 등)도
   덮어써 인라인/AntD 규칙이 자연히 스킨을 따르게 한다. */
export function applySkin(skinKey, isDark) {
  const skin = SKINS[skinKey] || SKINS[DEFAULT_SKIN];
  const set = skin[isDark ? 'dark' : 'light'];
  const root = document.documentElement;
  for (const k of SKIN_VARS) {
    root.style.setProperty(`--fd-sk-${k}`, set[k]);
  }
  // 시맨틱 표면 변수 동기화 (기본 스킨은 index.css 기본값과 동일하므로 무해)
  root.style.setProperty('--fd-surface', set['card-bg']);
  root.style.setProperty('--fd-surface-sunken', set['surface-sunken']);
  root.style.setProperty('--fd-border', set['border-color']);
  root.dataset.skin = skin.key;
}
