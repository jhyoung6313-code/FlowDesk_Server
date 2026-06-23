import React, { useEffect, useRef, useState } from 'react';
import {
  Button, Segmented, Input, Modal, Form, Empty, Spin, message,
} from 'antd';
import {
  PlusOutlined, AppstoreOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import useMemoStore from '../../store/memoStore';
import MemoCard, { ColorDots } from '../../components/Memo/MemoCard';

const VIEW_KEY = 'flowdesk.memos.view';

export default function MemosPage() {
  const { memos, loading, loaded, fetch, create, update, remove, setPosLocal } = useMemoStore();
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'board');
  const [modalOpen, setModalOpen] = useState(false);
  const [formColor, setFormColor] = useState('yellow');
  const [form] = Form.useForm();
  const boardRef = useRef(null);

  useEffect(() => { fetch(true); }, [fetch]);

  const changeView = (v) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  // ── 새 메모 생성 모달 ──
  const openCreate = () => {
    setFormColor('yellow');
    form.resetFields();
    setModalOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const offset = (memos.length % 6) * 24;
      await create({
        title: values.title,
        content: values.content,
        color: formColor,
        posX: 16 + offset,
        posY: 16 + offset,
      });
      message.success('메모를 추가했습니다.');
      setModalOpen(false);
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장에 실패했습니다.');
    }
  };

  // ── 카드 핸들러 ──
  const handleSave = async (id, patch) => {
    try {
      await update(id, patch);
      message.success('메모를 수정했습니다.');
    } catch {
      message.error('수정에 실패했습니다.');
    }
  };
  const handleDelete = (id) => remove(id).catch(() => message.error('삭제에 실패했습니다.'));
  const handleTogglePin = (memo) => update(memo.id, { pinned: !memo.pinned }).catch(() => message.error('고정 변경 실패'));
  const handleColor = (memo, color) => {
    if (memo.color === color) return;
    update(memo.id, { color }).catch(() => message.error('색상 변경 실패'));
  };

  // ── 보드형 드래그 이동 ──
  const startDrag = (memo) => (e) => {
    if (e.button !== 0) return;
    const rect = boardRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - memo.posX;
    const offsetY = e.clientY - rect.top - memo.posY;
    let last = { x: memo.posX, y: memo.posY };

    const onMove = (ev) => {
      const x = Math.max(0, Math.round(ev.clientX - rect.left - offsetX));
      const y = Math.max(0, Math.round(ev.clientY - rect.top - offsetY));
      last = { x, y };
      setPosLocal(memo.id, x, y);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (last.x !== memo.posX || last.y !== memo.posY) {
        update(memo.id, { posX: last.x, posY: last.y }).catch(() => {});
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>메모지</h2>
        <Segmented
          value={view}
          onChange={changeView}
          options={[
            { value: 'board', icon: <AppstoreOutlined />, label: '보드' },
            { value: 'list', icon: <UnorderedListOutlined />, label: '사이드' },
          ]}
        />
      </div>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
        새 메모
      </Button>
    </div>
  );

  if (loading && !loaded) {
    return <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {header}

      {memos.length === 0 ? (
        <Empty description="메모가 없습니다. 새 메모를 추가해 보세요." style={{ marginTop: 80 }} />
      ) : view === 'board' ? (
        // ── 포스트잇 보드형 ──
        <div
          ref={boardRef}
          style={{
            position: 'relative', flex: 1, minHeight: 480,
            background: 'repeating-linear-gradient(45deg, #f8fafc, #f8fafc 12px, #f1f5f9 12px, #f1f5f9 24px)',
            border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'auto',
          }}
        >
          {memos.map((m) => (
            <div
              key={m.id}
              style={{
                position: 'absolute', left: m.posX, top: m.posY,
                zIndex: m.pinned ? 5 : 1,
                rotate: m.pinned ? '0deg' : '-1deg',
              }}
            >
              <MemoCard
                memo={m}
                mode="board"
                onSave={handleSave}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                onColor={handleColor}
                dragHandlers={{ onMouseDown: startDrag(m) }}
              />
            </div>
          ))}
        </div>
      ) : (
        // ── 심플 사이드 메모형 ──
        <div style={{ flex: 1, overflow: 'auto', maxWidth: 420 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {memos.map((m) => (
              <MemoCard
                key={m.id}
                memo={m}
                mode="list"
                onSave={handleSave}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                onColor={handleColor}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 새 메모 생성 모달 ── */}
      <Modal
        title="새 메모"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
        width={460}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="title" label="제목 (선택)">
            <Input placeholder="제목" maxLength={200} />
          </Form.Item>
          <Form.Item name="content" label="내용" rules={[{ required: true, message: '내용을 입력하세요.' }]}>
            <Input.TextArea rows={5} placeholder="메모 내용을 입력하세요" />
          </Form.Item>
          <Form.Item label="색상">
            <ColorDots value={formColor} onChange={setFormColor} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
