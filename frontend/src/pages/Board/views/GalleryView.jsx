import React, { useState } from 'react';
import { Col, Row, Button, Typography, Tooltip, Avatar, Empty, Popover, Checkbox, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CalendarOutlined, SettingOutlined, EyeOutlined } from '@ant-design/icons';
import PropertyValue from '../components/PropertyValue';
import { getAvatarColor } from '../../../utils/colors';
import dayjs from 'dayjs';

const { Text } = Typography;

const BACKEND = import.meta.env.DEV ? 'http://localhost:4000' : '';

// ── 갤러리 카드 표시 항목 훅 ────────────────────────────────────────────────────
function useGalleryCardDisplay(boardId, properties) {
  const storageKey = `board_${boardId}_gallery_props`;
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
    return new Set(allIds.slice(0, 3));
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

function GalleryCard({ card, visibleProps, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const statusInfo = STATUS_MAP[card.status] ?? { label: card.status, color: '#8c8c8c' };
  const priorityInfo = PRIORITY_MAP[card.priority] ?? { label: card.priority, color: '#8c8c8c' };
  const assignees = (card.assignees ?? []).filter(a => a.type === 'assignee');
  const overdue = card.dueDate && card.status !== 'done' && card.status !== 'cancelled'
    && dayjs(card.dueDate).isBefore(dayjs(), 'day');

  const chipStyle = (color) => ({
    fontSize: 10, fontWeight: 600,
    padding: '2px 8px', borderRadius: 10,
    background: `${color}15`, color,
    border: `1px solid ${color}25`,
    display: 'inline-block',
  });

  return (
    <Col xs={24} sm={12} md={8} lg={6}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onEdit}
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          cursor: 'pointer',
          background: '#fff',
          border: `1px solid ${hover ? '#d0d0d0' : '#ebebeb'}`,
          boxShadow: hover ? '0 6px 18px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.05)',
          transform: hover ? 'translateY(-2px)' : 'none',
          transition: 'all 0.15s',
          position: 'relative',
        }}
      >
        {/* 커버 영역 */}
        <div style={{
          height: card.coverImageUrl ? 110 : 80,
          background: card.coverImageUrl
            ? `url(${BACKEND}${card.coverImageUrl}) center/cover`
            : card.coverColor || `linear-gradient(135deg, ${statusInfo.color}22, ${statusInfo.color}08)`,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
        }}>
          {/* 상태 색상 좌측 바 (커버 없을 때) */}
          {!card.coverColor && !card.coverImageUrl && (
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: statusInfo.color }} />
          )}
          {/* hover 시 액션 버튼 */}
          {hover && (
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                style={{ background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
              >
                <EditOutlined style={{ fontSize: 12, color: '#555' }} />
              </button>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`"${card.title}" 카드를 삭제할까요?`)) onDelete(card.id); }}
                  style={{ background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
                >
                  <DeleteOutlined style={{ fontSize: 12, color: '#ff4d4f' }} />
                </button>
              )}
            </div>
          )}
          {/* 카드번호 */}
          {card.cardNumber && (
            <span style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '1px 5px', borderRadius: 4 }}>
              #{card.cardNumber}
            </span>
          )}
        </div>

        {/* 콘텐츠 */}
        <div style={{ padding: '12px 14px 14px' }}>
          {/* 제목 */}
          <div style={{ fontWeight: 700, fontSize: 13, color: overdue ? '#ff4d4f' : '#1a1a1a', lineHeight: 1.45, marginBottom: 6, wordBreak: 'break-word' }}>
            {card.title}
          </div>

          {/* 설명 */}
          {card.description && (
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {card.description}
            </div>
          )}

          {/* 속성 chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            <span style={chipStyle(statusInfo.color)}>{statusInfo.label}</span>
            {card.priority && card.priority !== 'normal' && (
              <span style={chipStyle(priorityInfo.color)}>{priorityInfo.label}</span>
            )}
            {visibleProps.map(prop => {
              const pv = card.properties?.find(p => p.propertyId === prop.id);
              if (!pv?.value) return null;
              return (
                <span key={prop.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#f5f5f5', color: '#666', border: '1px solid #e8e8e8', display: 'inline-block' }}>
                  <PropertyValue property={prop} value={pv.value} />
                </span>
              );
            })}
          </div>

          {/* 하단 메타 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {card.dueDate && (
                <span style={{ fontSize: 10, color: overdue ? '#ff4d4f' : '#bbb', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CalendarOutlined style={{ fontSize: 9 }} />
                  {dayjs(card.dueDate).format('MM/DD')}
                </span>
              )}
              {(card.checklists ?? []).length > 0 && (
                <span style={{ fontSize: 10, color: '#bbb' }}>
                  ☑ {card.checklists.filter(c => c.checked).length}/{card.checklists.length}
                </span>
              )}
            </div>
            <Avatar.Group maxCount={3} size={20}>
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
    </Col>
  );
}

export default function GalleryView({ board, cards, onAddCard, onEditCard, onDeleteCard }) {
  const allProperties = board.properties ?? [];
  const { selectedIds, toggle, toggleAll } = useGalleryCardDisplay(board.id, allProperties);
  const visibleProps = allProperties.filter(p => selectedIds.has(p.id));
  const [displayPopOpen, setDisplayPopOpen] = useState(false);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddCard()}>카드 추가</Button>
        {allProperties.length > 0 && (
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
                properties={allProperties}
                selectedIds={selectedIds}
                toggle={toggle}
                toggleAll={toggleAll}
              />
            }
          >
            <Button
              size="small"
              icon={<SettingOutlined />}
              style={visibleProps.length < allProperties.length ? { borderColor: '#1677ff', color: '#1677ff' } : {}}
            >
              카드 표시 항목
              <span style={{ marginLeft: 6, fontSize: 11, color: '#888' }}>
                ({visibleProps.length}/{allProperties.length})
              </span>
            </Button>
          </Popover>
        )}
      </div>
      {cards.length === 0
        ? <Empty description="카드가 없습니다." style={{ marginTop: 40 }} />
        : (
          <Row gutter={[16, 16]}>
            {cards.map(card => (
              <GalleryCard
                key={card.id}
                card={card}
                visibleProps={visibleProps}
                onEdit={() => onEditCard(card)}
                onDelete={onDeleteCard}
              />
            ))}
          </Row>
        )
      }
    </div>
  );
}
