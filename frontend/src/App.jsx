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
import { getThemePrefs } from './api/settings';

// 즉시 필요한 셸/진입/에러 화면은 eager 로드 (PrivateRoute에서 동기 렌더되는 에러 포함)
import MainLayout from './components/Layout/MainLayout';
import LoginPage from './pages/Login';
import NotFound from './pages/Error/NotFound';
import Forbidden from './pages/Error/Forbidden';

// 페이지는 라우트 단위 코드 스플리팅 (무거운 라이브러리—캘린더/간트/차트/PDF—를 각 청크로 분리)
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const MyDayPage = lazy(() => import('./pages/MyDay'));
const FormsPage = lazy(() => import('./pages/Forms'));
const DocumentsPage = lazy(() => import('./pages/Documents'));
const TasksPage = lazy(() => import('./pages/Tasks'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const MemosPage = lazy(() => import('./pages/Memos'));
const GanttPage = lazy(() => import('./pages/Gantt'));
const AdminConsolePage = lazy(() => import('./pages/Admin/AdminConsole'));
const SystemSettingsPage = lazy(() => import('./pages/Admin/SystemSettings'));
const UsersAdminPage = lazy(() => import('./pages/Admin/Users'));
const DepartmentsAdminPage = lazy(() => import('./pages/Admin/Departments'));
const RecurringTasksAdminPage = lazy(() => import('./pages/Admin/RecurringTasks'));
const TagsAdminPage = lazy(() => import('./pages/Admin/Tags'));
const MilestonesAdminPage = lazy(() => import('./pages/Admin/Milestones'));
const EmailSettingsPage = lazy(() => import('./pages/Admin/EmailSettings'));
const TemplatesAdminPage = lazy(() => import('./pages/Admin/Templates'));
const BackupPage = lazy(() => import('./pages/Admin/Backup'));
const ActivityLogPage = lazy(() => import('./pages/Admin/ActivityLog'));
const AuditLogPage = lazy(() => import('./pages/Admin/AuditLog'));
const PiiBlockLogPage = lazy(() => import('./pages/Admin/PiiBlockLog'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const WorkloadPage = lazy(() => import('./pages/Workload'));
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
const BbsPage = lazy(() => import('./pages/BBS'));
const ApprovalPage = lazy(() => import('./pages/Approval'));
const ApprovalDocumentForm = lazy(() => import('./pages/Approval/DocumentForm'));
const ApprovalDocumentDetail = lazy(() => import('./pages/Approval/DocumentDetail'));
const ApprovalAdminPage = lazy(() => import('./pages/Admin/ApprovalAdmin'));
const AutomationsPage = lazy(() => import('./pages/Admin/Automations'));
const MailPage = lazy(() => import('./pages/Mail'));
const WikiPage = lazy(() => import('./pages/Wiki'));
const MeetingsPage = lazy(() => import('./pages/Meetings'));
const OkrPage = lazy(() => import('./pages/Okr'));

const PrivateRoute = ({ children, adminOnly = false, permission = null }) => {
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
  // 권한 그룹 기반 게이팅 — role 과 무관하게 해당 권한 보유자만 통과 (직무분리)
  if (permission && !(user.permissions || []).includes(permission)) return <Forbidden />;
  return children;
};

export default function App() {
  const { init, loading, user, logout } = useAuthStore();
  const { locked, lock, unlock } = useLockStore();
  const currentTheme = useThemeStore((s) => s.theme);
  const isDark = useThemeStore((s) => s.isDark);
  const density = useThemeStore((s) => s.density);
  const hydrateTheme = useThemeStore((s) => s.hydrateFromServer);

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

  // 로그인 시 서버에 저장된 개인 테마·화면 설정으로 동기화 (기기·재설치 무관 유지)
  useEffect(() => {
    if (!user) return;
    getThemePrefs().then(hydrateTheme).catch(() => {});
  }, [user, hydrateTheme]);

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
        algorithm: [
          isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
          ...(density === 'compact' ? [antTheme.compactAlgorithm] : []),
        ],
        token: {
          colorPrimary:       c.accentMid,
          colorLink:          c.accentMid,
          borderRadius:       10,
          borderRadiusLG:     14,
          borderRadiusSM:     8,
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
            : {
                // 라이트: 따뜻한 종이(Notion Warm) 톤 — 흰 카드 위 종이색 배경, 웜 그레이 테두리
                colorBgBase:          '#ffffff',
                colorTextBase:        '#37352f',
                colorBgLayout:        '#f4f4f2',
                colorBorder:          '#e2e0da',
                colorBorderSecondary: '#f1efea',
              }),
          controlHeight:      32,
          // 모션: 전역으로 끄지 않고 빠른 슬라이드로 통일 (Drawer/Modal이 번쩍이지 않고 매끄럽게 열림)
          motionDurationFast: '0.1s',
          motionDurationMid:  '0.15s',
          motionDurationSlow: '0.2s',
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
          <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--fd-content-bg-light, #f4f4f2)' }}>
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
          <Route path="my-day" element={<MyDayPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="kanban" element={<Navigate to="/tasks?view=kanban" replace />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="memos" element={<MemosPage />} />
          <Route path="gantt" element={<GanttPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="workload" element={<WorkloadPage />} />
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
          <Route path="bbs" element={<BbsPage />} />
          <Route path="approvals" element={<ApprovalPage />} />
          <Route path="approvals/new" element={<ApprovalDocumentForm />} />
          <Route path="approvals/:id" element={<ApprovalDocumentDetail />} />
          <Route path="approvals/:id/edit" element={<ApprovalDocumentForm />} />
          <Route path="mail" element={<MailPage />} />
          <Route path="wiki" element={<WikiPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="okr" element={<OkrPage />} />
          <Route
            path="admin"
            element={
              <PrivateRoute adminOnly>
                <AdminConsolePage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/system"
            element={
              <PrivateRoute adminOnly>
                <SystemSettingsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/users"
            element={
              <PrivateRoute adminOnly>
                <UsersAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/departments"
            element={
              <PrivateRoute adminOnly>
                <DepartmentsAdminPage />
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
          <Route
            path="pii-audit"
            element={
              <PrivateRoute permission="PII_AUDIT">
                <PiiBlockLogPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/approval"
            element={
              <PrivateRoute adminOnly>
                <ApprovalAdminPage />
              </PrivateRoute>
            }
          />
          <Route
            path="admin/automations"
            element={
              <PrivateRoute adminOnly>
                <AutomationsPage />
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
