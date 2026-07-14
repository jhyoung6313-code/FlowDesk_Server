import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, List, Tag, Typography, Spin, Empty, Row, Col, Statistic, Space, Button, message,
} from 'antd';
import {
  CheckSquareOutlined, AuditOutlined, TeamOutlined, FlagOutlined,
  BellOutlined, MailOutlined, ReloadOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getMyToday } from '../../api/me';

const PRIORITY = { high: { color: 'red', label: '높음' }, normal: { color: 'blue', label: '보통' }, low: { color: 'default', label: '낮음' } };

function SummaryCard({ icon, label, value, color, onClick }) {
  return (
    <Card size="small" hoverable={!!onClick} onClick={onClick} styles={{ body: { padding: '12px 16px' } }} style={{ borderRadius: 10 }}>
      <Statistic title={<Space size={6}>{icon}{label}</Space>} value={value} valueStyle={{ color, fontSize: 22 }} />
    </Card>
  );
}

export default function MyDayPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    getMyToday()
      .then(setData)
      .catch(() => message.error('내 하루 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!data) return null;

  const c = data.counts;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          ☀️ 내 하루 <Typography.Text type="secondary" style={{ fontSize: 14 }}>{dayjs(data.date).format('YYYY-MM-DD (ddd)')}</Typography.Text>
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={load}>새로고침</Button>
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8} md={6}><SummaryCard icon={<CheckSquareOutlined />} label="내 업무" value={c.tasks} color="#1677ff" onClick={() => navigate('/tasks')} /></Col>
        <Col xs={12} sm={8} md={6}><SummaryCard icon={<ClockCircleOutlined />} label="지연" value={c.overdueTasks} color={c.overdueTasks ? '#f5222d' : '#8c8c8c'} onClick={() => navigate('/tasks')} /></Col>
        <Col xs={12} sm={8} md={6}><SummaryCard icon={<AuditOutlined />} label="결재 대기" value={c.approvals} color={c.approvals ? '#fa8c16' : '#8c8c8c'} onClick={() => navigate('/approvals')} /></Col>
        <Col xs={12} sm={8} md={6}><SummaryCard icon={<TeamOutlined />} label="오늘 회의" value={c.meetings} color="#722ed1" onClick={() => navigate('/meetings')} /></Col>
        <Col xs={12} sm={8} md={6}><SummaryCard icon={<FlagOutlined />} label="액션아이템" value={c.actionItems} color="#13c2c2" onClick={() => navigate('/meetings')} /></Col>
        <Col xs={12} sm={8} md={6}><SummaryCard icon={<BellOutlined />} label="안읽은 알림" value={c.unreadNotifications} color="#eb2f96" onClick={() => navigate('/notifications')} /></Col>
        <Col xs={12} sm={8} md={6}><SummaryCard icon={<MailOutlined />} label="안읽은 메일" value={c.unreadMail} color="#2f54eb" onClick={() => navigate('/mail')} /></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={<span><CheckSquareOutlined /> 내 업무</span>} size="small" style={{ borderRadius: 10 }}>
            {data.tasks.length ? (
              <List
                size="small" dataSource={data.tasks}
                renderItem={(t) => (
                  <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks?taskId=${t.id}`)}>
                    <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space size={6}>
                        <Tag color={PRIORITY[t.priority]?.color}>{PRIORITY[t.priority]?.label}</Tag>
                        <span>{t.title}</span>
                      </Space>
                      <Space size={6}>
                        {t.overdue && <Tag color="red">지연</Tag>}
                        {t.dueDate && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(t.dueDate).format('MM/DD')}</Typography.Text>}
                        <Tag>{t.statusLabel}</Tag>
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            ) : <Empty description="할 업무가 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title={<span><TeamOutlined /> 오늘 회의</span>} size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
            {data.meetings.length ? (
              <List
                size="small" dataSource={data.meetings}
                renderItem={(m) => (
                  <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(`/meetings?id=${m.id}`)}>
                    <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
                      <span>{m.title}</span>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(m.startAt).format('HH:mm')}{m.location ? ` · ${m.location}` : ''}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : <Empty description="오늘 예정된 회의가 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>

          <Card title={<span><FlagOutlined /> 내 액션아이템</span>} size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
            {data.actionItems.length ? (
              <List
                size="small" dataSource={data.actionItems}
                renderItem={(a) => (
                  <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(`/meetings?id=${a.meetingId}`)}>
                    <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
                      <span>{a.content}</span>
                      <Space size={6}>
                        {a.overdue && <Tag color="red">지연</Tag>}
                        {a.taskId && <Tag color="green">업무연결</Tag>}
                        {a.dueDate && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(a.dueDate).format('MM/DD')}</Typography.Text>}
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            ) : <Empty description="배정된 액션아이템이 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>

          <Card title={<span><AuditOutlined /> 결재 대기</span>} size="small" style={{ borderRadius: 10 }}>
            {data.approvals.length ? (
              <List
                size="small" dataSource={data.approvals}
                renderItem={(ap) => (
                  <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(`/approvals/${ap.id}`)}>
                    <Space size={8}>
                      {ap.docNo && <Tag>{ap.docNo}</Tag>}
                      <span>{ap.title}</span>
                    </Space>
                  </List.Item>
                )}
              />
            ) : <Empty description="결재할 문서가 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
