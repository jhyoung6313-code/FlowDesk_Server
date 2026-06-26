import { useEffect, useCallback, lazy, Suspense } from 'react';
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

// 즉시 필요한 셸/진입/에러 화면은 eager 로드 (PrivateRoute에서 동기 렌더되는 에러 포함)
import MainLayout from './components/Layout/MainLayout';
import LoginPage from './pages/Login';
import NotFound from './pages/Error/NotFound';
import Forbidden from './pages/Error/Forbidden';

// 페이지는 라우트 단위 코드 스플리팅 (무거운 라이브러리—캘린더/간트/차트/PDF—를 각 청크로 분리)
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const TasksPage = lazy(() => import('./pages/Tasks'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const MemosPage = lazy(() => import('./pages/Memos'));
const GanttPage = lazy(() => import('./pages/Gantt'));
const UsersAdminPage = lazy(() => import('./pages/Admin/Users'));
const PartsAdminPage = lazy(() => import('./pages/Admin/Parts'));
const RecurringTasksAdminPage = lazy(() => import('./pages/Admin/RecurringTasks'));
const TagsAdminPage = lazy(() => import('./pages/Admin/Tags'));
const MilestonesAdminPage = lazy(() => import('./pages/Admin/Milestones'));
const EmailSettingsPage = lazy(() => import('./pages/Admin/EmailSettings'));
const TemplatesAdminPage = lazy(() => import('./pages/Admin/Templates'));
const BackupPage = lazy(() => import('./pages/Admin/Backup'));
const ActivityLogPage = lazy(() => import('./pages/Admin/ActivityLog'));
const AuditLogPage = lazy(() => import('./pages/Admin/AuditLog'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const WbsWorkspace = lazy(() => import('./pages/WBS/WbsWorkspace'));
const LedgerPage = lazy(() => import('./pages/Ledger'));
const ChatPage = lazy(() => import('./pages/Chat'));
const ChatPopupPage = lazy(() => import('./pages/ChatPopup'));
const BoardWorkspace = lazy(() => import('./pages/Board'));
const PlaybookWorkspace = lazy(() => import('./pages/Playbook/PlaybookWorkspace'));
const PlaybookEditor = lazy(() => import('./pages/Playbook/PlaybookEditor'));
const RunListPage = lazy(() => import('./pages/PlaybookRun'));
const RunDetailPage = lazy(() => import('./pages/PlaybookRun/RunDetail'));

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
  const currentTheme = useThemeStore((s) => s.theme);
  const isDark = useThemeStore((s) => s.isDark);

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
          // 라이트는 흰 배경/짙은 텍스트 고정. 다크는 거의-검정 대신 부드러운 슬레이트 톤으로 상향
          // (페이지<콘텐츠<카드<엘리베이티드 단계로 대비를 줘서 카드·행 구분이 살아나도록).
          ...(isDark
            ? {
                colorBgBase:          '#1e222c',
                colorBgLayout:        '#181b24',
                colorBgContainer:     '#272c38',
                colorBgElevated:      '#2f3543',
                colorBorder:          '#3a4150',
                colorBorderSecondary: '#2b313d',
              }
            : { colorBgBase: '#ffffff', colorTextBase: '#0f172a' }),
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

      <Suspense
        fallback={
          <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" tip="로딩 중..." />
          </div>
        }
      >
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
          <Route path="memos" element={<MemosPage />} />
          <Route path="gantt" element={<GanttPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="wbs" element={<WbsWorkspace />} />
          <Route path="wbs/:projectId" element={<WbsWorkspace />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="boards" element={<BoardWorkspace />} />
          <Route path="boards/:id" element={<BoardWorkspace />} />
          <Route path="playbooks" element={<PlaybookWorkspace />} />
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
          <Route
            path="admin/audit-log"
            element={
              <PrivateRoute adminOnly>
                <AuditLogPage />
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
      </Suspense>
    </>
    </ChatSocketContext.Provider>
    </ConfigProvider>
  );
}
