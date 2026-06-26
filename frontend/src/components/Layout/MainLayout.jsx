import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Layout } from 'antd';
import ResizableDrawer from '../common/ResizableDrawer';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import SubHeader from './SubHeader';
import NotificationToast from '../Notification/NotificationToast';
import useNotificationStore from '../../store/notificationStore';
import useThemeStore from '../../store/themeStore';

const { Content } = Layout;

const SSE_URL = '/api/notifications/stream';
const CTX_MIN_KEY = 'flowdesk.ctxpane.min';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function MainLayout() {
  const location = useLocation();
  const isDashboard = location.pathname === '/';

  // 컨텍스트 패널 최소화 상태 (새로고침 후에도 유지)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(CTX_MIN_KEY) === '1',
  );
  const handleCollapse = (val) => {
    const next = typeof val === 'boolean' ? val : !collapsed;
    setCollapsed(next);
    localStorage.setItem(CTX_MIN_KEY, next ? '1' : '0');
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const fetchNotifications = useNotificationStore((s) => s.fetch);
  const addSSENotification = useNotificationStore((s) => s.addSSENotification);
  const esRef = useRef(null);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    fetchNotifications();

    const connect = () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      const es = new EventSource(`${SSE_URL}?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.addEventListener('notification', (e) => {
        try {
          const data = JSON.parse(e.data);
          addSSENotification(data);
        } catch {}
      });

      es.onerror = () => {
        es.close();
        reconnectTimer.current = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      clearTimeout(reconnectTimer.current);
    };
  }, []);

  return (
    <Layout hasSider style={{ height: '100vh', overflow: 'hidden' }}>
      {isMobile ? (
        <ResizableDrawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          placement="left"
          width={272}
          styles={{ body: { padding: 0 }, header: { display: 'none' } }}
          style={{ padding: 0 }}
        >
          <Sidebar
            collapsed={false}
            onCollapse={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
          />
        </ResizableDrawer>
      ) : (
        <Sidebar collapsed={collapsed} onCollapse={handleCollapse} />
      )}
      <Layout style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <AppHeader
          collapsed={collapsed}
          onCollapse={isMobile ? () => setMobileOpen(true) : handleCollapse}
        />
        <SubHeader />
        <Content
          style={{
            flex: 1,
            minHeight: 0,
            margin: 0,
            padding: isDashboard ? 0 : '24px 28px',
            background: 'var(--fd-content-bg-light, #f8fafc)',
            borderRadius: 0,
            overflow: isDashboard ? 'hidden' : 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
      <NotificationToast />
    </Layout>
  );
}
