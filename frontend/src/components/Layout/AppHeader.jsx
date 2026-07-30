import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Space, Typography, Badge, Tooltip, Popover, List, Button, Empty, Tag } from 'antd';
import {
  BellOutlined,
  BgColorsOutlined,
  SearchOutlined,
  CheckOutlined,
  UnorderedListOutlined,
  MessageOutlined,
  AppstoreOutlined,
  BookOutlined,
  ApartmentOutlined,
  SnippetsOutlined,
  BulbOutlined,
  BulbFilled,
  ReadOutlined,
  FileDoneOutlined,
  MailOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { getApprovalPendingCount } from '../../api/approval';
import { getUnreadCount as getMailUnreadCount } from '../../api/mail';
import useAuthStore from '../../store/authStore';
import dayjs from 'dayjs';
import useNotificationStore from '../../store/notificationStore';
import useThemeStore from '../../store/themeStore';
import useChatStore from '../../store/chatStore';
import useUnreadStore from '../../store/unreadStore';
import { SKIN_LIST } from '../../utils/skins';
import { NOTIFICATION_LABELS } from '../../utils/colors';
import { calcDday, getDdayColor } from '../../utils/dday';

const { Header } = Layout;

function FlowdeskIcon({ size = 20, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 11 Q7.5 5 12 11 Q16.5 17 21 11" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M18.5 8.5 L21.5 11 L18.5 13.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="2" y="19" width="24" height="3.5" rx="1.75" fill={color} />
      <rect x="11.5" y="15.5" width="5" height="4.5" rx="1" fill={color} opacity="0.55" />
    </svg>
  );
}

/* ── 테마 피커 팝오버 내용 ── */
/* 스킨(형태) 미리보기 미니 썸네일 */
const SKIN_PREVIEW = {
  default: { radius: 8,  border: '1px solid #e2e0da', shadow: '0 2px 5px rgba(0,0,0,0.10)', bg: '#ffffff' },
  brutal:  { radius: 7,  border: '2px solid #111',     shadow: '3px 3px 0 #111',            bg: '#ffde59' },
  clay:    { radius: 13, border: 'none',               shadow: '0 5px 12px rgba(90,90,130,.25)', bg: '#ffffff' },
  mono:    { radius: 0,  border: '1.5px solid #111',   shadow: 'none',                      bg: '#ffffff' },
  glass:   { radius: 11, border: '1px solid rgba(120,92,255,.3)', shadow: '0 6px 16px rgba(90,70,180,.25)', bg: 'linear-gradient(135deg,#c9bcff,#ffc2e0)' },
  pop:     { radius: 12, border: 'none',               shadow: '0 4px 0 #d8cfff',           bg: '#7c5cff' },
  slick:   { radius: 7,  border: '1px solid #2a2d38',  shadow: 'none',                      bg: '#12131a' },
  paper:   { radius: 6,  border: '1px solid #e2d8c4',  shadow: 'none',                      bg: '#fbf7ee' },
};

function ThemePicker({ isDark, toggleDark, density, setDensity, skin, setSkin, onClose }) {
  return (
    <div style={{ width: 280, padding: '4px 0' }}>
      {/* ── 라이트/다크 모드 토글 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
        padding: 4,
        background: '#f1f5f9',
        borderRadius: 12,
        marginBottom: 16,
      }}>
        {[
          { key: 'light', label: '라이트', icon: <BulbOutlined />, active: !isDark },
          { key: 'dark',  label: '다크',   icon: <BulbFilled />,   active: isDark },
        ].map((m) => (
          <div
            key={m.key}
            onClick={() => { if (!m.active) toggleDark(); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 0',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: m.active ? 700 : 500,
              cursor: 'pointer',
              background: m.active ? '#ffffff' : 'transparent',
              color: m.active ? '#1e293b' : '#64748b',
              boxShadow: m.active ? '0 1px 4px rgba(15,23,42,0.10)' : 'none',
              transition: 'all 0.14s',
            }}
          >
            {m.icon}{m.label}
          </div>
        ))}
      </div>

      {/* ── 디자인 스킨 (형태 + 강조색) ── */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.6px',
        textTransform: 'uppercase', marginBottom: 12, padding: '0 2px',
      }}>
        디자인 스킨
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SKIN_LIST.map((s) => {
          const on = skin === s.key;
          const pv = SKIN_PREVIEW[s.key] || SKIN_PREVIEW.default;
          return (
            <div
              key={s.key}
              onClick={() => setSkin(s.key)}
              style={{
                borderRadius: 12, padding: '11px 12px', cursor: 'pointer',
                border: on ? '2px solid var(--fd-accent-mid, #3b82f6)' : '2px solid #e2e8f0',
                background: on ? 'rgba(var(--fd-accent-rgb,59,130,246),0.06)' : '#fafafa',
                transition: 'all 0.18s', display: 'flex', flexDirection: 'column', gap: 9,
              }}
            >
              {/* 미니 카드 미리보기 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 34, height: 24, flexShrink: 0,
                  borderRadius: pv.radius, border: pv.border, boxShadow: pv.shadow, background: pv.bg,
                }} />
                {on && <CheckOutlined style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fd-accent-mid,#3b82f6)' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{s.name}</div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 화면 밀도 ── */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.6px',
        textTransform: 'uppercase', margin: '18px 0 10px', padding: '0 2px',
      }}>
        화면 밀도
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
        padding: 4, background: '#f1f5f9', borderRadius: 12,
      }}>
        {[
          { key: 'default', label: '넉넉하게' },
          { key: 'compact', label: '조밀하게' },
        ].map((d) => {
          const on = density === d.key;
          return (
            <div
              key={d.key}
              onClick={() => setDensity(d.key)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '7px 0', borderRadius: 9, fontSize: 13,
                fontWeight: on ? 700 : 500, cursor: 'pointer',
                background: on ? '#ffffff' : 'transparent',
                color: on ? '#1e293b' : '#64748b',
                boxShadow: on ? '0 1px 4px rgba(15,23,42,0.10)' : 'none',
                transition: 'all 0.14s',
              }}
            >
              {d.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const NOTIFICATION_COLORS = {
  due_soon: 'warning',
  due_today: 'error',
  overdue: 'error',
  sla_warning: 'warning',
  sla_breach: 'error',
  step_assigned: 'processing',
  step_reminder: 'purple',
  security_alert: 'error',
  mention: 'magenta',
};

function NotificationPopup({ onClose }) {
  const { notifications, unreadCount, fetch, markRead, markAllRead } = useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => { fetch(); }, []);

  const handleClick = (item) => {
    markRead(item.id);
    if (item.link) navigate(item.link);
    else if (item.task?.id) navigate(`/tasks?taskId=${item.task.id}`);
    onClose();
  };

  return (
    <div style={{ width: 360 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingBottom: 10,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <Space align="center">
          <Typography.Text strong style={{ fontSize: 14 }}>알림</Typography.Text>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ backgroundColor: '#ff4d4f' }} />
          )}
        </Space>
        {unreadCount > 0 && (
          <Button
            icon={<CheckOutlined />}
            size="small"
            type="text"
            onClick={() => { markAllRead(); onClose(); }}
          >
            전체 읽음
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Empty
          image={<BellOutlined style={{ fontSize: 36, color: '#ccc' }} />}
          description="새 알림이 없습니다."
          style={{ padding: '24px 0' }}
        />
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', marginRight: -4, paddingRight: 4 }}>
          <List
            dataSource={notifications}
            renderItem={(item) => (
              <List.Item
                style={{
                  background: '#e6f4ff',
                  borderRadius: 8,
                  marginBottom: 6,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  border: '1px solid #91caff',
                }}
                onClick={() => handleClick(item)}
              >
                <List.Item.Meta
                  avatar={
                    <BellOutlined style={{
                      fontSize: 18,
                      color: item.type === 'overdue' || item.type === 'due_today' ? '#ff4d4f'
                        : item.type === 'mention' ? '#eb2f96' : '#1677ff',
                      marginTop: 2,
                    }} />
                  }
                  title={
                    <Space size={4} wrap>
                      <Typography.Text strong style={{ fontSize: 12 }}>
                        {item.task?.title || item.message || NOTIFICATION_LABELS[item.type] || item.type}
                      </Typography.Text>
                      <Tag color={NOTIFICATION_COLORS[item.type]} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                        {NOTIFICATION_LABELS[item.type]}
                      </Tag>
                      {item.task?.dueDate && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: getDdayColor(item.task.dueDate) }}>
                          {calcDday(item.task.dueDate)}
                        </span>
                      )}
                    </Space>
                  }
                  description={
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {item.task?.dueDate ? `마감: ${dayjs(item.task.dueDate).format('MM/DD')} · ` : ''}
                      {dayjs(item.createdAt).format('MM/DD HH:mm')}
                    </Typography.Text>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}
    </div>
  );
}

export default function AppHeader({ collapsed, onCollapse }) {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const totalUnread = useChatStore((s) => s.totalUnread);
  const boardUnread = useUnreadStore((s) => s.boardUnread);
  const playbookUnread = useUnreadStore((s) => s.playbookUnread);
  const theme = useThemeStore((s) => s.theme);
  const isDark = useThemeStore((s) => s.isDark);
  const toggleDark = useThemeStore((s) => s.toggleDark);
  const density = useThemeStore((s) => s.density);
  const setDensity = useThemeStore((s) => s.setDensity);
  const skin = useThemeStore((s) => s.skin);
  const setSkin = useThemeStore((s) => s.setSkin);
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [approvalPending, setApprovalPending] = useState(0);
  const [mailUnread, setMailUnread] = useState(0);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user) return;
    const fetchApproval = () => getApprovalPendingCount().then(r => setApprovalPending(r.count || 0)).catch(() => {});
    const fetchMail = () => getMailUnreadCount().then(r => setMailUnread(r.count || 0)).catch(() => {});
    fetchApproval();
    fetchMail();
    const timer = setInterval(() => { fetchApproval(); fetchMail(); }, 60000);
    return () => clearInterval(timer);
  }, [user]);

  const navigate = useNavigate();
  const { pathname } = useLocation();

  const c = theme.colors;

  // ── 라이트/다크 표면 팔레트 (셸 전용) ──
  // 라이트: Notion Warm 뉴트럴 셸 — 흰 헤더 + 웜 그레이 트랙/테두리 (강조색은 활성 상태에만)
  const surf = {
    headerBg:     isDark ? '#141414' : '#ffffff',
    headerBorder: isDark ? '#303030' : '#e9e7e2',
    track:        isDark ? 'rgba(255,255,255,0.06)' : '#f3f2ee',
    linkText:     isDark ? 'rgba(255,255,255,0.72)' : '#6b6459',
    linkHover:    isDark ? 'rgba(255,255,255,0.95)' : '#37352f',
    linkHoverBg:  isDark ? 'rgba(255,255,255,0.08)' : '#efeee9',
    linkActiveBg: isDark ? '#1f1f1f' : '#ffffff',
    iconBg:       isDark ? '#1f1f1f' : '#f3f2ee',
    iconBorder:   isDark ? '#303030' : '#e5e2db',
    iconColor:    isDark ? 'rgba(255,255,255,0.65)' : '#6b6459',
    popBg:        isDark ? '#1f1f1f' : '#ffffff',
    popBorder:    isDark ? '#303030' : '#e9e7e2',
  };

  // ── 상단 2줄 그룹 메뉴 (워크스페이스 / 협업기능) ──
  // 업무관리: 칸반·캘린더·간트는 업무관리 페이지 내부 탭이므로 상단은 '업무관리' 하나
  const workspaceActive =
    pathname.startsWith('/tasks') || pathname.startsWith('/calendar') || pathname.startsWith('/gantt');

  // 협업기능 링크 (미읽음 배지)
  const collabLinks = [
    { key: 'chat',      icon: <MessageOutlined />,   label: '채팅',     path: '/chat',      active: pathname.startsWith('/chat'),     badge: totalUnread },
    { key: 'boards',    icon: <AppstoreOutlined />,  label: '보드',     path: '/boards',    active: pathname.startsWith('/boards'),   badge: boardUnread },
    { key: 'playbooks', icon: <BookOutlined />,      label: '플레이북', path: '/playbooks', active: pathname.startsWith('/playbooks') || pathname.startsWith('/runs'), badge: playbookUnread },
    { key: 'wbs',       icon: <ApartmentOutlined />, label: '프로젝트', path: '/wbs',       active: pathname.startsWith('/wbs'),      badge: 0 },
  ];

  const bizLinks = [
    { key: 'mail',      icon: <MailOutlined />,       label: '메일',     path: '/mail',      active: pathname.startsWith('/mail'),     badge: mailUnread },
    { key: 'bbs',       icon: <ReadOutlined />,       label: '게시판',   path: '/bbs',       active: pathname.startsWith('/bbs'),      badge: 0 },
    { key: 'approvals', icon: <FileDoneOutlined />,   label: '전자결재', path: '/approvals', active: pathname.startsWith('/approvals'), badge: approvalPending },
  ];

  // 세그먼트 항목 스타일 (활성 = 흰 카드 + 그림자)
  const linkStyle = (active) => ({
    padding: '5px 12px',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? c.accentMid : surf.linkText,
    background: active ? surf.linkActiveBg : 'transparent',
    borderRadius: 8,
    boxShadow: active ? '0 1px 4px rgba(15,23,42,0.10)' : 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.14s',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  });
  const linkEnter = (active) => (e) => {
    if (!active) { e.currentTarget.style.color = surf.linkHover; e.currentTarget.style.background = surf.linkHoverBg; }
  };
  const linkLeave = (active) => (e) => {
    if (!active) { e.currentTarget.style.color = surf.linkText; e.currentTarget.style.background = 'transparent'; }
  };

  const renderLink = ({ key, icon, label, path, active, badge = 0 }) => (
    <div
      key={key || path}
      onClick={() => navigate(path)}
      style={linkStyle(active)}
      onMouseEnter={linkEnter(active)}
      onMouseLeave={linkLeave(active)}
    >
      {icon}
      {label}
      {badge > 0 && (
        <Badge count={badge} size="small" style={{ backgroundColor: '#ef4444', boxShadow: 'none' }} />
      )}
    </div>
  );

  // 대분류 세그먼트 트랙 (라벨 캡션 없이 트랙만)
  const GroupColumn = ({ children }) => (
    <div style={{
      display: 'flex',
      gap: 2,
      background: surf.track,
      borderRadius: 11,
      padding: 3,
    }}>
      {children}
    </div>
  );

  const iconBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    cursor: 'pointer',
    background: surf.iconBg,
    border: `1px solid ${surf.iconBorder}`,
    transition: 'background 0.2s',
    color: surf.iconColor,
    fontSize: 16,
  };

  return (
    <Header
      style={{
        background: surf.headerBg,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${surf.headerBorder}`,
        height: 52,
        lineHeight: 'normal',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Space size={12} align="center">
        <Space
          size={6}
          align="center"
          style={{ cursor: 'pointer', marginRight: 8 }}
          onClick={() => navigate('/')}
        >
          <FlowdeskIcon size={18} color={c.logoIcon} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.3,
              lineHeight: 1,
              display: 'inline-block',
              // 폴백: 클립 미지원 시 투명 박스 대신 테마색 글자로 보이도록
              color: c.logoColorA,
              // background(단축) 대신 backgroundImage(longhand) 사용 — 테마 변경 시
              // background-clip:text 가 border-box 로 리셋되어 박스가 생기는 문제 방지
              backgroundImage: `linear-gradient(90deg, ${c.logoColorA}, ${c.logoColorB})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Flowdesk
          </span>
        </Space>

        {/* ── 상단 그룹 메뉴 (세그먼트 트랙) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 워크스페이스 */}
          <GroupColumn>
            {renderLink({ key: 'tasks', icon: <UnorderedListOutlined />, label: '업무관리', path: '/tasks', active: workspaceActive })}
            {renderLink({ key: 'memos', icon: <SnippetsOutlined />, label: '메모지', path: '/memos', active: pathname.startsWith('/memos') })}
          </GroupColumn>

          {/* 협업기능 */}
          <GroupColumn>
            {collabLinks.map(renderLink)}
          </GroupColumn>

          {/* 게시판 · 전자결재 */}
          <GroupColumn>
            {bizLinks.map(renderLink)}
          </GroupColumn>
        </div>
      </Space>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 전역 통합 검색 (Ctrl+F) */}
        <Tooltip title="통합 검색 (Ctrl+F)" placement="bottom">
          <div
            onClick={() => window.dispatchEvent(new CustomEvent('flowdesk:open-search'))}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
              background: surf.iconBg, border: `1px solid ${surf.iconBorder}`,
              color: surf.iconColor, fontSize: 13,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = surf.linkHoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = surf.iconBg; }}
          >
            <SearchOutlined />
            <span style={{ fontSize: 12 }}>검색</span>
            <kbd style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 4,
              border: `1px solid ${surf.iconBorder}`, background: surf.track, color: surf.iconColor,
            }}>Ctrl F</kbd>
          </div>
        </Tooltip>

        {/* 알림 팝업 */}
        <Popover
          open={notifOpen}
          onOpenChange={setNotifOpen}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          overlayStyle={{ zIndex: 1050 }}
          styles={{ body: {
            background: surf.popBg,
            border: `1px solid ${surf.popBorder}`,
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            padding: '16px',
          }}}
          content={
            <NotificationPopup onClose={() => setNotifOpen(false)} />
          }
        >
          <Tooltip title="알림" placement="bottom">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <div style={iconBtnStyle}>
                  <BellOutlined />
                </div>
              </Badge>
            </div>
          </Tooltip>
        </Popover>

        {/* 테마 · 모드 피커 (라이트/다크 토글 통합) */}
        <Popover
          open={themeOpen}
          onOpenChange={setThemeOpen}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          overlayStyle={{ zIndex: 1050 }}
          styles={{ body: {
            background: surf.popBg,
            border: `1px solid ${surf.popBorder}`,
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            padding: '16px',
          }}}
          content={
            <ThemePicker
              isDark={isDark}
              toggleDark={toggleDark}
              density={density}
              setDensity={setDensity}
              skin={skin}
              setSkin={setSkin}
              onClose={() => setThemeOpen(false)}
            />
          }
        >
          <Tooltip title="테마 · 화면 모드" placement="bottom">
            <div style={iconBtnStyle}>
              <BgColorsOutlined />
            </div>
          </Tooltip>
        </Popover>

        {/* 관리자 콘솔 (관리자 전용) */}
        {isAdmin && (
          <Tooltip title="관리자 콘솔" placement="bottom">
            <div
              onClick={() => navigate('/admin')}
              style={{
                ...iconBtnStyle,
                width: 'auto',
                padding: '0 12px',
                gap: 6,
                color: pathname.startsWith('/admin') ? c.accentMid : surf.iconColor,
                fontSize: 13,
                fontWeight: 600,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = surf.linkHoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = surf.iconBg; }}
            >
              <SettingOutlined style={{ fontSize: 16 }} />
              <span>관리자</span>
            </div>
          </Tooltip>
        )}

      </div>
    </Header>
  );
}
