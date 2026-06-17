import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button, Table, Tag, Space, Select, Typography, message,
  Popconfirm, Avatar, Tooltip, Progress, Badge, Tabs, Card, Statistic, Row, Col, Spin,
} from 'antd';
import {
  PlusOutlined, PlayCircleOutlined, CheckCircleFilled,
  PauseCircleFilled, InboxOutlined, ClockCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, Cell } from 'recharts';
import dayjs from 'dayjs';
import * as pbApi from '../../api/playbook';
import useAuthStore from '../../store/authStore';
import useUnreadStore from '../../store/unreadStore';
import RunCreateModal from './RunCreateModal';

const { Title } = Typography;

const SEVERITY_MAP = {
  p1:   { label: 'P1',    color: 'red'     },
  p2:   { label: 'P2',    color: 'orange'  },
  p3:   { label: 'P3',    color: 'blue'    },
  none: { label: '-',     color: 'default' },
};

const STATUS_MAP = {
  active:   { label: '진행 중', color: 'processing', icon: <PlayCircleOutlined /> },
  paused:   { label: '일시정지', color: 'warning',   icon: <PauseCircleFilled /> },
  finished: { label: '완료',    color: 'success',   icon: <CheckCircleFilled /> },
  archived: { label: '보관됨',  color: 'default',   icon: <InboxOutlined /> },
};

function StepProgress({ steps }) {
  if (!steps?.length) return <span style={{ color: '#bbb', fontSize: 11 }}>-</span>;
  const done = steps.filter((s) => ['done', 'skipped', 'rejected'].includes(s.status)).length;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <Tooltip title={`${done}/${steps.length} 완료`}>
      <Progress
        percent={pct}
        size="small"
        style={{ width: 80 }}
        format={() => `${done}/${steps.length}`}
        status={pct === 100 ? 'success' : 'active'}
      />
    </Tooltip>
  );
}

const STATUS_COLORS = { active: '#1677ff', paused: '#faad14', finished: '#52c41a', archived: '#d9d9d9' };
const SEVERITY_COLORS = { p1: '#ff4d4f', p2: '#fa8c16', p3: '#1677ff', none: '#d9d9d9' };

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pbApi.getRunStats()
      .then(setStats)
      .catch(() => message.error('통계 로드 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  if (!stats) return null;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="전체 완료 런" value={stats.totalFinished} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="평균 완료 시간"
              value={stats.avgCompletionMins ?? '-'}
              suffix={stats.avgCompletionMins != null ? '분' : ''}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="진행 중" value={stats.byStatus.find((s) => s.status === 'active')?.count ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="일시정지" value={stats.byStatus.find((s) => s.status === 'paused')?.count ?? 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="상태별 런 수" size="small">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.byStatus}>
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartTooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.byStatus.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] || '#8884d8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="심각도별 런 수" size="small">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.bySeverity}>
                <XAxis dataKey="severity" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartTooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.bySeverity.map((s) => (
                    <Cell key={s.severity} fill={SEVERITY_COLORS[s.severity] || '#8884d8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="병목 단계 (평균 소요 시간 기준 Top 5)" size="small">
            {stats.bottlenecks.length === 0 ? (
              <div style={{ color: '#aaa', padding: '16px 0' }}>데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.bottlenecks} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="분" />
                  <YAxis type="category" dataKey="title" tick={{ fontSize: 10 }} width={140} />
                  <RechartTooltip formatter={(v) => `${v}분`} />
                  <Bar dataKey="avgMins" fill="#1677ff" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default function RunListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const initPlaybookId = searchParams.get('playbookId');

  // playbookId 쿼리가 있으면 즉시 모달 오픈
  useEffect(() => {
    if (initPlaybookId) setModalOpen(true);
  }, [initPlaybookId]);

  // Run 목록 열람: Playbook 안읽음 읽음 처리 + 사이드바 카운트 동기화
  useEffect(() => {
    const { setPlaybookViewing, setPlaybookUnread } = useUnreadStore.getState();
    setPlaybookViewing(true);
    const sync = () =>
      pbApi.markRunsRead()
        .then(() => pbApi.getRunUnreadCount())
        .then((d) => setPlaybookUnread(d.total))
        .catch(() => {});
    sync();
    return () => {
      setPlaybookViewing(false);
      sync();
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (initPlaybookId) params.playbookId = initPlaybookId;
      setRuns(await pbApi.getRuns(params));
    } catch {
      message.error('불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleDelete = async (id) => {
    try {
      await pbApi.deleteRun(id);
      message.success('삭제되었습니다.');
      load();
    } catch {
      message.error('삭제 실패');
    }
  };

  const columns = [
    {
      title: '심각도',
      dataIndex: 'severity',
      key: 'severity',
      width: 70,
      render: (s) => {
        const m = SEVERITY_MAP[s] || SEVERITY_MAP.none;
        return m.label !== '-' ? <Tag color={m.color}>{m.label}</Tag> : <span style={{ color: '#ccc' }}>-</span>;
      },
    },
    {
      title: 'Run 이름',
      dataIndex: 'name',
      key: 'name',
      render: (name, row) => (
        <Button type="link" style={{ padding: 0, textAlign: 'left' }} onClick={() => navigate(`/runs/${row.id}`)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Playbook',
      dataIndex: 'playbook',
      key: 'playbook',
      render: (pb) => pb ? <Tag>{pb.name}</Tag> : <span style={{ color: '#aaa', fontSize: 12 }}>독립 Run</span>,
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (s) => {
        const m = STATUS_MAP[s] || STATUS_MAP.active;
        return <Badge status={m.color} text={m.label} />;
      },
    },
    {
      title: '진행률',
      key: 'progress',
      render: (_, row) => <StepProgress steps={row.steps} />,
    },
    {
      title: 'Owner',
      dataIndex: 'owner',
      key: 'owner',
      render: (owner) => owner ? (
        <Tooltip title={owner.displayName}>
          <Avatar size="small" style={{ backgroundColor: owner.avatarColor || '#1677ff', fontSize: 11 }}>
            {owner.displayName?.slice(0, 1)}
          </Avatar>
        </Tooltip>
      ) : '-',
    },
    {
      title: '시작',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (d) => dayjs(d).format('MM/DD HH:mm'),
    },
    {
      title: '마감',
      dataIndex: 'dueAt',
      key: 'dueAt',
      render: (d) => {
        if (!d) return <span style={{ color: '#ccc' }}>-</span>;
        const isOver = dayjs(d).isBefore(dayjs());
        return (
          <span style={{ color: isOver ? '#ff4d4f' : 'inherit', fontSize: 12 }}>
            {isOver && <ClockCircleOutlined style={{ marginRight: 4 }} />}
            {dayjs(d).format('MM/DD HH:mm')}
          </span>
        );
      },
    },
    {
      title: '작업',
      key: 'actions',
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" onClick={() => navigate(`/runs/${row.id}`)}>상세</Button>
          {(isAdmin || row.createdBy === user?.id) && row.status !== 'active' && (
            <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(row.id)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <PlayCircleOutlined style={{ marginRight: 8, color: '#52c41a' }} />
          Playbook Runs
        </Title>
        <Space>
          {activeTab === 'list' && (
            <>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 120 }}
                allowClear
                placeholder="전체"
              >
                <Select.Option value="active">진행 중</Select.Option>
                <Select.Option value="paused">일시정지</Select.Option>
                <Select.Option value="finished">완료</Select.Option>
                <Select.Option value="archived">보관됨</Select.Option>
              </Select>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                새 Run
              </Button>
            </>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'list',
            label: 'Run 목록',
            children: (
              <Table
                rowKey="id"
                columns={columns}
                dataSource={runs}
                loading={loading}
                pagination={{ pageSize: 20 }}
                size="small"
              />
            ),
          },
          {
            key: 'stats',
            label: <span><BarChartOutlined /> 통계</span>,
            children: <StatsTab />,
          },
        ]}
      />

      <RunCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(run) => { setModalOpen(false); navigate(`/runs/${run.id}`); }}
        defaultPlaybookId={initPlaybookId ? Number(initPlaybookId) : null}
      />
    </div>
  );
}
