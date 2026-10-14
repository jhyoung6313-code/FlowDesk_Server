import {
  DashboardOutlined, ScheduleOutlined, CheckSquareOutlined, CalendarOutlined, BarChartOutlined,
  TeamOutlined, FlagOutlined, SnippetsOutlined, MessageOutlined, AppstoreOutlined, ReadOutlined,
  FileDoneOutlined, FormOutlined, FolderOutlined, BookOutlined, ProjectOutlined, MailOutlined,
  NotificationOutlined, WalletOutlined,
} from '@ant-design/icons';

/* 좌측 레일에 고정할 수 있는 이동 가능 화면 목록 (단일 원천).
   key = 라우트 경로. badge = 미읽음/대기 건수를 가져올 unreadStore 항목. */
export const NAV_GROUPS = [
  { key: 'work',   label: '업무' },
  { key: 'collab', label: '협업' },
  { key: 'biz',    label: '업무지원' },
];

export const NAV_ITEMS = [
  { key: '/',          title: '대시보드',  icon: <DashboardOutlined />,    group: 'work' },
  { key: '/my-day',    title: '내 하루',   icon: <ScheduleOutlined />,     group: 'work' },
  { key: '/tasks',     title: '업무 관리', icon: <CheckSquareOutlined />,  group: 'work' },
  { key: '/calendar',  title: '캘린더',    icon: <CalendarOutlined />,     group: 'work' },
  { key: '/gantt',     title: '간트 차트', icon: <BarChartOutlined />,     group: 'work' },
  { key: '/workload',  title: '워크로드',  icon: <TeamOutlined />,         group: 'work' },
  { key: '/okr',       title: 'OKR',       icon: <FlagOutlined />,         group: 'work' },
  { key: '/memos',     title: '메모지',    icon: <SnippetsOutlined />,     group: 'work' },
  { key: '/chat',      title: '채팅',      icon: <MessageOutlined />,      group: 'collab', badge: 'chat' },
  { key: '/boards',    title: '보드',      icon: <AppstoreOutlined />,     group: 'collab', badge: 'board' },
  { key: '/wiki',      title: '위키',      icon: <ReadOutlined />,         group: 'collab' },
  { key: '/meetings',  title: '회의',      icon: <FileDoneOutlined />,     group: 'collab' },
  { key: '/forms',     title: '설문',      icon: <FormOutlined />,         group: 'collab' },
  { key: '/documents', title: '문서함',    icon: <FolderOutlined />,       group: 'collab' },
  { key: '/playbooks', title: 'Playbook',  icon: <BookOutlined />,         group: 'collab', badge: 'playbook' },
  { key: '/wbs',       title: '프로젝트',  icon: <ProjectOutlined />,      group: 'collab' },
  { key: '/mail',      title: '메일',      icon: <MailOutlined />,         group: 'biz', badge: 'mail' },
  { key: '/bbs',       title: '게시판',    icon: <NotificationOutlined />, group: 'biz' },
  { key: '/approvals', title: '전자결재',  icon: <FileDoneOutlined />,     group: 'biz', badge: 'approval' },
  { key: '/ledger',    title: '가계부',    icon: <WalletOutlined />,       group: 'biz' },
];

export const NAV_BY_KEY = Object.fromEntries(NAV_ITEMS.map((i) => [i.key, i]));

/* 기존 레일 구성 = 기본값 (설정 없는 사용자는 화면이 그대로) */
export const DEFAULT_PINNED = [
  '/', '/my-day', '/tasks', '/workload', '/memos', '/chat', '/boards', '/playbooks', '/wbs',
];
