import React, { useState } from 'react';
import { Table, Button, Typography, Popover, Checkbox, Divider, Tooltip, Tag, Avatar } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PropertyValue from '../components/PropertyValue';

const STATUS_MAP = {
  todo:        { label: '예정',   color: 'default' },
  in_progress: { label: '진행중', color: 'processing' },
  review:      { label: '검토중', color: 'purple' },
  done:        { label: '완료',   color: 'success' },
  hold:        { label: '보류',   color: 'warning' },
  cancelled:   { label: '취소',   color: 'error' },
};

const PRIORITY_MAP = {
  high:   { label: '높음', color: 'red' },
  normal: { label: '보통', color: 'blue' },
  low:    { label: '낮음', color: 'default' },
};

const { Text } = Typography;

function useVisibleProps(boardId, properties) {
  const storageKey = `board_${boardId}_visible_props`;

  const [visibleIds, setVisibleIds] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return null; // null = 전체 표시
  });

  const allIds = properties.map((p) => p.id);
  const effective = visibleIds ?? new Set(allIds);

  const toggle = (id) => {
    setVisibleIds((prev) => {
      const base = prev ?? new Set(allIds);
      const next = new Set(base);
      if (next.has(id)) {
        if (next.size <= 1) return prev; // 최소 1개 유지
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleAll = (checked) => {
    const next = checked ? new Set(allIds) : new Set([allIds[0]]);
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    setVisibleIds(next);
  };

  return { effective, toggle, toggleAll, allIds };
}

/* ── 컬럼 선택 팝오버 내용 ── */
function ColumnSelector({ properties, effective, toggle, toggleAll }) {
  const allChecked = properties.every((p) => effective.has(p.id));
  const someChecked = properties.some((p) => effective.has(p.id)) && !allChecked;

  return (
    <div style={{ width: 200 }}>
      <div style={{ marginBottom: 8 }}>
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          onChange={(e) => toggleAll(e.target.checked)}
          style={{ fontWeight: 600 }}
        >
          전체 선택
        </Checkbox>
      </div>
      <Divider style={{ margin: '6px 0' }} />
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {properties.map((prop) => (
          <Checkbox
            key={prop.id}
            checked={effective.has(prop.id)}
            onChange={() => toggle(prop.id)}
          >
            <span style={{ fontSize: 13 }}>{prop.name}</span>
          </Checkbox>
        ))}
        {properties.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>속성이 없습니다.</Text>
        )}
      </div>
    </div>
  );
}

function buildBuiltinColumns(builtinCols) {
  const cols = [];
  if (!builtinCols) return cols;

  if (builtinCols.has('status')) cols.push({
    title: '상태', key: 'status', width: 100,
    render: (_, card) => {
      const s = STATUS_MAP[card.status];
      return s ? <Tag color={s.color}>{s.label}</Tag> : '-';
    },
  });
  if (builtinCols.has('priority')) cols.push({
    title: '우선순위', key: 'priority', width: 100,
    render: (_, card) => {
      const p = PRIORITY_MAP[card.priority];
      return p ? <Tag color={p.color}>{p.label}</Tag> : '-';
    },
  });
  if (builtinCols.has('assignees')) cols.push({
    title: '담당자', key: 'assignees', width: 130,
    render: (_, card) => {
      const list = (card.assignees ?? []).filter(a => a.type === 'assignee');
      return list.length ? list.map(a => a.user?.displayName ?? '').join(', ') : '-';
    },
  });
  if (builtinCols.has('startDate')) cols.push({
    title: '시작일', key: 'startDate', width: 110,
    render: (_, card) => card.startDate ? dayjs(card.startDate).format('YYYY-MM-DD') : '-',
  });
  if (builtinCols.has('dueDate')) cols.push({
    title: '마감일', key: 'dueDate', width: 110,
    render: (_, card) => card.dueDate ? dayjs(card.dueDate).format('YYYY-MM-DD') : '-',
  });
  if (builtinCols.has('progress')) cols.push({
    title: '진행도', key: 'progress', width: 80,
    render: (_, card) => card.progress != null ? `${card.progress}%` : '-',
  });
  if (builtinCols.has('description')) cols.push({
    title: '설명', key: 'description', width: 160,
    render: (_, card) => card.description
      ? <Text ellipsis={{ tooltip: card.description }} style={{ maxWidth: 150 }}>{card.description}</Text>
      : '-',
  });
  if (builtinCols.has('checklists')) cols.push({
    title: '체크리스트', key: 'checklists', width: 100,
    render: (_, card) => {
      const total = (card.checklists ?? []).length;
      const done = (card.checklists ?? []).filter(c => c.checked).length;
      return total > 0 ? `${done}/${total}` : '-';
    },
  });
  if (builtinCols.has('comments')) cols.push({
    title: '댓글', key: 'comments', width: 70,
    render: (_, card) => (card.comments ?? []).length || '-',
  });
  if (builtinCols.has('attachments')) cols.push({
    title: '첨부파일', key: 'attachments', width: 80,
    render: (_, card) => (card.attachments ?? []).length || '-',
  });
  if (builtinCols.has('tags')) cols.push({
    title: '태그', key: 'tags', width: 120,
    render: (_, card) => (card.tags ?? []).length
      ? (card.tags ?? []).map(t => <Tag key={t.id} color={t.color}>{t.name}</Tag>)
      : '-',
  });

  return cols;
}

export default function TableView({ board, cards, onAddCard, onEditCard, onDeleteCard, builtinCols }) {
  const properties = board.properties ?? [];
  const { effective, toggle, toggleAll } = useVisibleProps(board.id, properties);
  const [colPopOpen, setColPopOpen] = useState(false);

  const visibleProps = properties.filter((p) => effective.has(p.id));
  const hiddenCount = properties.length - visibleProps.length;

  const columns = [
    {
      title: '제목',
      key: 'title',
      fixed: 'left',
      width: 200,
      render: (_, card) => (
        <Text
          strong
          style={{ cursor: 'pointer', color: '#1677ff' }}
          onClick={() => onEditCard(card)}
        >
          {card.title}
        </Text>
      ),
    },
    ...buildBuiltinColumns(builtinCols),
    ...visibleProps.map((prop) => ({
      title: prop.name,
      key: `prop_${prop.id}`,
      width: 160,
      render: (_, card) => {
        const pv = card.properties?.find((p) => p.propertyId === prop.id);
        return <PropertyValue property={prop} value={pv?.value ?? ''} />;
      },
    })),
    {
      title: '',
      key: 'actions',
      fixed: 'right',
      width: 80,
      render: (_, card) => (
        <span style={{ display: 'flex', gap: 4 }}>
          <Button size="small" icon={<EditOutlined />} onClick={() => onEditCard(card)} />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              if (window.confirm(`"${card.title}" 카드를 삭제할까요?`)) onDeleteCard(card.id);
            }}
          />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddCard()}>
          카드 추가
        </Button>

        {properties.length > 0 && (
          <Popover
            open={colPopOpen}
            onOpenChange={setColPopOpen}
            trigger="click"
            placement="bottomLeft"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <EyeOutlined />
                <span>표시할 컬럼</span>
              </div>
            }
            content={
              <ColumnSelector
                properties={properties}
                effective={effective}
                toggle={toggle}
                toggleAll={toggleAll}
              />
            }
          >
            <Tooltip title={hiddenCount > 0 ? `${hiddenCount}개 컬럼 숨김` : '컬럼 설정'}>
              <Button
                icon={<SettingOutlined />}
                style={hiddenCount > 0 ? { borderColor: '#1677ff', color: '#1677ff' } : {}}
              >
                컬럼 설정
                {hiddenCount > 0 && (
                  <span style={{
                    marginLeft: 4, fontSize: 11,
                    background: '#1677ff', color: '#fff',
                    borderRadius: 10, padding: '0 5px',
                  }}>
                    -{hiddenCount}
                  </span>
                )}
              </Button>
            </Tooltip>
          </Popover>
        )}
      </div>

      <Table
        dataSource={cards}
        columns={columns}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="small"
      />
    </div>
  );
}
