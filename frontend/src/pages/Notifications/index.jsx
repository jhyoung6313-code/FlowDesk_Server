import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  List, Button, Typography, Tag, Space, Empty, Badge, Row, Avatar, theme as antTheme,
} from 'antd';
import {
  BellOutlined, CheckOutlined, ClockCircleOutlined, WarningOutlined,
  SafetyCertificateOutlined, MessageOutlined, CalendarOutlined, FileDoneOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useNotificationStore from '../../store/notificationStore';
import { NOTIFICATION_LABELS } from '../../utils/colors';
import { calcDday, getDdayColor } from '../../utils/dday';

const { Text } = Typography;
const { useToken } = antTheme;

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
  schedule_shared: 'cyan',
};

/* 유형 → 아이콘 + 색(hex) : 원형 아이콘 아바타에 사용 */
const TYPE_ICON = {
  due_soon:        { icon: <ClockCircleOutlined />,        color: '#d97706' },
  due_today:       { icon: <ClockCircleOutlined />,        color: '#ea580c' },
  overdue:         { icon: <WarningOutlined />,            color: '#dc2626' },
  sla_warning:     { icon: <WarningOutlined />,            color: '#d97706' },
  sla_breach:      { icon: <WarningOutlined />,            color: '#dc2626' },
  step_assigned:   { icon: <FileDoneOutlined />,           color: '#2563eb' },
  step_reminder:   { icon: <FileDoneOutlined />,           color: '#7c3aed' },
  security_alert:  { icon: <SafetyCertificateOutlined />,  color: '#dc2626' },
  mention:         { icon: <MessageOutlined />,            color: '#db2777' },
  schedule_shared: { icon: <CalendarOutlined />,           color: '#0891b2' },
};

/* hex → rgba (아이콘 배경 틴트) */
function tint(hex, a = 0.12) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export default function NotificationsPage() {
  const { notifications, unreadCount, fetch, markRead, markAllRead } = useNotificationStore();
  const navigate = useNavigate();
  const { token } = useToken();

  useEffect(() => {
    fetch();
  }, []);

  const handleClick = (item) => {
    if (!item.isRead) markRead(item.id);
    if (item.link) navigate(item.link);
    else if (item.task?.id) navigate(`/tasks?taskId=${item.task.id}`);
  };

  return (
    <div>
      <Row align="middle" justify="space-between" className="fd-toolbar" style={{ marginBottom: 16 }}>
        <Space align="center">
          <Typography.Title level={4} style={{ margin: 0 }}>알림</Typography.Title>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ backgroundColor: token.colorError }} />
          )}
        </Space>
        {unreadCount > 0 && (
          <Button icon={<CheckOutlined />} onClick={markAllRead} size="small">
            전체 읽음
          </Button>
        )}
      </Row>

      {notifications.length === 0 ? (
        <Empty
          image={<BellOutlined style={{ fontSize: 48, color: token.colorTextQuaternary }} />}
          description="알림이 없습니다."
        />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(item) => {
            const t = TYPE_ICON[item.type] || { icon: <BellOutlined />, color: token.colorPrimary };
            return (
              <List.Item
                style={{
                  background: item.isRead ? token.colorBgContainer : token.colorPrimaryBg,
                  borderRadius: 10,
                  marginBottom: 8,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  border: `1px solid ${item.isRead ? token.colorBorderSecondary : token.colorPrimaryBorder}`,
                  transition: 'background 0.12s, border-color 0.12s',
                }}
                onClick={() => handleClick(item)}
                actions={[
                  !item.isRead && (
                    <Button
                      type="text"
                      size="small"
                      icon={<CheckOutlined />}
                      onClick={(e) => { e.stopPropagation(); markRead(item.id); }}
                    >
                      읽음
                    </Button>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar
                      shape="circle"
                      size={38}
                      style={{ background: tint(t.color), color: t.color, fontSize: 18 }}
                      icon={t.icon}
                    />
                  }
                  title={
                    <Space size={8} wrap>
                      <span style={{ fontWeight: item.isRead ? 400 : 700, color: token.colorText }}>
                        {item.task?.title || item.message || NOTIFICATION_LABELS[item.type] || item.type}
                      </span>
                      <Tag color={NOTIFICATION_COLORS[item.type]} style={{ margin: 0 }}>
                        {NOTIFICATION_LABELS[item.type]}
                      </Tag>
                      {item.task?.dueDate && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: getDdayColor(item.task.dueDate) }}>
                          {calcDday(item.task.dueDate)}
                        </span>
                      )}
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {item.task?.dueDate
                        ? `마감일: ${dayjs(item.task.dueDate).format('YYYY년 MM월 DD일')} · `
                        : ''}
                      {dayjs(item.createdAt).format('MM/DD HH:mm')}
                    </Text>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
