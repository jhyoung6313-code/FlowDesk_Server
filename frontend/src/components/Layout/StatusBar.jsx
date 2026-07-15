import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import useNotificationStore from '../../store/notificationStore';
import useChatStore from '../../store/chatStore';

dayjs.locale('ko');

const APP_VERSION = 'v2.13.0';

/* 앱 전역 하단 상태바 — 온라인·사용자·알림/채팅·시계·버전 표시 + 하단 경계 제공 */
export default function StatusBar() {
  const navigate    = useNavigate();
  const user        = useAuthStore((s) => s.user);
  const isDark      = useThemeStore((s) => s.isDark);
  const unread      = useNotificationStore((s) => s.unreadCount);
  const chatUnread  = useChatStore((s) => s.totalUnread);

  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  const bg     = isDark ? '#141414' : '#ffffff';
  const border = isDark ? '#303030' : '#e9e7e2';
  const t2     = isDark ? 'rgba(255,255,255,0.55)' : '#8a827a';
  const t1     = isDark ? 'rgba(255,255,255,0.85)' : '#37352f';

  const item = { display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' };
  const clickable = { ...item, cursor: 'pointer' };

  return (
    <div style={{
      flexShrink: 0,
      height: 28,
      background: bg,
      borderTop: `1px solid ${border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      fontSize: 11.5,
      color: t2,
      gap: 16,
      userSelect: 'none',
    }}>
      {/* 좌: 접속 상태 · 사용자 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <span style={item}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
          온라인
        </span>
        {user && (
          <span style={{ ...item, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            👤 <b style={{ color: t1, fontWeight: 600 }}>{user.displayName}</b>
            {user.position ? ` · ${user.position}` : ''}
          </span>
        )}
      </div>

      {/* 우: 알림/채팅 · 날짜 · 시계 · 버전 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {unread > 0 && (
          <span style={clickable} onClick={() => navigate('/notifications')} title="알림">
            🔔 <b style={{ color: t1, fontWeight: 600 }}>{unread}</b>
          </span>
        )}
        {chatUnread > 0 && (
          <span style={clickable} onClick={() => navigate('/chat')} title="채팅">
            💬 <b style={{ color: t1, fontWeight: 600 }}>{chatUnread}</b>
          </span>
        )}
        <span style={item}>📅 {now.format('YYYY-MM-DD (ddd)')}</span>
        <span style={{ ...item, color: t1, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          🕐 {now.format('A h:mm:ss')}
        </span>
        <span style={item}>FlowDesk {APP_VERSION}</span>
      </div>
    </div>
  );
}
