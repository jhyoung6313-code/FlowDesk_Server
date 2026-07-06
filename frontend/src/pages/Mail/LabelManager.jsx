import { useState, useEffect } from 'react';
import { Modal, Input, Button, Space, Typography, message, Popconfirm, ColorPicker, theme as antTheme } from 'antd';
import { PlusOutlined, DeleteOutlined, TagOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons';
import { getMailLabels, createMailLabel, updateMailLabel, deleteMailLabel } from '../../api/mail';

const { Text } = Typography;
const { useToken } = antTheme;

const PRESET_COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

export default function LabelManager({ open, onClose, onChanged }) {
  const { token } = useToken();
  const [labels, setLabels] = useState([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#1677ff');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#1677ff');

  const reload = async () => {
    try { setLabels(await getMailLabels()); } catch {}
  };

  useEffect(() => { if (open) reload(); }, [open]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createMailLabel(newName.trim(), newColor);
      setNewName('');
      setNewColor('#1677ff');
      await reload();
      onChanged?.();
    } catch (e) { message.error(e.response?.data?.error || '라벨 추가 실패'); }
  };

  const startEdit = (lb) => { setEditId(lb.id); setEditName(lb.name); setEditColor(lb.color); };

  const handleUpdate = async () => {
    if (!editName.trim()) return;
    try {
      await updateMailLabel(editId, { name: editName.trim(), color: editColor });
      setEditId(null);
      await reload();
      onChanged?.();
    } catch (e) { message.error(e.response?.data?.error || '수정 실패'); }
  };

  const handleDelete = async (id) => {
    try { await deleteMailLabel(id); await reload(); onChanged?.(); }
    catch (e) { message.error(e.response?.data?.error || '삭제 실패'); }
  };

  const colorOf = (c) => (typeof c === 'string' ? c : c?.toHexString?.() || '#1677ff');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={<Space><TagOutlined style={{ color: token.colorPrimary }} />라벨 관리</Space>}
      footer={<Button onClick={onClose}>닫기</Button>}
      width={460}
    >
      {/* 새 라벨 추가 */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16,
        padding: '12px', background: token.colorFillAlter, borderRadius: 8,
      }}>
        <ColorPicker
          value={newColor}
          presets={[{ label: '추천', colors: PRESET_COLORS }]}
          onChange={(c) => setNewColor(colorOf(c))}
          size="small"
        />
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="새 라벨 이름"
          onPressEnter={handleCreate}
          size="small"
          style={{ flex: 1 }}
          maxLength={50}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} size="small">추가</Button>
      </div>

      {/* 라벨 목록 */}
      {labels.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>아직 라벨이 없습니다. 위에서 추가하세요.</Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {labels.map(lb => (
            <div key={lb.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6,
            }}>
              {editId === lb.id ? (
                <>
                  <ColorPicker value={editColor} presets={[{ label: '추천', colors: PRESET_COLORS }]} onChange={(c) => setEditColor(colorOf(c))} size="small" />
                  <Input value={editName} onChange={e => setEditName(e.target.value)} size="small" style={{ flex: 1 }} onPressEnter={handleUpdate} />
                  <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleUpdate} />
                  <Button size="small" onClick={() => setEditId(null)}>취소</Button>
                </>
              ) : (
                <>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: lb.color, flexShrink: 0 }} />
                  <Text style={{ flex: 1, fontSize: 13 }}>{lb.name}</Text>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => startEdit(lb)} />
                  <Popconfirm title="라벨을 삭제하시겠습니까?" onConfirm={() => handleDelete(lb.id)} okText="삭제" cancelText="취소">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </>
              )}
            </div>
          ))}
        </Space>
      )}
    </Modal>
  );
}
