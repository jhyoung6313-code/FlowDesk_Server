import { useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin, ConfigProvider, theme as antTheme } from 'antd';
import useAuthStore from './store/authStore';
import useLockStore from './store/lockStore';
import useIdleTimeout from './hooks/useIdleTimeout';
import LockScreen from './components/LockScreen';
import useChatSocket from './hooks/useChatSocket';
import { requestNotificationPermission } from './utils/desktopNotification';
import { ChatSocketContext } from './contexts/ChatSocketContext';
import useThemeStore from './store/themeStore';
import MainLayout from './components/Layout/MainLayout';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import TasksPage from './pages/Tasks';
import CalendarPage from './pages/Calendar';
import GanttPage from './pages/Gantt';
import UsersAdminPage from './pages/Admin/Users';
import PartsAdminPage from './pages/Admin/Parts';
import RecurringTasksAdminPage from './pages/Admin/RecurringTasks';
import TagsAdminPage from './pages/Admin/Tags';
import MilestonesAdminPage from './pages/Admin/Milestones';
import EmailSettingsPage from './pages/Admin/EmailSettings';
import TemplatesAdminPage from './pages/Admin/Templates';
import BackupPage from './pages/Admin/Backup';
import ActivityLogPage from './pages/Admin/ActivityLog';
import NotificationsPage from './pages/Notifications';
import ProfilePage from './pages/Profile';
import NotFound from './pages/Error/NotFound';
import Forbidden from './pages/Error/Forbidden';
import WbsPage from './pages/WBS';
import LedgerPage from './pages/Ledger';
import ChatPage from './pages/Chat';
import ChatPopupPage from './pages/ChatPopup';
import BoardWorkspace from './pages/Board';
import PlaybookListPage from './pages/Playbook';
import PlaybookEditor from './pages/Playbook/PlaybookEditor';
import RunListPage from './pages/PlaybookRun';
import RunDetailPage from './pages/PlaybookRun/RunDetail';

const PrivateRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Forbidden />;
  return children;
};

export default function App() {
  const { init, loading, user, logout } = useAuthStore();
  const { locked, lock, unlock } = useLockStore();
  const isDark = useThemeStore((s) => s.isDark);
  const currentTheme = useThemeStore((s) => s.theme);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const socketRef = useChatSocket(user ? token : null);

  // 잠금 해제 후 로그아웃 (자정 자동 로그아웃·잠금화면 로그아웃 버튼 공용)
  const handleLogout = useCallback(async () => {
    unlock();
    await logout();
  }, [logout, unlock]);

  useIdleTimeout({
    timeoutMin: user?.idleTimeoutMin ?? 60,
    onLock: lock,
    onDayChange: handleLogout,
    enabled: !!user,
    paused: locked,
  });

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (user) requestNotificationPermission();
  }, [user]);

  // 로그인 상태가 아니면(토큰 만료 등) 잠금 잔재를 정리한다.
  useEffect(() => {
    if (!user && locked) unlock();
  }, [user, locked, unlock]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="로딩 중..." />
      </div>
    );
  }

  const c = currentTheme.colors;

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary:       c.accentMid,
          colorLink:          c.accentMid,
          borderRadius:       8,
          borderRadiusLG:     10,
          borderRadiusSM:     6,
          fontFamily:         "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif",
          fontSize:           13,
          colorBgBase:        isDark ? '#0f0e1a' : '#ffffff',
          colorTextBase:      isDark ? 'rgba(255,255,255,0.88)' : '#0f172a',
          controlHeight:      32,
          motion:             false,
        },
        components: {
          Card: {
            headerFontSize:   13,
            headerFontSizeSM: 12,
          },
          Table: {
            headerFontSize:   12,
          },
          Button: {
            fontWeight:       500,
          },
          Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 6,
          },
        },
      }}
    >
    <ChatSocketContext.Provider value={socketRef}>
    <>
      {user && locked && (
        <LockScreen user={user} onUnlock={unlock} onLogout={handleLogout} />
      )}

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="kanban" element={<Navigate to="/tasks?view=kanban" replace />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="gantt" element={<GanttPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="wbs" element={<WbsPage />} />
          <Route path="wbs/:projectId" element={<WbsPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="boards" element={<BoardWorkspace />} />
          <Route path="boards/:id" element={<BoardWorkspace />} />
          <Route path="playbooks" element={<PlaybookListPage />} />
          <Route path="playbooks/new" element={<PlaybookEditor />} />
          <Route path="playbooks/:id" element={<PlaybookEditor />} />
          <Route path="playbooks/:id/edit" element={<PlaybookEditor />} />
          <Route path="runs" element={<RunListPage />} />
          <Route path="runs/:id" element={<RunDetailPage />} />
          <Route
            path="admin/users"
            element={
              <PrivateRoute adminOnly>
                <UsersAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/parts"
            element={
              <PrivateRoute adminOnly>
                <PartsAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/recurring-tasks"
            element={
              <PrivateRoute adminOnly>
                <RecurringTasksAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/tags"
            element={
              <PrivateRoute adminOnly>
                <TagsAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/milestones"
            element={
              <PrivateRoute adminOnly>
                <MilestonesAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/email-settings"
            element={
              <PrivateRoute adminOnly>
                <EmailSettingsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/templates"
            element={
              <PrivateRoute adminOnly>
                <TemplatesAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/backup"
            element={
              <PrivateRoute adminOnly>
                <BackupPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/activity-log"
            element={
              <PrivateRoute adminOnly>
                <ActivityLogPage />
              </PrivateRoute>
            }
          />
        </Route>
        <Route
          path="/chat-popup"
          element={
            <PrivateRoute>
              <ChatPopupPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
    </ChatSocketContext.Provider>
    </ConfigProvider>
  );
}
