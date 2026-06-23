import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Space, Typography, Badge, Tooltip, Popover, List, Button, Empty, Tag } from 'antd';
import {
  BellOutlined,
  BgColorsOutlined,
  CheckOutlined,
  UnorderedListOutlined,
  MessageOutlined,
  AppstoreOutlined,
  BookOutlined,
  ApartmentOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useNotificationStore from '../../store/notificationStore';
import useThemeStore from '../../store/themeStore';
import useChatStore from '../../store/chatStore';
import useUnreadStore from '../../store/unreadStore';
import { THEME_LIST } from '../../utils/themes';
import { openChatPopup as openChatPopupWindow } from '../../utils/chatPopup';
import { NOTIFICATION_LABELS } from '../../utils/colors';
import { calcDday, getDdayColor } from '../../utils/dday';
import MemoWidget from '../Memo/MemoWidget';

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

function ChatBubbleIcon({ size = 17, color = '#22c55e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <path
        d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
        fill={color}
      />
      <circle cx="8"  cy="12" r="1.4" fill="white" />
      <circle cx="12" cy="12" r="1.4" fill="white" />
      <circle cx="16" cy="12" r="1.4" fill="white" />
    </svg>
  );
}

/* ── 테마 피커 팝오버 내용 ── */
function ThemePicker({ themeKey, setTheme, onClose }) {
  return (
    <div style={{ width: 280, padding: '4px 0' }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: '#94a3b8',
        letterSpacing: '0.6px',
        textTransform: 'uppercase',
        marginBottom: 12,
        padding: '0 2px',
      }}>
        테마 선택
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}>
        {THEME_LIST.map((t) => {
          const active = themeKey === t.key;
          return (
            <div
              key={t.key}
              onClick={() => { setTheme(t.key); onClose(); }}
              style={{
                borderRadius: 12,
                padding: '10px 12px',
                cursor: 'pointer',
                border: active
                  ? `2px solid ${t.colors.accentMid}`
                  : '2px solid #e2e8f0',
                background: active
                  ? `rgba(${t.colors.accentRgb},0.06)`
                  : '#fafafa',
                transition: 'all 0.18s',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.border = `2px solid ${t.colors.accentMid}44`;
                  e.currentTarget.style.background = '#f1f5f9';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.border = '2px solid #e2e8f0';
                  e.currentTarget.style.background = '#fafafa';
                }
              }}
            >
              {/* 컬러 스와치 */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {t.swatches.map((c, i) => (
                  <div key={i} style={{
                    width: i === 0 ? 18 : 14,
                    height: i === 0 ? 18 : 14,
                    borderRadius: '50%',
                    background: c,
                    boxShadow: '0 0 0 1.5px rgba(0,0,0,0.1)',
                  }} />
                ))}
                {active && (
                  <CheckOutlined style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    color: t.colors.accentMid,
                    fontWeight: 700,
                  }} />
                )}
              </div>
              {/* 이름 */}
              <div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#1e293b',
                  lineHeight: 1.3,
                }}>
                  {t.name}
                </div>
                <div style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  marginTop: 1,
                }}>
                  {t.desc}
                </div>
              </div>
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
};

function NotificationPopup({ onClose }) {
  const { notifications, unreadCount, fetch, markRead, markAllRead } = useNotificationStore();

  useEffect(() => { fetch(); }, []);

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
                onClick={() => markRead(item.id)}
              >
                <List.Item.Meta
                  avatar={
                    <BellOutlined style={{
                      fontSize: 18,
                      color: item.type === 'overdue' || item.type === 'due_today' ? '#ff4d4f' : '#1677ff',
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
  const { themeKey, theme, setTheme } = useThemeStore();
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const navigate = useNavigate();
  const { pathname } = useLocation();

  const openChatPopup = () => openChatPopupWindow();

  const c = theme.colors;

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

  // 세그먼트 항목 스타일 (활성 = 흰 카드 + 그림자)
  const linkStyle = (active) => ({
    padding: '5px 12px',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? c.accentMid : '#64748b',
    background: active ? '#ffffff' : 'transparent',
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
    if (!active) { e.currentTarget.style.color = '#334155'; e.currentTarget.style.background = 'rgba(255,255,255,0.65)'; }
  };
  const linkLeave = (active) => (e) => {
    if (!active) { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }
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
      background: '#f1f5f9',
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
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    transition: 'background 0.2s',
    color: '#6b7280',
    fontSize: 16,
  };

  return (
    <Header
      style={{
        background: '#ffffff',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f1f5f9',
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
          <FlowdeskIcon size={18} color={c.accentMid} />
          <Typography.Text strong style={{ fontSize: 14, color: c.accentMid, letterSpacing: 0.3 }}>
            Flowdesk
          </Typography.Text>
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
        </div>
      </Space>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 메모지 플로팅 위젯 (어느 화면에서든 빠른 메모) */}
        <MemoWidget />

        {/* 테마 피커 */}
        <Popover
          open={themeOpen}
          onOpenChange={setThemeOpen}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          overlayStyle={{ zIndex: 1050 }}
          styles={{ body: {
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            padding: '16px',
          }}}
          content={
            <ThemePicker
              themeKey={themeKey}
              setTheme={setTheme}
              onClose={() => setThemeOpen(false)}
            />
          }
        >
          <Tooltip title="테마 변경" placement="bottom">
            <div style={iconBtnStyle}>
              <BgColorsOutlined />
            </div>
          </Tooltip>
        </Popover>

        {/* 알림 팝업 */}
        <Popover
          open={notifOpen}
          onOpenChange={setNotifOpen}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          overlayStyle={{ zIndex: 1050 }}
          styles={{ body: {
            background: '#ffffff',
            border: '1px solid #e2e8f0',
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

        {/* 채팅 */}
        <Tooltip title="채팅" placement="bottom">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Badge count={totalUnread} size="small" offset={[-2, 2]}>
              <div
                onClick={openChatPopup}
                style={{
                  ...iconBtnStyle,
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  color: '#22c55e',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(34,197,94,0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(34,197,94,0.1)';
                }}
              >
                <ChatBubbleIcon size={17} color="#22c55e" />
              </div>
            </Badge>
          </div>
        </Tooltip>
      </div>
    </Header>
  );
}
