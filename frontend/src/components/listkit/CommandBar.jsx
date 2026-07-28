import { theme as antTheme } from 'antd';

const { useToken } = antTheme;

/* 목록 화면 상단 명령바 — 왼쪽에 액션(left), 오른쪽에 검색/보조(right) */
export default function CommandBar({ left, right, style }) {
  const { token } = useToken();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
      borderBottom: `1px solid ${token.colorBorderSecondary}`,
      background: token.colorBgContainer, flexShrink: 0, ...style,
    }}>
      {left}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}
