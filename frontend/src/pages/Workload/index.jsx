import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Card, Row, Col, Avatar, Progress, Tag, Spin, Empty, Tooltip, Space, Segmented,
} from 'antd';
import { TeamOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons';
import { getWorkload } from '../../api/workload';
import { getAvatarColor } from '../../utils/colors';

const LEVEL_META = {
  overload: { color: '#ff4d4f', label: '과부하', bg: 'rgba(255,77,79,0.08)' },
  warning:  { color: '#fa8c16', label: '주의',   bg: 'rgba(250,140,22,0.08)' },
  normal:   { color: '#52c41a', label: '적정',   bg: 'transparent' },
  idle:     { color: '#94a3b8', label: '여유',   bg: 'transparent' },
};

export default function WorkloadPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('부하순');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    getWorkload()
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin /></div>;
  if (!data) return <Empty description="데이터를 불러올 수 없습니다." />;

  const { thresholds, users } = data;
  const maxTotal = Math.max(thresholds.overload, ...users.map((u) => u.counts.total), 1);

  const sorted = [...users].sort((a, b) =>
    sort === '부하순' ? b.counts.total - a.counts.total : a.displayName.localeCompare(b.displayName),
  );

  const overloaded = users.filter((u) => u.level === 'overload');
  const idle = users.filter((u) => u.level === 'idle');

  return (
    <div>
      <Row align="middle" justify="space-between" className="fd-toolbar" style={{ marginBottom: 16 }}>
        <Space align="center">
          <TeamOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Typography.Title level={4} style={{ margin: 0 }}>워크로드 밸런싱</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            진행 중 업무 기준 · 주의 {thresholds.warning}건 / 과부하 {thresholds.overload}건
          </Typography.Text>
        </Space>
        <Space>
          <Segmented options={['부하순', '이름순']} value={sort} onChange={setSort} size="small" />
          <Tooltip title="새로고침">
            <ReloadOutlined onClick={load} style={{ cursor: 'pointer', color: '#64748b' }} />
          </Tooltip>
        </Space>
      </Row>

      {/* 요약 배너 */}
      {(overloaded.length > 0 || idle.length > 0) && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
          <Space size={24} wrap>
            <span>
              <WarningOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />
              과부하 멤버 <b style={{ color: '#ff4d4f' }}>{overloaded.length}명</b>
              {overloaded.length > 0 && (
                <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                  {overloaded.map((u) => u.displayName).join(', ')}
                </Typography.Text>
              )}
            </span>
            <span>
              여유 멤버 <b style={{ color: '#52c41a' }}>{idle.length}명</b>
              {idle.length > 0 && (
                <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                  업무 배정 추천: {idle.map((u) => u.displayName).join(', ')}
                </Typography.Text>
              )}
            </span>
          </Space>
        </Card>
      )}

      <Row gutter={[12, 12]}>
        {sorted.map((u) => {
          const meta = LEVEL_META[u.level];
          const pct = Math.round((u.counts.total / maxTotal) * 100);
          return (
            <Col xs={24} sm={12} lg={8} key={u.id}>
              <Card
                size="small"
                hoverable
                onClick={() => navigate(`/tasks?assignee=${u.id}`)}
                style={{ borderRadius: 12, background: meta.bg, borderColor: u.level === 'overload' ? meta.color : undefined }}
              >
                <Space align="center" style={{ marginBottom: 10 }}>
                  <Avatar size={36} style={{ background: getAvatarColor(u.id, u.avatarColor) }}>
                    {u.displayName?.slice(0, 1)}
                  </Avatar>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{u.displayName}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {[u.department?.name, u.team?.name, u.position].filter(Boolean).join(' · ') || u.username}
                    </div>
                  </div>
                  <Tag color={meta.color} style={{ marginLeft: 'auto' }}>{meta.label}</Tag>
                </Space>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: meta.color }}>{u.counts.total}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>건 진행 중</span>
                </div>
                <Progress
                  percent={pct}
                  showInfo={false}
                  strokeColor={meta.color}
                  size="small"
                  style={{ marginBottom: 8 }}
                />

                <Space size={4} wrap>
                  <Tag bordered={false}>대기 {u.counts.pending}</Tag>
                  <Tag bordered={false} color="processing">진행 {u.counts.inProgress}</Tag>
                  {u.counts.high > 0 && <Tag bordered={false} color="red">높음 {u.counts.high}</Tag>}
                  {u.counts.overdue > 0 && <Tag bordered={false} color="volcano">지연 {u.counts.overdue}</Tag>}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
