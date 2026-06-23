import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, ConfigProvider, Button, Modal, Form, Input, DatePicker, Tag, Space, message, Tooltip, Avatar, Dropdown } from 'antd';
import {
  DashboardOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  UserOutlined,
  AppstoreOutlined,
  ApartmentOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  CalendarOutlined,
  MessageOutlined,
  ProjectOutlined,
  BookOutlined,
  PlayCircleOutlined,
  DoubleLeftOutlined,
  LockOutlined,
  LogoutOutlined,
  ReloadOutlined,
  TagsOutlined,
  FlagOutlined,
  FileTextOutlined,
  MailOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import useChatStore from '../../store/chatStore';
import useUnreadStore from '../../store/unreadStore';
import { getAvatarColor } from '../../utils/colors';
import { getMe } from '../../api/auth';
import * as wbsApi from '../../api/wbs';
import ProfileModal from '../ProfileModal';
import ChangePasswordModal from '../ChangePasswordModal';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const RAIL_WIDTH = 60;
const CTX_WIDTH = 212;
const RAIL_BG = '#101322';

// 테마별 섹션 카드 색상 (view/collab/admin 각각 테마와 어울리는 색)
const THEME_GROUPS = {
  slate: {
    view:   { color: '#2563eb', tint: '#e8f2fe' },
    collab: { color: '#10b981', tint: '#e4fdf3' },
    admin:  { color: '#7c3aed', tint: '#f2efff' },
  },
  ocean: {
    view:   { color: '#0891b2', tint: '#e2fbff' },
    collab: { color: '#059669', tint: '#e4fdf3' },
    admin:  { color: '#7c3aed', tint: '#f2efff' },
  },
  aurora: {
    view:   { color: '#4f46e5', tint: '#ecedff' },
    collab: { color: '#059669', tint: '#e4fdf3' },
    admin:  { color: '#9333ea', tint: '#f5eeff' },
  },
  forest: {
    view:   { color: '#2563eb', tint: '#e8f2fe' },
    collab: { color: '#16a34a', tint: '#d8fce8' },
    admin:  { color: '#7c3aed', tint: '#f2efff' },
  },
  sunset: {
    view:   { color: '#2563eb', tint: '#e8f2fe' },
    collab: { color: '#059669', tint: '#e4fdf3' },
    admin:  { color: '#c026d3', tint: '#fceeff' },
  },
  rose: {
    view:   { color: '#2563eb', tint: '#e8f2fe' },
    collab: { color: '#059669', tint: '#e4fdf3' },
    admin:  { color: '#9333ea', tint: '#f5eeff' },
  },
};

// submenu 제목 클릭 시 펼침과 함께 이동할 대표 페이지
const SUBMENU_LANDING = {
  'playbook-submenu': '/playbooks',
  'project-submenu': '/wbs',
  'wbs-submenu': '/wbs',
};

/* ── 역할 담당자 편집기 (프로젝트 생성/수정 모달용) ── */
function MemberEditor({ members, onChange }) {
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState('');
  const [name, setName] = useState('');

  const handleAdd = () => {
    if (!role.trim() || !name.trim()) return;
    onChange([...members, { role: role.trim(), memberName: name.trim() }]);
    setRole('');
    setName('');
    setAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {members.map((m, i) => (
        <Tag
          key={i}
          closable
          onClose={() => onChange(members.filter((_, idx) => idx !== i))}
          style={{ fontSize: 12 }}
        >
          <span style={{ color: '#888', marginRight: 4 }}>{m.role}</span>
          <span style={{ fontWeight: 600 }}>{m.memberName}</span>
        </Tag>
      ))}
      {adding ? (
        <Space size={4}>
          <Input
            size="small"
            placeholder="역할 (PM/PL...)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ width: 100 }}
          />
          <Input
            size="small"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleAdd}
            style={{ width: 80 }}
          />
          <Button size="small" type="primary" onClick={handleAdd}>확인</Button>
          <Button size="small" onClick={() => setAdding(false)}>취소</Button>
        </Space>
      ) : (
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          담당자 추가
        </Button>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onCollapse, onNavigate }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);
  const totalUnread = useChatStore((s) => s.totalUnread);
  const boardUnread = useUnreadStore((s) => s.boardUnread);
  const playbookUnread = useUnreadStore((s) => s.playbookUnread);
  const isAdmin = user?.role === 'admin';
  const { theme } = useThemeStore();
  const c = theme.colors;

  // 현재 테마에 맞는 섹션 그룹 색상 (없으면 slate 기본값)
  const GROUPS = THEME_GROUPS[theme.key] ?? THEME_GROUPS.slate;

  // 테마 sidebar 토큰으로 컨텍스트 패널 팔레트 구성 (레일은 항상 다크 고정)
  const COLORS = {
    ctxBg:        c.sidebarBg,
    border:       c.sidebarDivider,
    headText:     c.sidebarText,
    itemText:     c.sidebarText,
    itemHoverBg:  c.sidebarHoverBg,
    itemHoverText:c.sidebarHoverText,
    toggleText:   c.sidebarGroup,
    toggleHoverBg:c.sidebarHoverBg,
  };

  // WBS 프로젝트 목록 상태
  const [wbsProjects, setWbsProjects] = useState([]);
  const [openKeys, setOpenKeys] = useState([]);

  // 프로젝트 생성/수정 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [form] = Form.useForm();
  const [members, setMembers] = useState([]);

  // 내 프로필 / 비밀번호 변경 팝업 상태
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // WBS 프로젝트 목록 로드
  const loadWbsProjects = async () => {
    try {
      const list = await wbsApi.getProjects();
      setWbsProjects(list);
    } catch {
      // 조용히 실패
    }
  };

  useEffect(() => {
    loadWbsProjects();
    const handler = () => loadWbsProjects();
    window.addEventListener('wbs-projects-changed', handler);
    return () => window.removeEventListener('wbs-projects-changed', handler);
  }, []);

  // 로그인 직후 user에 clientIp가 없으면 getMe로 보강
  useEffect(() => {
    if (user && !user.clientIp) {
      getMe().then(setUser).catch(() => {});
    }
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // 프로젝트 하위 페이지 진입 시 SubMenu 자동 펼치기
  useEffect(() => {
    if (pathname.startsWith('/wbs')) {
      setOpenKeys((prev) => {
        const next = [...prev];
        if (!next.includes('project-submenu')) next.push('project-submenu');
        if (!next.includes('wbs-submenu')) next.push('wbs-submenu');
        return next;
      });
    } else if (pathname.startsWith('/playbooks') || pathname.startsWith('/runs')) {
      setOpenKeys((prev) => prev.includes('playbook-submenu') ? prev : [...prev, 'playbook-submenu']);
    }
  }, [pathname]);

  const getSelected = () => {
    if (pathname === '/') return '/';
    if (pathname.startsWith('/tasks')) return '/tasks';
    if (pathname.startsWith('/kanban')) return '/tasks';
    if (pathname.startsWith('/calendar')) return '/calendar';
    if (pathname.startsWith('/memos')) return '/memos';
    if (pathname.startsWith('/gantt')) return '/gantt';
    if (pathname.startsWith('/boards')) return '/boards';
    if (pathname.startsWith('/playbooks')) return '/playbooks';
    if (pathname.startsWith('/runs')) return '/runs';
    if (pathname.startsWith('/notifications')) return '/notifications';
    if (pathname.startsWith('/admin/recurring-tasks')) return '/admin/recurring-tasks';
    if (pathname.startsWith('/admin/tags')) return '/admin/tags';
    if (pathname.startsWith('/admin/milestones')) return '/admin/milestones';
    if (pathname.startsWith('/admin/users')) return '/admin/users';
    if (pathname.startsWith('/wbs/')) return pathname;
    if (pathname === '/wbs') return '/wbs';
    if (pathname.startsWith('/ledger')) return '/ledger';
    if (pathname.startsWith('/chat')) return '/chat';
    return '/';
  };

  const go = (key) => {
    navigate(key);
    onNavigate?.();
  };

  // ── 프로젝트 생성/수정 모달 열기
  const openProjectModal = (e, proj = null) => {
    e?.stopPropagation?.();
    setEditingProject(proj);
    if (proj) {
      form.setFieldsValue({
        name: proj.name,
        period: [
          proj.startDate ? dayjs(proj.startDate) : null,
          proj.endDate ? dayjs(proj.endDate) : null,
        ],
        description: proj.description,
      });
      setMembers(proj.members || []);
    } else {
      form.resetFields();
      setMembers([]);
    }
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        name: values.name,
        startDate: values.period?.[0]?.format('YYYY-MM-DD') || null,
        endDate: values.period?.[1]?.format('YYYY-MM-DD') || null,
        description: values.description || null,
        members,
      };
      if (editingProject) {
        await wbsApi.updateProject(editingProject.id, payload);
        message.success('프로젝트가 수정되었습니다.');
      } else {
        const created = await wbsApi.createProject(payload);
        message.success('프로젝트가 생성되었습니다.');
        navigate(`/wbs/${created.id}`);
      }
      setModalOpen(false);
      loadWbsProjects();
      window.dispatchEvent(new Event('wbs-projects-changed'));
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    }
  };

  const handleDeleteProject = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await wbsApi.deleteProject(id);
      message.success('삭제되었습니다.');
      if (pathname === `/wbs/${id}`) {
        navigate('/wbs');
      }
      loadWbsProjects();
      window.dispatchEvent(new Event('wbs-projects-changed'));
    } catch {
      message.error('삭제 실패');
    }
  };

  // 협업 그룹 강조색 (WBS 하위 아이콘 색)
  const collabClr = GROUPS.collab.color;

  // WBS SubMenu children (프로젝트 목록)
  const wbsChildren = [
    ...wbsProjects.map((proj) => ({
      key: `/wbs/${proj.id}`,
      icon: <FolderOutlined style={{ color: collabClr }} />,
      label: (
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          title={proj.name}
        >
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 14,
            }}
          >
            {proj.name}
          </span>
          {isAdmin && (
            <span
              style={{ display: 'flex', gap: 2, marginLeft: 4, flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <span
                onClick={(e) => openProjectModal(e, proj)}
                style={{ cursor: 'pointer', color: '#43a047', fontSize: 11, padding: '0 2px' }}
                title="수정"
              >
                <EditOutlined />
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`"${proj.name}" 프로젝트를 삭제하시겠습니까?`)) {
                    handleDeleteProject(e, proj.id);
                  }
                }}
                style={{ cursor: 'pointer', color: '#ff4d4f', fontSize: 11, padding: '0 2px' }}
                title="삭제"
              >
                <DeleteOutlined />
              </span>
            </span>
          )}
        </div>
      ),
    })),
    ...(isAdmin
      ? [
          {
            key: 'wbs-new-project',
            icon: <PlusOutlined style={{ color: collabClr }} />,
            label: (
              <span style={{ color: collabClr, fontSize: 14, fontWeight: 500 }}>
                새 프로젝트
              </span>
            ),
          },
        ]
      : []),
  ];

  // ── 섹션별 메뉴 항목 (아이콘에 그룹색)
  const viewItems = [
    { key: '/', icon: <DashboardOutlined style={{ color: GROUPS.view.color }} />, label: '대시보드' },
    { key: '/tasks', icon: <CheckSquareOutlined style={{ color: GROUPS.view.color }} />, label: '업무 관리' },
    { key: '/gantt', icon: <BarChartOutlined style={{ color: GROUPS.view.color }} />, label: '간트 차트' },
    { key: '/calendar', icon: <CalendarOutlined style={{ color: GROUPS.view.color }} />, label: '캘린더' },
    { key: '/memos', icon: <SnippetsOutlined style={{ color: GROUPS.view.color }} />, label: '메모지' },
  ];

  const collabItems = [
    {
      key: '/chat',
      icon: <MessageOutlined style={{ color: collabClr }} />,
      label: totalUnread > 0 ? `채팅 (${totalUnread})` : '채팅',
    },
    {
      key: '/boards',
      icon: <AppstoreOutlined style={{ color: collabClr }} />,
      label: boardUnread > 0 ? `보드 (${boardUnread})` : '보드',
    },
    {
      key: 'playbook-submenu',
      icon: <BookOutlined style={{ color: collabClr }} />,
      label: playbookUnread > 0 ? `Playbook (${playbookUnread})` : 'Playbook',
      children: [
        { key: '/playbooks', icon: <BookOutlined style={{ color: collabClr }} />, label: 'Playbook 목록' },
        { key: '/runs', icon: <PlayCircleOutlined style={{ color: collabClr }} />, label: 'Run 목록' },
      ],
    },
    {
      key: 'project-submenu',
      icon: <ProjectOutlined style={{ color: collabClr }} />,
      label: '프로젝트',
      children: [
        {
          key: 'wbs-submenu',
          icon: <ApartmentOutlined style={{ color: collabClr }} />,
          label: 'WBS',
          children: wbsChildren,
        },
      ],
    },
  ];

  const adminItems = [
    { key: '/admin/users', icon: <UserOutlined style={{ color: GROUPS.admin.color }} />, label: '사용자 관리' },
  ];

  const handleMenuClick = ({ key }) => {
    if (key === 'wbs-new-project') {
      openProjectModal(null);
      return;
    }
    if (key === 'settings-submenu') return;
    // submenu 제목 클릭 시: 펼침과 동시에 대표 페이지로 이동(포커싱 일치)
    if (SUBMENU_LANDING[key]) {
      go(SUBMENU_LANDING[key]);
      return;
    }
    go(key);
  };

  // ── 섹션 카드 렌더 헬퍼
  const Section = ({ grp, title, menuItems }) => {
    const g = GROUPS[grp];
    return (
      <div
        style={{
          margin: '8px 10px',
          borderRadius: 14,
          padding: '2px 2px 6px',
          background: g.tint,
        }}
      >
        <div
          style={{
            padding: '10px 14px 4px',
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: g.color,
          }}
        >
          {title}
        </div>
        <ConfigProvider
          theme={{
            components: {
              Menu: {
                itemBg:           'transparent',
                subMenuItemBg:    'transparent',
                itemColor:        COLORS.itemText,
                itemHoverBg:      COLORS.itemHoverBg,
                itemHoverColor:   COLORS.itemHoverText,
                itemSelectedBg:   `${g.color}1f`,
                itemSelectedColor: g.color,
                fontSize:         15,
                iconSize:         17,
                itemMarginInline: 6,
                itemBorderRadius: 9,
                itemHeight:       42,
              },
            },
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[getSelected()]}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ background: 'transparent', borderRight: 'none' }}
          />
        </ConfigProvider>
      </div>
    );
  };

  // ── 사용자 카드 드롭다운 메뉴 (비밀번호 변경 · 관리자 기능 · 로그아웃)
  const userInitials = user?.displayName?.slice(0, 2) || 'U';
  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '내 프로필', onClick: () => setProfileOpen(true) },
    { key: 'password', icon: <LockOutlined />, label: '비밀번호 변경', onClick: () => setPasswordOpen(true) },
    ...(isAdmin
      ? [
          { type: 'divider' },
          {
            key: 'admin-label',
            label: (
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: COLORS.toggleText }}>
                관리자
              </span>
            ),
            disabled: true,
          },
          {
            key: 'settings-submenu',
            icon: <AppstoreOutlined />,
            label: '기준정보관리',
            children: [
              { key: '/admin/parts', icon: <AppstoreOutlined />, label: '파트 관리', onClick: () => go('/admin/parts') },
              { key: '/admin/recurring-tasks', icon: <ReloadOutlined />, label: '반복업무 관리', onClick: () => go('/admin/recurring-tasks') },
              { key: '/admin/tags', icon: <TagsOutlined />, label: '태그 관리', onClick: () => go('/admin/tags') },
              { key: '/admin/milestones', icon: <FlagOutlined />, label: '마일스톤 관리', onClick: () => go('/admin/milestones') },
              { key: '/admin/templates', icon: <FileTextOutlined />, label: '업무 템플릿 관리', onClick: () => go('/admin/templates') },
            ],
          },
          { key: '/admin/email-settings', icon: <MailOutlined />, label: '이메일 알림 설정', onClick: () => go('/admin/email-settings') },
          { key: '/admin/activity-log', icon: <HistoryOutlined />, label: '활동 로그', onClick: () => go('/admin/activity-log') },
          { key: '/admin/backup', icon: <DatabaseOutlined />, label: '백업/복원', onClick: () => go('/admin/backup') },
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '로그아웃', onClick: handleLogout },
  ];

  // ── 1차 아이콘 레일 항목 (그룹색)
  const railItems = [
    { key: '/', icon: <DashboardOutlined />, title: '대시보드', color: GROUPS.view.color },
    { key: '/tasks', icon: <CheckSquareOutlined />, title: '업무 관리', color: GROUPS.view.color },
    { key: '/memos', icon: <SnippetsOutlined />, title: '메모지', color: GROUPS.view.color },
    { key: '/chat', icon: <MessageOutlined />, title: '채팅', color: GROUPS.collab.color, dot: totalUnread > 0 },
    { key: '/boards', icon: <AppstoreOutlined />, title: '보드', color: GROUPS.collab.color, dot: boardUnread > 0 },
    { key: '/playbooks', icon: <BookOutlined />, title: 'Playbook', color: GROUPS.collab.color, dot: playbookUnread > 0 },
    { key: '/wbs', icon: <ProjectOutlined />, title: '프로젝트', color: GROUPS.collab.color },
  ];
  const railActive = (key) => (key === '/' ? pathname === '/' : pathname.startsWith(key));

  const RailIcon = ({ itemKey, icon, title, color, dot }) => {
    const active = railActive(itemKey);
    return (
      <Tooltip title={title} placement="right">
        <div
          onClick={() => go(itemKey)}
          style={{
            position: 'relative',
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 21,
            cursor: 'pointer',
            color: active ? '#fff' : 'rgba(255,255,255,0.5)',
            background: active ? color : 'transparent',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
        >
          {icon}
          {dot && (
            <span
              style={{
                position: 'absolute',
                top: 7,
                right: 7,
                width: 8,
                height: 8,
                borderRadius: 99,
                background: color,
                border: `2px solid ${RAIL_BG}`,
              }}
            />
          )}
        </div>
      </Tooltip>
    );
  };

  return (
    <>
      <div
        className="flowdesk-sider"
        style={{ height: '100vh', display: 'flex', flexShrink: 0 }}
      >
        {/* ── 1차 아이콘 레일 (다크) ── */}
        <div
          style={{
            width: RAIL_WIDTH,
            flexShrink: 0,
            background: RAIL_BG,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 0',
            gap: 3,
          }}
        >
          {railItems.map((it) => (
            <RailIcon key={it.key} itemKey={it.key} icon={it.icon} title={it.title} color={it.color} dot={it.dot} />
          ))}

          <div style={{ flex: 1 }} />

          {isAdmin && (
            <RailIcon itemKey="/admin/users" icon={<UserOutlined />} title="사용자 관리" color={GROUPS.admin.color} />
          )}

          {/* ── 사용자 메뉴 (프로필·비밀번호·관리자·로그아웃) ── */}
          <Dropdown menu={{ items: userMenuItems }} placement="topRight" trigger={['click']}>
            <Tooltip title={user?.displayName ? `${user.displayName} (@${user.username})` : '내 계정'} placement="right">
              <div style={{ marginTop: 8, cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                <Avatar
                  size={38}
                  style={{ backgroundColor: getAvatarColor(user?.id, user?.avatarColor), border: '2px solid rgba(255,255,255,0.15)' }}
                >
                  {userInitials}
                </Avatar>
              </div>
            </Tooltip>
          </Dropdown>
        </div>
      </div>

      {/* ── 내 프로필 / 비밀번호 변경 팝업 ── */}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />

      {/* ── 프로젝트 생성/수정 모달 ── */}
      <Modal
        title={editingProject ? '프로젝트 수정' : '새 프로젝트'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="프로젝트명" rules={[{ required: true, message: '필수 항목입니다.' }]}>
            <Input placeholder="프로젝트명을 입력하세요" />
          </Form.Item>
          <Form.Item name="period" label="프로젝트 기간">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="프로젝트 설명 (선택)" />
          </Form.Item>
          <Form.Item label="역할 담당자">
            <MemberEditor members={members} onChange={setMembers} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
