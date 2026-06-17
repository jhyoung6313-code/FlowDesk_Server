import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Space, Typography, Badge, Tooltip, Popover, Switch } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  BgColorsOutlined,
  CheckOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import useNotificationStore from '../../store/notificationStore';
import useThemeStore from '../../store/themeStore';
import useChatStore from '../../store/chatStore';
import { THEME_LIST } from '../../utils/themes';
import { openChatPopup as openChatPopupWindow } from '../../utils/chatPopup';

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
        background: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
      }}>
        <Space size={6}>
          {isDark ? <MoonOutlined style={{ color: '#818cf8' }} /> : <SunOutlined style={{ color: '#f59e0b' }} />}
          <Typography.Text style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.8)' : '#374151' }}>
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
        color: isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8',
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
                  : `2px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`,
                background: active
                  ? (isDark ? `rgba(${t.colors.accentRgb},0.12)` : `rgba(${t.colors.accentRgb},0.06)`)
                  : (isDark ? 'rgba(255,255,255,0.03)' : '#fafafa'),
                transition: 'all 0.18s',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.border = `2px solid ${t.colors.accentMid}44`;
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.border = `2px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`;
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : '#fafafa';
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
                    boxShadow: `0 0 0 1.5px rgba(0,0,0,0.1)`,
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
                  color: isDark ? 'rgba(255,255,255,0.85)' : '#1e293b',
                  lineHeight: 1.3,
                }}>
                  {t.name}
                </div>
                <div style={{
                  fontSize: 11,
                  color: isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8',
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

export default function AppHeader({ collapsed, onCollapse }) {
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const totalUnread = useChatStore((s) => s.totalUnread);
  const { isDark, themeKey, theme, setTheme, toggleDark } = useThemeStore();
  const [themeOpen, setThemeOpen] = useState(false);

  const openChatPopup = () => openChatPopupWindow();

  const c = theme.colors;

  const headerBg = isDark ? c.headerBgDark : c.headerBgLight;
  const headerBorder = isDark
    ? '1px solid rgba(255,255,255,0.05)'
    : '1px solid rgba(0,0,0,0.06)';

  const iconBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    cursor: 'pointer',
    background: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
    border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0',
    transition: 'background 0.2s',
    color: isDark ? '#9ca3af' : '#6b7280',
    fontSize: 16,
  };

  return (
    <Header
      style={{
        background: isDark ? headerBg : '#ffffff',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: isDark ? headerBorder : '1px solid #f1f5f9',
        height: 48,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: isDark ? '0 1px 12px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      <Space size={12} align="center">
        <div
          onClick={() => onCollapse(!collapsed)}
          style={{
            cursor: 'pointer',
            fontSize: 16,
            color: isDark ? '#6b7280' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
            borderRadius: 8,
            transition: 'color 0.2s, background 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = isDark ? c.accentLight : c.accentDark;
            e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : c.inputHoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = isDark ? '#6b7280' : '#9ca3af';
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
          overlayInnerStyle={{
            background: isDark ? '#1e1e2e' : '#ffffff',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            padding: '16px',
          }}
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

        {/* 알림 */}
        <Tooltip title="알림">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Badge count={unreadCount} size="small" offset={[-2, 2]}>
              <div
                onClick={() => navigate('/notifications')}
                style={iconBtnStyle}
              >
                <BellOutlined />
              </div>
            </Badge>
          </div>
        </Tooltip>

        {/* 채팅 */}
        <Tooltip title="채팅" placement="bottom">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Badge count={totalUnread} size="small" offset={[-2, 2]}>
              <div
                onClick={openChatPopup}
                style={{
                  ...iconBtnStyle,
                  background: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
                  border: isDark ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(34,197,94,0.25)',
                  color: '#22c55e',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)';
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
