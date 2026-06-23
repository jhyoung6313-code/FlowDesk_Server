import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popover, Tooltip, Badge, Input, Button, Empty, message } from 'antd';
import { SnippetsOutlined, PlusOutlined, ArrowRightOutlined } from '@ant-design/icons';
import useMemoStore from '../../store/memoStore';
import MemoCard from './MemoCard';

const iconBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
  background: '#f8fafc', border: '1px solid #e2e8f0',
  transition: 'background 0.2s', color: '#6b7280', fontSize: 16,
};

/* 어느 화면에서든 상단 헤더에서 빠르게 메모를 확인/추가하는 플로팅 위젯 */
export default function MemoWidget() {
  const navigate = useNavigate();
  const { memos, fetch, create, update, remove } = useMemoStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { fetch(); }, [fetch]);

  const pinnedCount = memos.filter((m) => m.pinned).length;

  const quickAdd = async () => {
    if (!draft.trim()) return;
    setAdding(true);
    try {
      await create({ content: draft.trim(), color: 'yellow' });
      setDraft('');
    } catch {
      message.error('메모 추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleSave = (id, patch) =>
    update(id, patch).catch(() => message.error('수정에 실패했습니다.'));
  const handleDelete = (id) => remove(id).catch(() => message.error('삭제에 실패했습니다.'));
  const handleTogglePin = (m) => update(m.id, { pinned: !m.pinned }).catch(() => message.error('고정 변경 실패'));
  const handleColor = (m, color) => {
    if (m.color === color) return;
    update(m.id, { color }).catch(() => message.error('색상 변경 실패'));
  };

  const panel = (
    <div style={{ width: 320 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>메모지</span>
        <Button
          type="text" size="small"
          onClick={() => { setOpen(false); navigate('/memos'); }}
          style={{ fontSize: 12, color: '#64748b' }}
        >
          전체 보기 <ArrowRightOutlined />
        </Button>
      </div>

      {/* 빠른 추가 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <Input.TextArea
          placeholder="빠른 메모 입력..."
          value={draft}
          autoSize={{ minRows: 1, maxRows: 4 }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); quickAdd(); }
          }}
        />
        <Button
          type="primary" icon={<PlusOutlined />} loading={adding}
          onClick={quickAdd} style={{ flexShrink: 0 }}
        />
      </div>

      {/* 메모 목록 (고정 우선) */}
      {memos.length === 0 ? (
        <Empty description="메모가 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '12px 0' }} />
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginRight: -4, paddingRight: 4 }}>
          {memos.map((m) => (
            <MemoCard
              key={m.id}
              memo={m}
              mode="compact"
              onSave={handleSave}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onColor={handleColor}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      overlayStyle={{ zIndex: 1050 }}
      styles={{ body: {
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.2)', padding: '16px',
      }}}
      content={panel}
    >
      <Tooltip title="메모지" placement="bottom">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Badge count={pinnedCount} size="small" offset={[-2, 2]} color="#f5a623">
            <div style={iconBtnStyle}>
              <SnippetsOutlined />
            </div>
          </Badge>
        </div>
      </Tooltip>
    </Popover>
  );
}
