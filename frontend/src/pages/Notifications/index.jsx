import React, { useEffect } from 'react';
import {
  List, Button, Typography, Tag, Space, Empty, Badge, Row,
} from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import useNotificationStore from '../../store/notificationStore';
import { NOTIFICATION_LABELS } from '../../utils/colors';
import { calcDday, getDdayColor } from '../../utils/dday';

const NOTIFICATION_COLORS = {
  due_soon: 'warning',
  due_today: 'error',
  overdue: 'error',
};

export default function NotificationsPage() {
  const { notifications, unreadCount, fetch, markRead, markAllRead } = useNotificationStore();

  useEffect(() => {
    fetch();
  }, []);

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Space align="center">
          <Typography.Title level={4} style={{ margin: 0 }}>알림</Typography.Title>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ backgroundColor: '#ff4d4f' }} />
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
          image={<BellOutlined style={{ fontSize: 48, color: '#ccc' }} />}
          description="알림이 없습니다."
        />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(item) => (
            <List.Item
              style={{
                background: item.isRead ? '#fff' : '#e6f4ff',
                borderRadius: 6,
                marginBottom: 6,
                padding: '12px 16px',
                cursor: 'pointer',
                border: item.isRead ? '1px solid #f0f0f0' : '1px solid #91caff',
              }}
              onClick={() => !item.isRead && markRead(item.id)}
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
                  <BellOutlined
                    style={{
                      fontSize: 20,
                      color: item.type === 'overdue' ? '#ff4d4f'
                        : item.type === 'due_today' ? '#fa8c16'
                        : '#1677ff',
                      marginTop: 2,
                    }}
                  />
                }
                title={
                  <Space>
                    <span style={{ fontWeight: item.isRead ? 400 : 600 }}>
                      {item.task?.title}
                    </span>
                    <Tag color={NOTIFICATION_COLORS[item.type]}>
                      {NOTIFICATION_LABELS[item.type]}
                    </Tag>
                    {item.task?.dueDate && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: getDdayColor(item.task.dueDate),
                        }}
                      >
                        {calcDday(item.task.dueDate)}
                      </span>
                    )}
                  </Space>
                }
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    마감일: {item.task?.dueDate
                      ? dayjs(item.task.dueDate).format('YYYY년 MM월 DD일')
                      : '-'}
                    {' · '}
                    {dayjs(item.createdAt).format('MM/DD HH:mm')}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
