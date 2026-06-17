import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useThemeStore from '../../store/themeStore';
import {
  Row, Col, Card, Statistic, Typography, List, Tag, Space, Alert, Spin, Badge,
  Popover, Switch, Button, Divider,
} from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, PauseCircleOutlined, HourglassOutlined,
  CalendarOutlined, SettingOutlined, ExclamationCircleOutlined, WalletOutlined,
} from '@ant-design/icons';
import {
  Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList,
} from 'recharts';
import dayjs from 'dayjs';
import { getTasks } from '../../api/tasks';
import { getWidgetSettings, updateWidgetSettings } from '../../api/settings';
import { getSummary as getLedgerSummary } from '../../api/ledger';
import useTaskStore from '../../store/taskStore';
import { isOverdue, isDueSoon } from '../../utils/dday';
import { STATUS_COLORS } from '../../utils/colors';
import StatusBadge from '../../components/Task/StatusBadge';
import PriorityBadge from '../../components/Task/PriorityBadge';
import DdayBadge from '../../components/Task/DdayBadge';

const STATUS_ICONS = {
  pending: <HourglassOutlined style={{ color: STATUS_COLORS.pending.color }} />,
  in_progress: <ClockCircleOutlined style={{ color: STATUS_COLORS.in_progress.color }} />,
  done: <CheckCircleOutlined style={{ color: STATUS_COLORS.done.color }} />,
  hold: <PauseCircleOutlined style={{ color: STATUS_COLORS.hold.color }} />,
};

const CHART_HEIGHT = 170;

const WIDGET_DEFAULTS = {
  urgentAlert: true,
  statusCards: true,
  overdueTasks: true,
  todayTasks: true,
  weekTasks: true,
  ledgerCard: false, // HIDDEN
  chartStatus: true,
  chartPart: true,
  chartAssignee: true,
};

const WIDGET_LABELS = {
  urgentAlert: '긴급/마감 알림',
  statusCards: '상태별 카드',
  overdueTasks: '지연 업무 목록',
  todayTasks: '금일 할일',
  weekTasks: '이번 주 마감',
  // ledgerCard: '가계부 요약', // HIDDEN
  chartStatus: '상태별 분포 차트',
  chartPart: '파트별 차트',
  chartAssignee: '담당자별 차트',
};

const blinkStyle = `
  @keyframes overdueBlinkAnim {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
  }
  .overdue-blink {
    animation: overdueBlinkAnim 1.2s ease-in-out infinite;
  }

  .status-card-pending     { border-color: #8c8c8c !important; }
  .status-card-in_progress { border-color: #1677ff !important; }
  .status-card-done        { border-color: #52c41a !important; }
  .status-card-hold        { border-color: #fa8c16 !important; }

  @keyframes overdueBorderBlink {
    0%, 100% { border-color: #ff4d4f !important; }
    50%       { border-color: rgba(255,77,79,0.15) !important; }
  }
  .status-card-overdue {
    border-color: #ff4d4f !important;
    animation: overdueBorderBlink 1.2s ease-in-out infinite;
  }
`;

const SectionLabel = ({ text, isDark }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 10 }}>
    <span style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
      color: isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8', textTransform: 'uppercase',
    }}>
      {text}
    </span>
    <div className="section-divider" style={{ flex: 1, height: 1, background: isDark ? 'rgba(255,255,255,0.07)' : '#f1f5f9' }} />
  </div>
);

const CustomBarLabel = ({ x, y, width, value }) => {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fill="var(--fd-chart-label)" fontSize={12}>
      {value}
    </text>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const isDark = useThemeStore((s) => s.isDark);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState({ ...WIDGET_DEFAULTS });
  const [ledgerSummary, setLedgerSummary] = useState(null);

  const calendarVersion = useTaskStore((s) => s.calendarVersion);

  useEffect(() => {
    getWidgetSettings().then((cfg) => setWidgets((prev) => ({ ...prev, ...cfg }))).catch(() => {});
    const now = new Date();
    getLedgerSummary({ year: now.getFullYear(), month: now.getMonth() + 1 })
      .then(setLedgerSummary)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, [calendarVersion]);

  const toggleWidget = (key) => {
    setWidgets((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      updateWidgetSettings(next).catch(() => {});
      return next;
    });
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  const today = dayjs().startOf('day');
  const activeTasks = tasks.filter((t) => t.delYn !== '1');

  const overdueTasks = activeTasks.filter((t) => isOverdue(t.dueDate, t.status));

  const counts = {
    pending: activeTasks.filter((t) => t.status === 'pending' && !isOverdue(t.dueDate, t.status)).length,
    in_progress: activeTasks.filter((t) => t.status === 'in_progress' && !isOverdue(t.dueDate, t.status)).length,
    done: activeTasks.filter((t) => t.status === 'done').length,
    hold: activeTasks.filter((t) => t.status === 'hold' && !isOverdue(t.dueDate, t.status)).length,
    overdue: overdueTasks.length,
  };

  const todayTasks = activeTasks.filter((t) => {
    if (t.status === 'done') return false;
    const start = t.startDate ? dayjs(t.startDate).startOf('day') : null;
    const due   = t.dueDate  ? dayjs(t.dueDate).startOf('day')   : null;
    if (start && due)  return !today.isBefore(start) && !today.isAfter(due);
    if (start && !due) return !today.isBefore(start);
    if (!start && due) return !today.isAfter(due);
    return false;
  });

  const weekEnd = dayjs().endOf('week');
  const weekTasks = activeTasks.filter(
    (t) => t.dueDate && dayjs(t.dueDate).isBefore(weekEnd) && t.status !== 'done'
  );

  const urgentTasks = activeTasks.filter((t) => isDueSoon(t.dueDate, t.status) || isOverdue(t.dueDate, t.status));

  const statusData = [
    { name: '대기', value: counts.pending, fill: STATUS_COLORS.pending.color },
    { name: '진행중', value: counts.in_progress, fill: STATUS_COLORS.in_progress.color },
    { name: '완료', value: counts.done, fill: STATUS_COLORS.done.color },
    { name: '보류', value: counts.hold, fill: STATUS_COLORS.hold.color },
    { name: '지연', value: counts.overdue, fill: '#ff4d4f' },
  ];

  const partMap = {};
  activeTasks.forEach((t) => {
    const name = t.part?.name || '미분류';
    if (!partMap[name]) partMap[name] = { name, total: 0, done: 0, inProgress: 0, pending: 0, overdue: 0 };
    partMap[name].total++;
    if (t.status === 'done') partMap[name].done++;
    else if (isOverdue(t.dueDate, t.status)) partMap[name].overdue++;
    else if (t.status === 'in_progress') partMap[name].inProgress++;
    else partMap[name].pending++;
  });
  const partData = Object.values(partMap).sort((a, b) => b.total - a.total).slice(0, 8);

  const assigneeMap = {};
  activeTasks.forEach((t) => {
    const names = [
      ...(t.assignees?.map((a) => a.user?.displayName) || []),
      ...(t.extraAssignees?.map((e) => e.name) || []),
    ];
    const key = names.length === 0 ? '미배정' : null;
    if (key) {
      if (!assigneeMap[key]) assigneeMap[key] = { name: key, total: 0, done: 0, inProgress: 0, pending: 0, overdue: 0 };
      assigneeMap[key].total++;
      if (t.status === 'done') assigneeMap[key].done++;
      else if (isOverdue(t.dueDate, t.status)) assigneeMap[key].overdue++;
      else if (t.status === 'in_progress') assigneeMap[key].inProgress++;
      else assigneeMap[key].pending++;
    } else {
      names.forEach((n) => {
        if (!n) return;
        if (!assigneeMap[n]) assigneeMap[n] = { name: n, total: 0, done: 0, inProgress: 0, pending: 0, overdue: 0 };
        assigneeMap[n].total++;
        if (t.status === 'done') assigneeMap[n].done++;
        else if (isOverdue(t.dueDate, t.status)) assigneeMap[n].overdue++;
        else if (t.status === 'in_progress') assigneeMap[n].inProgress++;
        else assigneeMap[n].pending++;
      });
    }
  });
  const assigneeData = Object.values(assigneeMap).sort((a, b) => b.total - a.total).slice(0, 8);

  const widgetSettingsContent = (
    <div style={{ minWidth: 200 }}>
      {Object.entries(WIDGET_LABELS).map(([key, label]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <Typography.Text style={{ fontSize: 13 }}>{label}</Typography.Text>
          <Switch
            size="small"
            checked={widgets[key]}
            onChange={() => toggleWidget(key)}
          />
        </div>
      ))}
      <Divider style={{ margin: '8px 0' }} />
      <Button
        size="small"
        block
        onClick={() => {
          setWidgets({ ...WIDGET_DEFAULTS });
          updateWidgetSettings(WIDGET_DEFAULTS).catch(() => {});
        }}
      >
        기본값으로 초기화
      </Button>
    </div>
  );

  return (
    <div>
      <style>{blinkStyle}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>대시보드</Typography.Title>
        <Popover
          content={widgetSettingsContent}
          title="위젯 표시 설정"
          trigger="click"
          placement="bottomRight"
        >
          <Button icon={<SettingOutlined />} size="small">위젯 설정</Button>
        </Popover>
      </div>

      {widgets.statusCards && (
        <>
          <SectionLabel text="Overview" isDark={isDark} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { key: 'pending',     label: '대기',   dot: '#94a3b8', color: isDark ? '#94a3b8' : '#334155', blink: false },
              { key: 'in_progress', label: '진행중', dot: '#3b82f6', color: isDark ? '#60a5fa' : '#1d4ed8', blink: false },
              { key: 'done',        label: '완료',   dot: '#22c55e', color: isDark ? '#4ade80' : '#15803d', blink: false },
              { key: 'overdue',     label: '지연',   dot: '#ef4444', color: isDark ? '#f87171' : '#dc2626', blink: counts.overdue > 0 },
              { key: 'hold',        label: '보류',   dot: '#f59e0b', color: isDark ? '#fbbf24' : '#b45309', blink: false },
            ].map(({ key, label, dot, color, blink }) => (
              <Card
                key={key}
                hoverable
                className={`status-card-${key}`}
                onClick={() => navigate(key === 'overdue' ? '/tasks' : `/tasks?status=${key}`)}
                style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                styles={{ body: { padding: '16px 14px' } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: dot, flexShrink: 0,
                  }} className={blink ? 'overdue-blink' : ''} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {label}
                  </span>
                </div>
                <div style={{
                  fontSize: 30, fontWeight: 800, color,
                  letterSpacing: '-0.03em', lineHeight: 1,
                }} className={blink ? 'overdue-blink' : ''}>
                  {counts[key]}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {(widgets.urgentAlert && urgentTasks.length > 0) || (widgets.overdueTasks && overdueTasks.length > 0) ? (
        <SectionLabel text="Alerts" isDark={isDark} />
      ) : null}

      {widgets.urgentAlert && urgentTasks.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`마감 임박/초과 업무 ${urgentTasks.length}건이 있습니다.`}
          action={
            <Typography.Link onClick={() => navigate('/tasks')}>
              목록 보기
            </Typography.Link>
          }
          style={{ marginBottom: 10 }}
        />
      )}

      {widgets.overdueTasks && overdueTasks.length > 0 && (
        <Card
          title={
            <Space>
              <span className="overdue-blink" style={{ color: '#ff4d4f', fontWeight: 700 }}>지연</span>
              <Badge count={overdueTasks.length} style={{ backgroundColor: '#ff4d4f' }} />
              <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                마감일이 지난 미완료 업무
              </Typography.Text>
            </Space>
          }
          styles={{ body: { padding: '2px 0', maxHeight: 120, overflowY: 'auto' } }}
          style={{ borderRadius: 8, marginBottom: 16, border: '1.5px solid #ff4d4f' }}
        >
          {overdueTasks.slice(0, 5).map((task) => {
            const daysLate = dayjs().startOf('day').diff(dayjs(task.dueDate).startOf('day'), 'day');
            return (
              <div
                key={task.id}
                onClick={() => navigate('/tasks')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                  flexWrap: 'nowrap', overflow: 'hidden',
                }}
              >
                <Tag className="overdue-blink" color="error" style={{ fontWeight: 700, flexShrink: 0, margin: 0, fontSize: 11 }}>
                  지연 {daysLate}일
                </Tag>
                <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                  {task.title}
                </span>
                <StatusBadge status={task.status} dueDate={task.dueDate} />
                {task.part && <Tag color="blue" style={{ flexShrink: 0, margin: 0, fontSize: 11 }}>{task.part.name}</Tag>}
                {task.assignees?.length > 0 && (
                  <Tag color="purple" style={{ flexShrink: 0, margin: 0, fontSize: 11 }}>
                    {task.assignees.map((a) => a.user?.displayName).join(', ')}
                  </Tag>
                )}
                <Typography.Text type="danger" style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  마감 {dayjs(task.dueDate).format('MM/DD')}
                </Typography.Text>
              </div>
            );
          })}
        </Card>
      )}

      {(widgets.todayTasks || widgets.weekTasks) && (
        <>
          <SectionLabel text="Schedule" isDark={isDark} />
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {widgets.todayTasks && (
            <Col xs={24} md={widgets.weekTasks ? 12 : 24}>
              <Card
                title={
                  <Space>
                    <CalendarOutlined style={{ color: '#1677ff' }} />
                    <span>금일 할일</span>
                    <Badge
                      count={todayTasks.length}
                      style={{ backgroundColor: todayTasks.length > 0 ? '#1677ff' : '#d9d9d9' }}
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                      {today.format('MM/DD')} 기준
                    </Typography.Text>
                  </Space>
                }
                styles={{ body: { padding: 0, maxHeight: 160, overflowY: 'auto' } }}
                style={{ borderRadius: 8 }}
              >
                <List
                  dataSource={todayTasks.slice(0, 5)}
                  locale={{ emptyText: '오늘 진행 중인 업무가 없습니다.' }}
                  renderItem={(task) => (
                    <List.Item
                      style={{ padding: '6px 12px', cursor: 'pointer' }}
                      onClick={() => navigate('/tasks')}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={4}>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{task.title}</span>
                            <PriorityBadge priority={task.priority} />
                          </Space>
                        }
                        description={
                          <Space size={4} wrap>
                            <StatusBadge status={task.status} dueDate={task.dueDate} />
                            {task.dueDate && (
                              <DdayBadge dueDate={task.dueDate} status={task.status} />
                            )}
                            {task.part && <Tag color="blue" style={{ fontSize: 11 }}>{task.part.name}</Tag>}
                          </Space>
                        }
                      />
                      {task.dueDate && (
                        <Typography.Text
                          type={dayjs(task.dueDate).isBefore(today) ? 'danger' : 'secondary'}
                          style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                        >
                          마감 {dayjs(task.dueDate).format('MM/DD')}
                        </Typography.Text>
                      )}
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          )}

          {widgets.weekTasks && (
            <Col xs={24} md={widgets.todayTasks ? 12 : 24}>
              <Card
                title={`이번 주 마감 업무 (${weekTasks.length}건)`}
                styles={{ body: { padding: 0, maxHeight: 160, overflowY: 'auto' } }}
                style={{ borderRadius: 8 }}
              >
                <List
                  dataSource={weekTasks.slice(0, 5)}
                  locale={{ emptyText: '이번 주 마감 업무가 없습니다.' }}
                  renderItem={(task) => (
                    <List.Item
                      style={{ padding: '6px 12px', cursor: 'pointer' }}
                      onClick={() => navigate('/tasks')}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={4}>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{task.title}</span>
                            <PriorityBadge priority={task.priority} />
                          </Space>
                        }
                        description={
                          <Space size={4}>
                            <StatusBadge status={task.status} dueDate={task.dueDate} />
                            {task.dueDate && (
                              <DdayBadge dueDate={task.dueDate} status={task.status} />
                            )}
                            {task.part && (
                              <Tag color="blue" style={{ fontSize: 11 }}>{task.part.name}</Tag>
                            )}
                          </Space>
                        }
                      />
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {task.dueDate ? dayjs(task.dueDate).format('MM/DD') : '-'}
                      </Typography.Text>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          )}
        </Row>
        </>
      )}

      {(widgets.chartStatus || widgets.chartPart || widgets.chartAssignee) && (
        <>
          <SectionLabel text="Analytics" isDark={isDark} />
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          {widgets.chartStatus && (
            <Col xs={24} md={widgets.chartPart || widgets.chartAssignee ? 8 : 24}>
              <Card
                title="상태별 분포"
                style={{ borderRadius: 8 }}
                styles={{ body: { padding: '8px 6px' } }}
              >
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={statusData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--fd-chart-grid)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--fd-text-secondary)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--fd-text-secondary)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="value" name="업무 수" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="value" content={<CustomBarLabel />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}

          {widgets.chartPart && (
            <Col xs={24} md={widgets.chartStatus || widgets.chartAssignee ? 8 : 24}>
              <Card
                title="파트별 업무 현황"
                style={{ borderRadius: 8 }}
                styles={{ body: { padding: '8px 6px' } }}
              >
                {partData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <BarChart data={partData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--fd-chart-grid)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--fd-text-secondary)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--fd-text-secondary)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="done" name="완료" stackId="a" fill={STATUS_COLORS.done.color} maxBarSize={36} />
                      <Bar dataKey="inProgress" name="진행중" stackId="a" fill={STATUS_COLORS.in_progress.color} maxBarSize={36} />
                      <Bar dataKey="pending" name="대기" stackId="a" fill={STATUS_COLORS.pending.color} maxBarSize={36} />
                      <Bar dataKey="overdue" name="지연" stackId="a" fill="#ff4d4f" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        <LabelList dataKey="total" content={<CustomBarLabel />} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--fd-text-hint)', padding: 40 }}>데이터 없음</div>
                )}
              </Card>
            </Col>
          )}

          {widgets.chartAssignee && (
            <Col xs={24} md={widgets.chartStatus || widgets.chartPart ? 8 : 24}>
              <Card
                title="담당자별 업무 수"
                style={{ borderRadius: 8 }}
                styles={{ body: { padding: '8px 6px' } }}
              >
                {assigneeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <BarChart data={assigneeData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--fd-chart-grid)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--fd-text-secondary)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--fd-text-secondary)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="done" name="완료" stackId="a" fill={STATUS_COLORS.done.color} maxBarSize={36} />
                      <Bar dataKey="inProgress" name="진행중" stackId="a" fill={STATUS_COLORS.in_progress.color} maxBarSize={36} />
                      <Bar dataKey="pending" name="대기" stackId="a" fill={STATUS_COLORS.pending.color} maxBarSize={36} />
                      <Bar dataKey="overdue" name="지연" stackId="a" fill="#ff4d4f" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        <LabelList dataKey="total" content={<CustomBarLabel />} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--fd-text-hint)', padding: 40 }}>데이터 없음</div>
                )}
              </Card>
            </Col>
          )}
        </Row>
        </>
      )}

      {false && widgets.ledgerCard && ledgerSummary && ( // HIDDEN
        <Card
          title={
            <Space>
              <WalletOutlined style={{ color: '#52c41a' }} />
              <span>이번 달 가계부</span>
              <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                {new Date().getFullYear()}년 {new Date().getMonth() + 1}월
              </Typography.Text>
            </Space>
          }
          extra={
            <Typography.Link onClick={() => navigate('/ledger')} style={{ fontSize: 12 }}>
              상세 보기
            </Typography.Link>
          }
          style={{ borderRadius: 8, marginBottom: 12 }}
          styles={{ body: { padding: '10px 16px' } }}
        >
          <Row gutter={[16, 0]}>
            <Col xs={8} style={{ textAlign: 'center' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#52c41a' }}>수입</span>}
                value={Number(ledgerSummary.thisMonth?.income || 0)}
                suffix="원"
                valueStyle={{ color: '#52c41a', fontSize: 16, fontWeight: 700 }}
                formatter={(v) => Number(v).toLocaleString('ko-KR')}
              />
            </Col>
            <Col xs={8} style={{ textAlign: 'center' }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: '#ff4d4f' }}>지출</span>}
                value={Number(ledgerSummary.thisMonth?.expense || 0)}
                suffix="원"
                valueStyle={{ color: '#ff4d4f', fontSize: 16, fontWeight: 700 }}
                formatter={(v) => Number(v).toLocaleString('ko-KR')}
              />
            </Col>
            <Col xs={8} style={{ textAlign: 'center' }}>
              {(() => {
                const bal = Number(ledgerSummary.thisMonth?.balance || 0);
                return (
                  <Statistic
                    title={<span style={{ fontSize: 12, color: bal >= 0 ? '#1677ff' : '#ff4d4f' }}>잔액</span>}
                    value={Math.abs(bal)}
                    suffix="원"
                    prefix={bal < 0 ? '-' : ''}
                    valueStyle={{ color: bal >= 0 ? '#1677ff' : '#ff4d4f', fontSize: 16, fontWeight: 700 }}
                    formatter={(v) => Number(v).toLocaleString('ko-KR')}
                  />
                );
              })()}
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
}
