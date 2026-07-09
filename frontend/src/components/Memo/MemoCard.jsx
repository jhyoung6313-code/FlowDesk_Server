import React, { useState, useEffect, useRef } from 'react';
import { Input, Tooltip, Popconfirm, Button } from 'antd';
import {
  PushpinOutlined, PushpinFilled, DeleteOutlined, EditOutlined,
  CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import { MEMO_PALETTE, MEMO_COLOR_KEYS, memoColor } from '../../utils/memoColors';

/* ── 색상 선택 점들 ── */
export function ColorDots({ value, onChange, size = 16 }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {MEMO_COLOR_KEYS.map((k) => (
        <span
          key={k}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChange(k); }}
          title={k}
          style={{
            width: size, height: size, borderRadius: 99, cursor: 'pointer',
            background: MEMO_PALETTE[k].dot,
            boxShadow: value === k ? '0 0 0 2px #fff, 0 0 0 4px #475569' : 'none',
            transition: 'box-shadow 0.1s',
          }}
        />
      ))}
    </div>
  );
}

/**
 * 메모 카드 — 보드/리스트/컴팩트 공용. 수정 아이콘 클릭 시 카드 안에서 바로 인라인 편집.
 * props: memo, mode('board'|'list'|'compact'), onSave(id,{title,content}),
 *        onDelete(id), onTogglePin(memo), onColor(memo,color), dragHandlers(보드 전용)
 */
export default function MemoCard({
  memo, mode = 'list', onSave, onDelete, onTogglePin, onColor, dragHandlers,
}) {
  const p = memoColor(memo.color);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(memo.title || '');
  const [content, setContent] = useState(memo.content || '');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef(null);
  const compact = mode === 'compact';

  // 외부에서 메모가 갱신되면(편집 중이 아닐 때) 로컬 입력값 동기화
  useEffect(() => {
    if (!editing) {
      setTitle(memo.title || '');
      setContent(memo.content || '');
    }
  }, [memo.title, memo.content, editing]);

  const startEdit = () => {
    setTitle(memo.title || '');
    setContent(memo.content || '');
    setEditing(true);
    setTimeout(() => contentRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setTitle(memo.title || '');
    setContent(memo.content || '');
  };

  const save = async () => {
    if (!content.trim()) { contentRef.current?.focus(); return; }
    setSaving(true);
    try {
      await onSave(memo.id, { title: title.trim(), content: content.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const fontTitle = compact ? 13 : 14;
  const fontBody = compact ? 12 : 13;

  return (
    <div
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 12,
        padding: compact ? '10px 12px' : '12px 14px',
        boxShadow: mode === 'board'
          ? '0 6px 16px rgba(15,23,42,0.12)'
          : '0 1px 4px rgba(15,23,42,0.06)',
        width: mode === 'board' ? 220 : '100%',
        minHeight: mode === 'board' ? 150 : 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        userSelect: dragHandlers && !editing ? 'none' : 'auto',
      }}
    >
      {/* 헤더: 핀 + 액션 (보드형은 드래그 핸들) */}
      <div
        onMouseDown={editing ? undefined : dragHandlers?.onMouseDown}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: dragHandlers && !editing ? 'grab' : 'default',
        }}
      >
        <Tooltip title={memo.pinned ? '고정 해제' : '상단 고정'}>
          <span
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onTogglePin(memo); }}
            style={{ cursor: 'pointer', color: memo.pinned ? '#e8830c' : '#94a3b8', fontSize: 15 }}
          >
            {memo.pinned ? <PushpinFilled /> : <PushpinOutlined />}
          </span>
        </Tooltip>

        <span style={{ display: 'flex', gap: 8 }} onMouseDown={(e) => e.stopPropagation()}>
          {editing ? (
            <>
              <Tooltip title="저장">
                <span onClick={save} style={{ cursor: 'pointer', color: '#059669', fontSize: 14 }}>
                  <CheckOutlined />
                </span>
              </Tooltip>
              <Tooltip title="취소">
                <span onClick={cancelEdit} style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 14 }}>
                  <CloseOutlined />
                </span>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip title="수정">
                <span onClick={startEdit} style={{ cursor: 'pointer', color: '#64748b' }}>
                  <EditOutlined />
                </span>
              </Tooltip>
              <Popconfirm title="이 메모를 삭제할까요?" okText="삭제" cancelText="취소" onConfirm={() => onDelete(memo.id)}>
                <span style={{ cursor: 'pointer', color: '#ef4444' }}><DeleteOutlined /></span>
              </Popconfirm>
            </>
          )}
        </span>
      </div>

      {/* 본문: 보기 / 인라인 편집 전환 */}
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Input
            size="small"
            placeholder="제목 (선택)"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onPressEnter={() => contentRef.current?.focus()}
            style={{ background: 'rgba(255,255,255,0.6)', fontWeight: 700 }}
          />
          <Input.TextArea
            ref={contentRef}
            placeholder="내용"
            value={content}
            autoSize={{ minRows: 2, maxRows: 8 }}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
              if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
            }}
            style={{ background: 'rgba(255,255,255,0.6)' }}
          />
          <Button type="primary" size="small" loading={saving} onClick={save} block>
            저장 (Ctrl+Enter)
          </Button>
        </div>
      ) : (
        <div
          onDoubleClick={startEdit}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, cursor: 'text' }}
        >
          {memo.title && (
            <div style={{ fontWeight: 700, fontSize: fontTitle, color: '#1e293b', wordBreak: 'break-word' }}>
              {memo.title}
            </div>
          )}
          <div style={{
            flex: 1, fontSize: fontBody, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            ...(compact ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}),
          }}>
            {memo.content}
          </div>
        </div>
      )}

      {/* 색상 점 */}
      {!editing && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <ColorDots value={memo.color} onChange={(c) => onColor(memo, c)} size={compact ? 14 : 16} />
        </div>
      )}
    </div>
  );
}
