import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Space, Typography, Popconfirm, message,
  Modal, Form, Input, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TagOutlined } from '@ant-design/icons';
import { getTags, createTag, updateTag, deleteTag } from '../../api/tags';

const PRESET_COLORS = [
  '#f5222d', '#fa541c', '#fa8c16', '#fadb14',
  '#52c41a', '#13c2c2', '#1677ff', '#722ed1',
  '#eb2f96', '#8c8c8c',
];

export default function TagsPage() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving]   = useState(false);
  const [pickerColor, setPickerColor] = useState('#1677ff');

  const load = useCallback(() => {
    setLoading(true);
    getTags()
      .then(setItems)
      .catch(() => message.error('태그 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setPickerColor('#1677ff');
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setPickerColor(record.color);
    form.setFieldsValue({ name: record.name });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const data = { name: values.name.trim(), color: pickerColor };

      if (editing) {
        await updateTag(editing.id, data);
        message.success('수정되었습니다.');
      } else {
        await createTag(data);
        message.success('태그가 추가되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTag(id);
      message.success('삭제되었습니다.');
      load();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const columns = [
    {
      title: '태그',
      key: 'tag',
      render: (_, r) => (
        <Tag
          icon={<TagOutlined />}
          style={{
            backgroundColor: r.color + '22',
            borderColor: r.color,
            color: r.color,
            fontWeight: 500,
          }}
        >
          {r.name}
        </Tag>
      ),
    },
    {
      title: '색상',
      dataIndex: 'color',
      key: 'color',
      render: (v) => (
        <Space size={4}>
          <span style={{
            display: 'inline-block', width: 18, height: 18,
            borderRadius: 4, backgroundColor: v, border: '1px solid #d9d9d9',
          }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '관리',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>태그 관리</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>태그 추가</Button>
      </Space>

      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editing ? '태그 수정' : '태그 추가'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="태그명" rules={[{ required: true, message: '태그명을 입력하세요.' }]}>
            <Input placeholder="예: 긴급, 검토필요, 외부요청" maxLength={50} />
          </Form.Item>
          <Form.Item label="색상">
            <Space wrap>
              {PRESET_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setPickerColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: 6, backgroundColor: c,
                    cursor: 'pointer',
                    border: pickerColor === c ? '3px solid #000' : '3px solid transparent',
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </Space>
            <div style={{ marginTop: 8 }}>
              <Tag
                icon={<TagOutlined />}
                style={{
                  backgroundColor: pickerColor + '22',
                  borderColor: pickerColor,
                  color: pickerColor,
                  fontWeight: 500,
                }}
              >
                미리보기
              </Tag>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
