import React, { useState } from 'react';
import {
  Drawer, Button, Input, Select, Tag, Space, Typography, Popconfirm, message, Divider, Checkbox, Row, Col,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined, HolderOutlined,
} from '@ant-design/icons';
import { createProperty, updateProperty, deleteProperty } from '../../../api/boards';

const { Text } = Typography;

export const BUILTIN_COLS = [
  { key: 'status',      label: '상태' },
  { key: 'priority',    label: '우선순위' },
  { key: 'assignees',   label: '담당자' },
  { key: 'dueDate',     label: '마감일' },
  { key: 'startDate',   label: '시작일' },
  { key: 'progress',    label: '진행도 (%)' },
  { key: 'description', label: '설명' },
  { key: 'checklists',  label: '체크리스트' },
  { key: 'comments',    label: '댓글' },
  { key: 'attachments', label: '첨부파일' },
  { key: 'tags',        label: '태그' },
];

const PROPERTY_TYPES = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'select', label: '단일 선택' },
  { value: 'multiselect', label: '다중 선택' },
  { value: 'date', label: '날짜' },
  { value: 'user', label: '사용자' },
  { value: 'checkbox', label: '체크박스' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: '이메일' },
  { value: 'phone', label: '전화번호' },
  { value: 'created_time', label: '생성일 (자동)', auto: true },
  { value: 'created_by', label: '생성자 (자동)', auto: true },
];

const OPTION_COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#fa8c16', '#eb2f96', '#bfbfbf'];

function OptionEditor({ options, onChange }) {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [newColor, setNewColor] = useState(OPTION_COLORS[0]);

  const add = () => {
    if (!newVal.trim()) return;
    const id = Date.now().toString();
    onChange([...options, { id, value: newVal.trim(), color: newColor }]);
    setNewVal('');
    setNewColor(OPTION_COLORS[0]);
    setAdding(false);
  };

  const remove = (id) => onChange(options.filter(o => o.id !== id));

  return (
    <div style={{ marginTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>옵션</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {options.map(o => (
          <Tag
            key={o.id}
            color={o.color}
            closable
            onClose={() => remove(o.id)}
            style={{ marginBottom: 4 }}
          >
            {o.value}
          </Tag>
        ))}
      </div>
      {adding ? (
        <Space style={{ marginTop: 8 }} wrap>
          <Input
            size="small"
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onPressEnter={add}
            placeholder="옵션명"
            style={{ width: 100 }}
          />
          <div style={{ display: 'flex', gap: 3 }}>
            {OPTION_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 16, height: 16, borderRadius: 3, background: c, cursor: 'pointer',
                  border: newColor === c ? '2px solid #000' : '2px solid transparent',
                }}
              />
            ))}
          </div>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={add} />
          <Button size="small" icon={<CloseOutlined />} onClick={() => setAdding(false)} />
        </Space>
      ) : (
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          style={{ marginTop: 4 }}
          onClick={() => setAdding(true)}
        >
          옵션 추가
        </Button>
      )}
    </div>
  );
}

function PropertyRow({ prop, boardId, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(prop.name);
  const [options, setOptions] = useState(prop.options ?? []);
  const [saving, setSaving] = useState(false);

  const hasOptions = prop.type === 'select' || prop.type === 'multiselect';

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateProperty(boardId, prop.id, {
        name,
        options: hasOptions ? options : null,
      });
      onUpdated(updated);
      setEditing(false);
    } catch {
      message.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    try {
      await deleteProperty(boardId, prop.id);
      onDeleted(prop.id);
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const typeLabel = PROPERTY_TYPES.find(t => t.value === prop.type)?.label ?? prop.type;

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      {editing ? (
        <div>
          <Space.Compact style={{ width: '100%', marginBottom: hasOptions ? 8 : 0 }}>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="primary" loading={saving} onClick={save} icon={<CheckOutlined />} />
            <Button onClick={() => { setEditing(false); setName(prop.name); setOptions(prop.options ?? []); }} icon={<CloseOutlined />} />
          </Space.Compact>
          {hasOptions && <OptionEditor options={options} onChange={setOptions} />}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>{prop.name}</Text>
            <Tag style={{ marginLeft: 8, fontSize: 11 }}>{typeLabel}</Tag>
            {hasOptions && (
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(prop.options ?? []).map(o => (
                  <Tag key={o.id} color={o.color} style={{ fontSize: 11, margin: 0 }}>{o.value}</Tag>
                ))}
              </div>
            )}
          </div>
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} />
            <Popconfirm
              title="속성을 삭제하면 모든 카드의 해당 값도 삭제됩니다."
              onConfirm={del}
              okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </div>
      )}
    </div>
  );
}

export default function PropertyEditor({ open, onClose, boardId, properties, onPropertiesChange, builtinCols, onBuiltinColsChange }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newOptions, setNewOptions] = useState([]);
  const [creating, setCreating] = useState(false);

  const handleBuiltinToggle = (key) => {
    const next = new Set(builtinCols ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onBuiltinColsChange?.(next);
  };

  const hasOptions = newType === 'select' || newType === 'multiselect';

  const handleCreate = async () => {
    if (!newName.trim()) { message.warning('속성 이름을 입력하세요.'); return; }
    setCreating(true);
    try {
      const prop = await createProperty(boardId, {
        name: newName.trim(),
        type: newType,
        options: hasOptions ? newOptions : null,
      });
      onPropertiesChange([...properties, prop]);
      setNewName('');
      setNewType('text');
      setNewOptions([]);
      setAdding(false);
    } catch {
      message.error('속성 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdated = (updated) => {
    onPropertiesChange(properties.map(p => p.id === updated.id ? updated : p));
  };

  const handleDeleted = (id) => {
    onPropertiesChange(properties.filter(p => p.id !== id));
  };

  return (
    <Drawer
      title="속성 관리"
      open={open}
      onClose={onClose}
      width={380}
      placement="right"
    >
      {/* ── 기본 항목 (카드 내장 필드) ── */}
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
          기본 항목 (그리드 컬럼 표시)
        </Text>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
          {BUILTIN_COLS.map(col => (
            <Checkbox
              key={col.key}
              checked={builtinCols?.has(col.key) ?? false}
              onChange={() => handleBuiltinToggle(col.key)}
            >
              <span style={{ fontSize: 13 }}>{col.label}</span>
            </Checkbox>
          ))}
        </div>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* ── 커스텀 속성 ── */}
      <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
        커스텀 속성
      </Text>

      {properties.map(prop => (
        <PropertyRow
          key={prop.id}
          prop={prop}
          boardId={boardId}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      ))}

      <Divider />

      {adding ? (
        <div>
          <Space style={{ width: '100%', marginBottom: 8 }}>
            <Input
              placeholder="속성 이름"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ flex: 1 }}
            />
            <Select value={newType} onChange={setNewType} style={{ width: 120 }}>
              {PROPERTY_TYPES.map(t => (
                <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>
              ))}
            </Select>
          </Space>
          {hasOptions && <OptionEditor options={newOptions} onChange={setNewOptions} />}
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" loading={creating} onClick={handleCreate}>추가</Button>
            <Button onClick={() => { setAdding(false); setNewName(''); setNewType('text'); setNewOptions([]); }}>
              취소
            </Button>
          </Space>
        </div>
      ) : (
        <Button type="dashed" icon={<PlusOutlined />} block onClick={() => setAdding(true)}>
          새 속성 추가
        </Button>
      )}
    </Drawer>
  );
}
