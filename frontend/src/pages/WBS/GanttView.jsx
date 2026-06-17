import React, { useMemo, useState } from 'react';
import { Gantt, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { Radio, Empty, Alert } from 'antd';
import dayjs from 'dayjs';

// ─── 레벨별 접두어 설정 ───────────────────────────────
const LEVEL_PREFIX = ['[대]', '[중]', '[소]', '   ·', '     ·'];
const LEVEL_INDENT = ['', '  ', '    ', '      ', '        '];

const levelColors = [
  { bar: '#2e7d32', progress: '#81c784' },
  { bar: '#43a047', progress: '#a5d6a7' },
  { bar: '#66bb6a', progress: '#c8e6c9' },
  { bar: '#81c784', progress: '#e8f5e9' },
  { bar: '#a5d6a7', progress: '#f1f8f1' },
];

// ─── WBS 트리 → gantt-task-react 형식 변환 ────────────
function flattenToGantt(nodes, parentId = undefined) {
  const result = [];
  nodes.forEach((node) => {
    const start = node.startDate ? new Date(node.startDate) : null;
    const end = node.endDate
      ? new Date(new Date(node.endDate).getTime() + 86400000)
      : null;

    const hasValidDates = start && end && end > start;
    const hasChildren = node.children && node.children.length > 0;

    if (hasValidDates) {
      const lvl = Math.min(node.level, levelColors.length - 1);
      const progress = Number(node.actualProgress) || 0;
      const lc = levelColors[lvl];

      const prefix = LEVEL_PREFIX[lvl] ?? '·';
      const indent = LEVEL_INDENT[lvl] ?? '        ';
      const displayName = `${indent}${prefix} ${node.name || '(무제)'}`;

      result.push({
        id: String(node.id),
        name: displayName,
        start,
        end,
        progress,
        type: hasChildren ? 'project' : 'task',
        project: parentId ? String(parentId) : undefined,
        isDisabled: true,
        styles: {
          backgroundColor: lc.bar,
          backgroundSelectedColor: lc.bar,
          progressColor: lc.progress,
          progressSelectedColor: lc.progress,
        },
      });
    }

    if (hasChildren) {
      // 날짜 없는 부모는 조상 parentId를 물려줘 자식이 누락되지 않도록 함
      result.push(...flattenToGantt(node.children, hasValidDates ? node.id : parentId));
    }
  });
  return result;
}

function flattenAll(nodes) {
  const result = [];
  (nodes || []).forEach((n) => {
    result.push(n);
    if (n.children?.length) result.push(...flattenAll(n.children));
  });
  return result;
}

export default function GanttView({ tasks, project }) {
  const [viewMode, setViewMode] = useState(ViewMode.Week);

  const ganttTasks = useMemo(() => flattenToGantt(tasks || []), [tasks]);

  if (!ganttTasks.length) {
    return (
      <Empty
        description="시작일/종료일이 설정된 항목이 없습니다"
        style={{ padding: '60px 0' }}
      />
    );
  }

  // 날짜 범위 유효성 검사 (전체 중첩 항목 대상)
  const allTasks = flattenAll(tasks);
  const invalidTasks = allTasks.filter((t) => {
    if (!t.startDate || !t.endDate) return false;
    return new Date(t.endDate) <= new Date(t.startDate);
  });

  return (
    <div>
      {invalidTasks.length > 0 && (
        <Alert
          type="warning"
          message={`종료일이 시작일보다 빠른 항목 ${invalidTasks.length}개는 간트에서 표시되지 않습니다.`}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#555' }}>단위:</span>
        <Radio.Group
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          size="small"
          buttonStyle="solid"
        >
          <Radio.Button value={ViewMode.Day}>일</Radio.Button>
          <Radio.Button value={ViewMode.Week}>주</Radio.Button>
          <Radio.Button value={ViewMode.Month}>월</Radio.Button>
        </Radio.Group>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #e8f5e9', borderRadius: 6 }}>
        <style>{`
          .gantt-task-react .bar-label { font-size: 11px !important; }
          ._3eULf { font-family: 'Malgun Gothic', sans-serif; }
          ._CZjuD { fill: #f0f7f0; }
          ._9w8d5 { fill: #2e7d32; }
        `}</style>
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          locale="ko"
          listCellWidth="240px"
          columnWidth={viewMode === ViewMode.Day ? 40 : viewMode === ViewMode.Week ? 120 : 200}
          rowHeight={36}
          headerHeight={50}
          fontSize="12px"
          todayColor="rgba(46,125,50,0.08)"
          projectBackgroundColor="#c8e6c9"
          projectProgressColor="#2e7d32"
          projectBackgroundSelectedColor="#a5d6a7"
          projectProgressSelectedColor="#1b5e20"
        />
      </div>
      <div style={{
        display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#666',
        flexWrap: 'wrap',
      }}>
        <span><span style={{ display:'inline-block', width:12, height:12, background:'#2e7d32', borderRadius:2, marginRight:4, verticalAlign:'middle' }} />대분류</span>
        <span><span style={{ display:'inline-block', width:12, height:12, background:'#43a047', borderRadius:2, marginRight:4, verticalAlign:'middle' }} />중분류</span>
        <span><span style={{ display:'inline-block', width:12, height:12, background:'#66bb6a', borderRadius:2, marginRight:4, verticalAlign:'middle' }} />소분류</span>
        <span style={{ marginLeft: 'auto' }}>
          <span style={{ display:'inline-block', width:12, height:12, background:'rgba(46,125,50,0.08)', border:'1px solid #2e7d32', marginRight:4, verticalAlign:'middle' }} />
          오늘
        </span>
      </div>
    </div>
  );
}
