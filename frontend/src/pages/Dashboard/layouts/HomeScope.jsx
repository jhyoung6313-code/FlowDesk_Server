import { HOME_SCOPES } from '../../../utils/homeLayouts';

/* 새 홈 레이아웃 공통: 보여 줄 업무 범위 전환 (전체 업무 / 내 담당).
   tone 으로 레이아웃별 색을 맞춘다 — 'dark' | 'green' | 'light' | 'ink'. */
const TONES = {
  dark:  { track: '#161A20', on: '#C6F432', onText: '#0E1013', off: '#8A94A3', border: '#2F3743' },
  green: { track: 'rgba(255,255,255,0.1)', on: '#FF8A3D', onText: '#12372F', off: '#B9D3C9', border: 'transparent' },
  light: { track: '#F3F4F8', on: '#1F2430', onText: '#fff', off: '#5C6478', border: 'transparent' },
  ink:   { track: '#fff', on: '#111', onText: '#fff', off: '#555', border: '#111' },
};

export default function HomeScope({ scope, setScope, tone = 'light' }) {
  const c = TONES[tone] || TONES.light;
  return (
    <div role="group" aria-label="업무 범위" style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: tone === 'ink' ? 0 : 999, background: c.track, border: `1px solid ${c.border}` }}>
      {HOME_SCOPES.map((s) => {
        const on = scope === s.key;
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            onClick={() => setScope(s.key)}
            style={{
              height: 32, padding: '0 14px', border: 0, borderRadius: tone === 'ink' ? 0 : 999, cursor: 'pointer',
              background: on ? c.on : 'transparent', color: on ? c.onText : c.off, fontSize: 13, fontWeight: 700,
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
