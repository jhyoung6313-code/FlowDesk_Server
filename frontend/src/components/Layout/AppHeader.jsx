import React, { useState, useEffect } from 'react';
import { Layout, Space, Typography, Badge, Tooltip, Popover, Switch, List, Button, Empty, Tag } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  BgColorsOutlined,
  CheckOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useNotificationStore from '../../store/notificationStore';
import useThemeStore from '../../store/themeStore';
import useChatStore from '../../store/chatStore';
import { THEME_LIST } from '../../utils/themes';
import { openChatPopup as openChatPopupWindow } from '../../utils/chatPopup';
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
function ThemePicker({ themeKey, setTheme, isDark, toggleDark, onClose }) {
  return (
    <div style={{ width: 280, padding: '4px 0' }}>
      {/* 다크모드 토글 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '8px 10px',
        borderRadius: 10,
        background: 'var(--fd-icon-btn-bg)',
        border: '1px solid var(--fd-icon-btn-border)',
      }}>
        <Space size={6}>
          {isDark ? <MoonOutlined style={{ color: '#818cf8' }} /> : <SunOutlined style={{ color: '#f59e0b' }} />}
          <Typography.Text style={{ fontSize: 13 }}>
            {isDark ? '다크 모드' : '라이트 모드'}
          </Typography.Text>
        </Space>
        <Switch
          size="small"
          checked={isDark}
          onChange={toggleDark}
          checkedChildren={<MoonOutlined />}
          unCheckedChildren={<SunOutlined />}
        />
      </div>
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
  const { themeKey, theme, setTheme, isDark, toggleDark } = useThemeStore();
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const openChatPopup = () => openChatPopupWindow();

  const c = theme.colors;

  const iconBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    cursor: 'pointer',
    background: 'var(--fd-icon-btn-bg)',
    border: '1px solid var(--fd-icon-btn-border)',
    transition: 'background 0.2s',
    color: 'var(--fd-icon-btn-color)',
    fontSize: 16,
  };

  return (
    <Header
      style={{
        background: 'var(--fd-header-bg)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--fd-header-border)',
        height: 48,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Space size={12} align="center">
        <div
          onClick={() => onCollapse(!collapsed)}
          style={{
            cursor: 'pointer',
            fontSize: 16,
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
            borderRadius: 8,
            transition: 'color 0.2s, background 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = c.accentDark;
            e.currentTarget.style.background = c.inputHoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9ca3af';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>
        <Space size={6} align="center" style={{ cursor: 'default' }}>
          <FlowdeskIcon size={18} color={c.accentMid} />
          <Typography.Text strong style={{ fontSize: 14, color: c.accentMid, letterSpacing: 0.3 }}>
            Flowdesk
          </Typography.Text>
        </Space>
      </Space>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 테마 피커 */}
        <Popover
          open={themeOpen}
          onOpenChange={setThemeOpen}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          overlayStyle={{ zIndex: 1050 }}
          styles={{ body: {
            background: 'var(--fd-popover-bg)',
            border: '1px solid var(--fd-popover-border)',
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            padding: '16px',
          }}}
          content={
            <ThemePicker
              themeKey={themeKey}
              setTheme={setTheme}
              isDark={isDark}
              toggleDark={toggleDark}
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
            background: 'var(--fd-popover-bg)',
            border: '1px solid var(--fd-popover-border)',
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
