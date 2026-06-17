import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Badge, Tooltip } from 'antd';
import {
  WarningOutlined, ClockCircleOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import dayjs from 'dayjs';

// ─── 트리 flatten ──────────────────────────────────────
function flattenTree(nodes) {
  const result = [];
  function walk(arr) {
    arr.forEach((n) => {
      result.push(n);
      if (n.children?.length) walk(n.children);
    });
  }
  walk(nodes || []);
  return result;
}

// ─── 이중 게이지 (계획 vs 실적) ───────────────────────
function DualGauge({ planned, actual }) {
  const data = [
    { name: '실적', value: actual, color: '#52c41a' },
    { name: '미실적', value: Math.max(0, planned - actual), color: '#e8f5e9' },
    { name: '미계획', value: Math.max(0, 100 - planned), color: '#f5f5f5' },
  ];

  const compColor = planned > 0
    ? (actual >= planned ? '#52c41a' : actual >= planned * 0.8 ? '#faad14' : '#ff4d4f')
    : '#d9d9d9';

  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={[{ value: planned }, { value: 100 - planned }]}
            cx="50%" cy="50%"
            innerRadius={38} outerRadius={52}
            startAngle={90} endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill="#1890ff" opacity={0.25} />
            <Cell fill="#f0f0f0" opacity={0.4} />
          </Pie>
          <Pie
            data={[{ value: actual }, { value: 100 - actual }]}
            cx="50%" cy="50%"
            innerRadius={24} outerRadius={38}
            startAngle={90} endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={compColor} />
            <Cell fill="#f5f5f5" opacity={0.3} />
          </Pie>
          <RTooltip
            formatter={(v, n) => [`${Math.round(v)}%`, n === '계획' ? '계획 진척률' : '실적 진척률']}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* 중앙 텍스트 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: compColor, lineHeight: 1 }}>
          {Math.round(actual)}%
        </span>
        <span style={{ fontSize: 10, color: '#999', marginTop: 2 }}>실적</span>
      </div>
    </div>
  );
}

export default function WbsSummaryCards({ tasks, issues = [], refDate }) {
  const allTasks = useMemo(() => flattenTree(tasks), [tasks]);
  const leafTasks = useMemo(() => allTasks.filter((t) => !t.children?.length), [allTasks]);

  const today = refDate ? dayjs(refDate) : dayjs();
  const weekEnd = today.add(7, 'day');

  // 지연 항목 (종료일 지남 + 실적 < 100%)
  const delayedTasks = useMemo(() =>
    allTasks.filter((t) => {
      if (!t.endDate) return false;
      const actual = Number(t.actualProgress) || 0;
      return actual < 100 && today.startOf('day').isAfter(dayjs(t.endDate).startOf('day'));
    }), [allTasks, today]);

  // 이번 주 마감 (오늘 ~ 7일 이내, 미완료)
  const dueSoonTasks = useMemo(() =>
    allTasks.filter((t) => {
      if (!t.endDate) return false;
      const actual = Number(t.actualProgress) || 0;
      if (actual >= 100) return false;
      const end = dayjs(t.endDate);
      return (end.isSame(today, 'day') || end.isAfter(today)) && end.isBefore(weekEnd);
    }), [allTasks, today, weekEnd]);

  // 완료 항목
  const completedCount = useMemo(() =>
    leafTasks.filter((t) => Number(t.actualProgress) >= 100).length, [leafTasks]);

  // 전체 진척률
  const rootTasks = tasks || [];
  const overallPlanned = rootTasks.length
    ? Math.round(rootTasks.reduce((s, t) => s + (Number(t.plannedProgress) || 0), 0) / rootTasks.length)
    : 0;
  const overallActual = rootTasks.length
    ? Math.round(rootTasks.reduce((s, t) => s + (Number(t.actualProgress) || 0), 0) / rootTasks.length)
    : 0;

  // 오픈 이슈
  const openIssues = useMemo(() =>
    (issues || []).filter((i) => i.status === 'open' || i.status === 'in_progress').length,
    [issues]);

  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
      {/* 원형 진척률 차트 */}
      <Col>
        <Card
          size="small"
          style={{ borderColor: '#c8e6c9', minWidth: 200 }}
          styles={{ body: { padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 } }}
        >
          <DualGauge planned={overallPlanned} actual={overallActual} />
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>전체 진척률</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1890ff', opacity: 0.6, display: 'inline-block' }} />
              <span style={{ fontSize: 12 }}>계획 <b style={{ color: '#1890ff' }}>{overallPlanned}%</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#52c41a', display: 'inline-block' }} />
              <span style={{ fontSize: 12 }}>실적 <b style={{ color: '#52c41a' }}>{overallActual}%</b></span>
            </div>
          </div>
        </Card>
      </Col>

      {/* 지연 항목 */}
      <Col>
        <Card
          size="small"
          style={{ borderColor: delayedTasks.length > 0 ? '#ffccc7' : '#f0f0f0', minWidth: 140 }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <WarningOutlined style={{ color: delayedTasks.length > 0 ? '#ff4d4f' : '#bbb', fontSize: 18 }} />
            <span style={{ fontSize: 13, color: '#555' }}>지연 항목</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: delayedTasks.length > 0 ? '#ff4d4f' : '#999', lineHeight: 1 }}>
            {delayedTasks.length}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>개 항목 지연중</div>
          {delayedTasks.length > 0 && (
            <Tooltip title={delayedTasks.slice(0, 5).map((t) => t.name).join(', ') + (delayedTasks.length > 5 ? ` 외 ${delayedTasks.length - 5}건` : '')}>
              <div style={{ fontSize: 11, color: '#ff7875', marginTop: 4, cursor: 'pointer', textDecoration: 'underline dotted' }}>
                항목 보기
              </div>
            </Tooltip>
          )}
        </Card>
      </Col>

      {/* 이번 주 마감 */}
      <Col>
        <Card
          size="small"
          style={{ borderColor: dueSoonTasks.length > 0 ? '#ffe7ba' : '#f0f0f0', minWidth: 140 }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <CalendarOutlined style={{ color: dueSoonTasks.length > 0 ? '#fa8c16' : '#bbb', fontSize: 18 }} />
            <span style={{ fontSize: 13, color: '#555' }}>마감 임박</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: dueSoonTasks.length > 0 ? '#fa8c16' : '#999', lineHeight: 1 }}>
            {dueSoonTasks.length}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>7일 이내 마감</div>
          {dueSoonTasks.length > 0 && (
            <Tooltip title={dueSoonTasks.slice(0, 5).map((t) => `${t.name} (${dayjs(t.endDate).format('MM/DD')})`).join(', ')}>
              <div style={{ fontSize: 11, color: '#ffa940', marginTop: 4, cursor: 'pointer', textDecoration: 'underline dotted' }}>
                항목 보기
              </div>
            </Tooltip>
          )}
        </Card>
      </Col>

      {/* 완료 현황 */}
      <Col>
        <Card
          size="small"
          style={{ borderColor: '#b7eb8f', minWidth: 140 }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
            <span style={{ fontSize: 13, color: '#555' }}>완료 현황</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#52c41a', lineHeight: 1 }}>
            {completedCount}
            <span style={{ fontSize: 16, fontWeight: 500, color: '#aaa' }}> / {leafTasks.length}</span>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
            완료율 {leafTasks.length > 0 ? Math.round((completedCount / leafTasks.length) * 100) : 0}%
          </div>
        </Card>
      </Col>

      {/* 오픈 이슈 */}
      <Col>
        <Card
          size="small"
          style={{ borderColor: openIssues > 0 ? '#91caff' : '#f0f0f0', minWidth: 140 }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <ExclamationCircleOutlined style={{ color: openIssues > 0 ? '#1890ff' : '#bbb', fontSize: 18 }} />
            <span style={{ fontSize: 13, color: '#555' }}>오픈 이슈</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: openIssues > 0 ? '#1890ff' : '#999', lineHeight: 1 }}>
            {openIssues}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>미결 이슈</div>
        </Card>
      </Col>
    </Row>
  );
}
