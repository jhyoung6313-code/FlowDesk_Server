import React, { useMemo, useState, useRef } from 'react';
import { Button, Card, Tag, Typography, Avatar, Tooltip, Progress, Input, Badge, Popover, Checkbox, Divider } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  CalendarOutlined, PaperClipOutlined, CommentOutlined, CheckSquareOutlined,
  WarningOutlined, EnterOutlined, SettingOutlined, EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PropertyValue from '../components/PropertyValue';
import { getAvatarColor } from '../../../utils/colors';

const { Text } = Typography;

const BACKEND = import.meta.env.DEV ? 'http://localhost:4000' : '';

const STATUS_MAP = {
  todo:        { label: '예정',   color: '#8c8c8c' },
  in_progress: { label: '진행중', color: '#1677ff' },
  review:      { label: '검토중', color: '#722ed1' },
  done:        { label: '완료',   color: '#52c41a' },
  hold:        { label: '보류',   color: '#fa8c16' },
  cancelled:   { label: '취소',   color: '#ff4d4f' },
};

const PRIORITY_MAP = {
  high:   { label: '높음', color: '#ff4d4f' },
  normal: { label: '보통', color: '#1677ff' },
  low:    { label: '낮음', color: '#8c8c8c' },
};

function getGroupProp(board) {
  if (!board.kanbanGroupByPropId) return null;
  return board.properties?.find(p => p.id === board.kanbanGroupByPropId) ?? null;
}

function getSwimlaneValues(board, cards) {
  if (!board.swimlaneGroupByPropId) return null;
  const prop = board.properties?.find(p => p.id === board.swimlaneGroupByPropId);
  if (!prop) return null;
  const opts = (prop.options ?? []).map(o => o.value);
  const used = new Set(cards.map(c => {
    const pv = c.properties?.find(pv => pv.propertyId === prop.id);
    return pv?.value || '__none__';
  }));
  const values = opts.filter(v => used.has(v));
  if (used.has('__none__')) values.push('__none__');
  return { prop, values: values.length > 0 ? values : ['__none__'] };
}

function getColumns(groupProp) {
  if (!groupProp) return [{ key: '__default__', label: '카드', color: '#1677ff' }];
  const opts = groupProp.options ?? [];
  return [
    ...opts.map(o => ({ key: o.value, label: o.value, color: o.color })),
    { key: '__none__', label: '(미지정)', color: '#bfbfbf' },
  ];
}

function getCardGroup(card, groupProp) {
  if (!groupProp) return '__default__';
  const pv = card.properties?.find(pv => pv.propertyId === groupProp.id);
  return pv?.value || '__none__';
}

function getCardSwimlane(card, swimlaneProp) {
  if (!swimlaneProp) return '__all__';
  const pv = card.properties?.find(pv => pv.propertyId === swimlaneProp.id);
  return pv?.value || '__none__';
}

function isDueOverdue(dueDate, status) {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  return dayjs(dueDate).isBefore(dayjs(), 'day');
}

function parseWipLimits(wipLimitsJson) {
  if (!wipLimitsJson) return {};
  try { return JSON.parse(wipLimitsJson); } catch { return {}; }
}

// ── 카드 표시 항목 관리 훅 ──────────────────────────────────────────────────────
function useKanbanCardDisplay(boardId, properties) {
  const storageKey = `board_${boardId}_kanban_props`;
  const allIds = properties.map(p => p.id);

  const [selectedIds, setSelectedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const valid = parsed.filter(id => allIds.includes(id));
        if (valid.length > 0) return new Set(valid);
      }
    } catch {}
    return new Set(allIds.slice(0, 2));
  });

  const toggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleAll = (checked) => {
    const next = checked ? new Set(allIds) : new Set();
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    setSelectedIds(next);
  };

  return { selectedIds, toggle, toggleAll };
}

// ── 카드 표시 항목 선택기 ───────────────────────────────────────────────────────
function CardDisplaySelector({ properties, selectedIds, toggle, toggleAll }) {
  const allChecked = properties.length > 0 && properties.every(p => selectedIds.has(p.id));
  const someChecked = properties.some(p => selectedIds.has(p.id)) && !allChecked;

  if (properties.length === 0) {
    return <Text type="secondary" style={{ fontSize: 12 }}>커스텀 속성이 없습니다.</Text>;
  }

  return (
    <div style={{ width: 200 }}>
      <Checkbox
        checked={allChecked}
        indeterminate={someChecked}
        onChange={e => toggleAll(e.target.checked)}
        style={{ fontWeight: 600 }}
      >
        전체 선택
      </Checkbox>
      <Divider style={{ margin: '6px 0' }} />
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {properties.map(prop => (
          <Checkbox
            key={prop.id}
            checked={selectedIds.has(prop.id)}
            onChange={() => toggle(prop.id)}
          >
            <span style={{ fontSize: 13 }}>{prop.name}</span>
          </Checkbox>
        ))}
      </div>
    </div>
  );
}

// ── 인라인 빠른 카드 추가 ──────────────────────────────────────────────────────
function InlineAddCard({ colKey, onAdd }) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const activate = () => {
    setActive(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const submit = () => {
    const title = value.trim();
    if (title) onAdd(colKey, title);
    setValue('');
    setActive(false);
  };

  const cancel = () => { setValue(''); setActive(false); };

  if (!active) {
    return (
      <Button
        type="text"
        block
        icon={<PlusOutlined />}
        size="small"
        style={{ marginTop: 6, color: '#8c8c8c', justifyContent: 'flex-start' }}
        onClick={activate}
      >
        카드 추가
      </Button>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      <Input
        ref={inputRef}
        size="small"
        value={value}
        onChange={e => setValue(e.target.value)}
        onPressEnter={submit}
        onKeyDown={e => e.key === 'Escape' && cancel()}
        placeholder="카드 제목 입력 후 Enter"
        style={{ marginBottom: 4 }}
      />
      <div style={{ display: 'flex', gap: 4 }}>
        <Button size="small" type="primary" icon={<EnterOutlined />} onClick={submit} disabled={!value.trim()}>
          추가
        </Button>
        <Button size="small" onClick={cancel}>취소</Button>
      </div>
    </div>
  );
}

// ── 컬럼 헤더 ─────────────────────────────────────────────────────────────────
function ColumnHeader({ col, count, wipLimit, onAddCard }) {
  const overWip = wipLimit != null && count > wipLimit;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
        <Text strong style={{ fontSize: 12, color: 'var(--fd-text-primary)', letterSpacing: 0.2 }}>{col.label}</Text>
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '1px 6px', borderRadius: 8,
          background: overWip ? '#fff2f0' : `${col.color}15`,
          color: overWip ? '#ff4d4f' : col.color,
          border: `1px solid ${overWip ? '#ffccc7' : `${col.color}30`}`,
        }}>
          {count}{wipLimit != null && <span style={{ opacity: 0.6 }}>/{wipLimit}</span>}
        </span>
        {overWip && <Tooltip title="WIP 한도 초과"><WarningOutlined style={{ color: '#ff4d4f', fontSize: 11 }} /></Tooltip>}
      </div>
      <Button
        type="text"
        size="small"
        icon={<PlusOutlined />}
        style={{ color: '#bbb', width: 22, height: 22, padding: 0 }}
        onClick={() => onAddCard(col.key === '__none__' ? '' : col.key)}
      />
    </div>
  );
}

// ── 스위밍 레인 헤더 ──────────────────────────────────────────────────────────
function SwimlaneHeader({ label, color, count }) {
  return (
    <div style={{
      padding: '4px 12px',
      background: color ? `${color}22` : '#f0f0f0',
      borderLeft: `3px solid ${color || '#8c8c8c'}`,
      borderRadius: '0 4px 4px 0',
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <Text strong style={{ fontSize: 12 }}>{label}</Text>
      <Text type="secondary" style={{ fontSize: 11 }}>({count}장)</Text>
    </div>
  );
}

export default function KanbanView({ board, cards, onAddCard, onEditCard, onDeleteCard, onCardDrop, onQuickAdd, readonly }) {
  const groupProp = getGroupProp(board);
  const columns = getColumns(groupProp);
  const swimlaneData = getSwimlaneValues(board, cards);
  const wipLimits = parseWipLimits(board.wipLimitsJson);

  const grouped = useMemo(() => {
    const map = {};
    columns.forEach(col => { map[col.key] = []; });
    cards.forEach(card => {
      const key = getCardGroup(card, groupProp);
      if (map[key]) map[key].push(card);
      else if (map['__none__']) map['__none__'].push(card);
    });
    return map;
  }, [cards, columns, groupProp]);

  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [displayPopOpen, setDisplayPopOpen] = useState(false);

  const handleDragStart = (e, card) => {
    setDragging(card.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(colKey);
  };

  const handleDrop = (e, colKey) => {
    e.preventDefault();
    if (dragging && groupProp && colKey !== '__none__') {
      onCardDrop?.(dragging, groupProp.id, colKey === '__default__' ? '' : colKey);
    }
    setDragging(null);
    setDragOver(null);
  };

  const handleQuickAdd = (colKey, title) => {
    const groupValue = colKey === '__none__' || colKey === '__default__' ? '' : colKey;
    onQuickAdd?.(groupValue, title);
  };

  const cardSelectableProps = (board.properties ?? [])
    .filter(p => p.id !== board.kanbanGroupByPropId && p.id !== board.swimlaneGroupByPropId);

  const { selectedIds, toggle, toggleAll } = useKanbanCardDisplay(board.id, cardSelectableProps);
  const visibleProps = cardSelectableProps.filter(p => selectedIds.has(p.id));

  const swimlaneValues = swimlaneData?.values ?? ['__all__'];

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
      {cardSelectableProps.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Popover
            open={displayPopOpen}
            onOpenChange={setDisplayPopOpen}
            trigger="click"
            placement="bottomLeft"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <EyeOutlined />
                <span>카드 표시 항목 선택</span>
              </div>
            }
            content={
              <CardDisplaySelector
                properties={cardSelectableProps}
                selectedIds={selectedIds}
                toggle={toggle}
                toggleAll={toggleAll}
              />
            }
          >
            <Button
              size="small"
              icon={<SettingOutlined />}
              style={visibleProps.length < cardSelectableProps.length ? { borderColor: '#1677ff', color: '#1677ff' } : {}}
            >
              카드 표시 항목
              <span style={{ marginLeft: 6, fontSize: 11, color: '#888' }}>
                ({visibleProps.length}/{cardSelectableProps.length})
              </span>
            </Button>
          </Popover>
        </div>
      )}
      {swimlaneValues.map((swimVal, swimIdx) => {
        const swimLabel = swimVal === '__all__' ? null
          : swimVal === '__none__' ? '(미지정)'
          : swimVal;
        const swimColor = swimlaneData?.prop?.options?.find(o => o.value === swimVal)?.color;

        const laneCards = swimVal === '__all__'
          ? cards
          : cards.filter(c => getCardSwimlane(c, swimlaneData?.prop) === swimVal);

        const laneGrouped = {};
        columns.forEach(col => { laneGrouped[col.key] = []; });
        laneCards.forEach(card => {
          const key = getCardGroup(card, groupProp);
          if (laneGrouped[key]) laneGrouped[key].push(card);
          else if (laneGrouped['__none__']) laneGrouped['__none__'].push(card);
        });

        return (
          <div key={swimVal} style={{ marginBottom: swimlaneData ? 24 : 0 }}>
            {swimlaneData && swimLabel && (
              <SwimlaneHeader label={swimLabel} color={swimColor} count={laneCards.length} />
            )}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {columns.map(col => {
                const colCards = laneGrouped[col.key] ?? [];
                const wipLimit = wipLimits[col.key] ?? wipLimits[col.label] ?? null;
                const overWip = wipLimit != null && colCards.length > wipLimit;

                return (
                  <div
                    key={col.key}
                    onDragOver={e => handleDragOver(e, col.key)}
                    onDrop={e => handleDrop(e, col.key)}
                    onDragLeave={() => setDragOver(null)}
                    style={{
                      minWidth: 270,
                      maxWidth: 310,
                      flex: '0 0 285px',
                      background: dragOver === col.key ? '#e6f4ff' : overWip ? '#fff2f0' : '#f7f8fa',
                      borderRadius: 12,
                      padding: '10px 10px 6px',
                      transition: 'background 0.15s',
                      border: dragOver === col.key ? '2px dashed #1677ff'
                        : overWip ? '2px solid #ffccc7'
                        : '2px solid transparent',
                    }}
                  >
                    {swimIdx === 0 && (
                      <ColumnHeader
                        col={col}
                        count={grouped[col.key]?.length ?? 0}
                        wipLimit={wipLimit}
                        onAddCard={onAddCard ?? (() => {})}
                      />
                    )}

                    {colCards.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: '#bbb', fontSize: 12 }}>
                        카드 없음
                      </div>
                    ) : (
                      colCards.map(card => (
                        <BoardCard
                          key={card.id}
                          card={card}
                          dragging={dragging === card.id}
                          visibleProps={visibleProps}
                          onDragStart={!readonly ? handleDragStart : null}
                          onEdit={() => onEditCard(card)}
                          onDelete={onDeleteCard ? () => {
                            if (window.confirm(`"${card.title}" 카드를 삭제할까요?`)) onDeleteCard(card.id);
                          } : null}
                        />
                      ))
                    )}

                    {!readonly && onQuickAdd && (
                      <InlineAddCard
                        colKey={col.key}
                        onAdd={handleQuickAdd}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ card, dragging, visibleProps, onDragStart, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const overdue = isDueOverdue(card.dueDate, card.status);
  const statusInfo = STATUS_MAP[card.status] ?? { label: card.status, color: '#8c8c8c' };
  const priorityInfo = PRIORITY_MAP[card.priority] ?? { label: card.priority, color: '#8c8c8c' };
  const assignees = (card.assignees ?? []).filter(a => a.type === 'assignee');
  const checkedCount = (card.checklists ?? []).filter(c => c.checked).length;
  const totalCheck = (card.checklists ?? []).length;
  const isBlocked = (card.dependsOn ?? []).some(d => d.blocking?.status !== 'done');

  const chipStyle = (color) => ({
    fontSize: 10, fontWeight: 600,
    padding: '1px 7px', borderRadius: 10,
    background: `${color}18`, color,
    border: `1px solid ${color}30`,
    whiteSpace: 'nowrap',
    display: 'inline-block',
  });

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? e => onDragStart(e, card) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onEdit}
      style={{
        opacity: dragging ? 0.4 : 1,
        marginBottom: 8,
        cursor: onDragStart ? 'grab' : 'pointer',
        background: 'var(--fd-surface)',
        borderRadius: 10,
        border: `1px solid ${hover ? '#d0d0d0' : '#ebebeb'}`,
        boxShadow: hover ? '0 4px 14px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.12s',
        transform: hover ? 'translateY(-1px)' : 'none',
        position: 'relative',
      }}
    >
      {/* 커버 이미지 or 커버 컬러 */}
      {card.coverImageUrl && (
        <div style={{ height: 72, background: `url(${BACKEND}${card.coverImageUrl}) center/cover` }} />
      )}
      {!card.coverImageUrl && card.coverColor && (
        <div style={{ height: 6, background: card.coverColor }} />
      )}

      {/* 왼쪽 상태 색상 바 (커버 없을 때) */}
      {!card.coverColor && !card.coverImageUrl && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: overdue ? '#ff4d4f' : isBlocked ? '#faad14' : statusInfo.color,
        }} />
      )}

      <div style={{ padding: '9px 11px 10px 14px' }}>
        {/* 헤더: 카드번호 + 액션 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {card.cardNumber && (
              <span style={{ fontSize: 10, color: '#ccc', fontFamily: 'monospace' }}>#{card.cardNumber}</span>
            )}
            {isBlocked && <Tooltip title="선행 카드 완료 필요"><span style={{ fontSize: 11 }}>⛔</span></Tooltip>}
          </div>
          <div style={{ display: 'flex', opacity: hover ? 1 : 0, transition: 'opacity 0.12s' }}>
            <Button type="text" size="small" icon={<EditOutlined />} style={{ padding: '0 3px', height: 18 }}
              onClick={(e) => { e.stopPropagation(); onEdit(); }} />
            {onDelete && (
              <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ padding: '0 3px', height: 18 }}
                onClick={(e) => { e.stopPropagation(); onDelete(); }} />
            )}
          </div>
        </div>

        {/* 제목 */}
        <div style={{ fontSize: 13, fontWeight: 600, color: overdue ? '#ff4d4f' : '#1a1a1a', lineHeight: 1.45, marginBottom: 8, wordBreak: 'break-word' }}>
          {card.title}
        </div>

        {/* 상태 / 우선순위 / 커스텀 속성 chips */}
        {(card.status || (card.priority && card.priority !== 'normal') || visibleProps.some(p => card.properties?.find(pv => pv.propertyId === p.id)?.value)) && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={chipStyle(statusInfo.color)}>{statusInfo.label}</span>
            {card.priority && card.priority !== 'normal' && (
              <span style={chipStyle(priorityInfo.color)}>{priorityInfo.label}</span>
            )}
            {visibleProps.map(prop => {
              const pv = card.properties?.find(p => p.propertyId === prop.id);
              if (!pv?.value) return null;
              return (
                <span key={prop.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--fd-surface-sunken)', color: 'var(--fd-text-secondary)', border: '1px solid var(--fd-border)', display: 'inline-block' }}>
                  <PropertyValue property={prop} value={pv.value} />
                </span>
              );
            })}
          </div>
        )}

        {/* 진행도 */}
        {card.progress > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#bbb' }}>진행도</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: card.progress === 100 ? '#52c41a' : '#1677ff' }}>{card.progress}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--fd-surface-muted)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${card.progress}%`, background: card.progress === 100 ? '#52c41a' : '#1677ff', borderRadius: 2 }} />
            </div>
          </div>
        )}

        {/* 하단 메타 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {(card.startDate || card.dueDate) && (
              <span style={{ fontSize: 10, color: overdue ? '#ff4d4f' : '#bbb', display: 'flex', alignItems: 'center', gap: 3 }}>
                <CalendarOutlined style={{ fontSize: 9 }} />
                {card.dueDate ? dayjs(card.dueDate).format('MM/DD') : dayjs(card.startDate).format('MM/DD')}
              </span>
            )}
            {totalCheck > 0 && (
              <Tooltip title={`체크리스트 ${checkedCount}/${totalCheck}`}>
                <span style={{ fontSize: 10, color: checkedCount === totalCheck ? '#52c41a' : '#bbb', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CheckSquareOutlined style={{ fontSize: 9 }} /> {checkedCount}/{totalCheck}
                </span>
              </Tooltip>
            )}
            {(card.comments ?? []).length > 0 && (
              <Tooltip title={`댓글 ${card.comments.length}개`}>
                <span style={{ fontSize: 10, color: '#bbb', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CommentOutlined style={{ fontSize: 9 }} /> {card.comments.length}
                </span>
              </Tooltip>
            )}
            {(card.attachments ?? []).length > 0 && (
              <Tooltip title={`첨부파일 ${card.attachments.length}개`}>
                <span style={{ fontSize: 10, color: '#bbb', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PaperClipOutlined style={{ fontSize: 9 }} /> {card.attachments.length}
                </span>
              </Tooltip>
            )}
          </div>
          <Avatar.Group max={{ count: 3 }} size={20}>
            {assignees.map(a => (
              <Tooltip key={a.id} title={a.user?.displayName}>
                <Avatar size={20} style={{ backgroundColor: getAvatarColor(a.userId ?? a.user?.id), fontSize: 10 }}>
                  {a.user?.displayName?.slice(0, 1)}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        </div>
      </div>
    </div>
  );
}
