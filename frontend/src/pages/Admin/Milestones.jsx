import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Space, Typography, Tag, Popconfirm, message,
  Modal, Form, Input, DatePicker,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FlagOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getMilestones, createMilestone, updateMilestone, deleteMilestone } from '../../api/milestones';

const PRESET_COLORS = [
  '#722ed1', '#1677ff', '#52c41a', '#fa8c16',
  '#f5222d', '#13c2c2', '#eb2f96', '#fadb14',
];

export default function MilestonesPage() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving]     = useState(false);
  const [pickerColor, setPickerColor] = useState('#722ed1');

  const load = useCallback(() => {
    setLoading(true);
    getMilestones()
      .then(setItems)
      .catch(() => message.error('마일스톤 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setPickerColor('#722ed1');
    form.resetFields();
    form.setFieldsValue({ color: '#722ed1' });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setPickerColor(record.color);
    form.setFieldsValue({
      name: record.name,
      date: dayjs(record.date),
      color: record.color,
      description: record.description,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const data = {
        name: values.name,
        date: values.date.format('YYYY-MM-DD'),
        color: pickerColor,
        description: values.description,
      };

      if (editing) {
        await updateMilestone(editing.id, data);
        message.success('수정되었습니다.');
      } else {
        await createMilestone(data);
        message.success('마일스톤이 등록되었습니다.');
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
      await deleteMilestone(id);
      message.success('삭제되었습니다.');
      load();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const columns = [
    {
      title: '마일스톤',
      key: 'name',
      render: (_, r) => (
        <Space>
          <FlagOutlined style={{ color: r.color }} />
          <span style={{ fontWeight: 500 }}>{r.name}</span>
        </Space>
      ),
    },
    {
      title: '날짜',
      dataIndex: 'date',
      key: 'date',
      render: (v) => dayjs(v).format('YYYY-MM-DD'),
      sorter: (a, b) => new Date(a.date) - new Date(b.date),
    },
    {
      title: '색상',
      dataIndex: 'color',
      key: 'color',
      render: (v) => (
        <span style={{
          display: 'inline-block', width: 20, height: 20,
          borderRadius: 4, backgroundColor: v, border: '1px solid #d9d9d9',
        }} />
      ),
    },
    {
      title: '설명',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => v || '-',
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
        <Typography.Title level={4} style={{ margin: 0 }}>마일스톤 관리</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>마일스톤 추가</Button>
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
        title={editing ? '마일스톤 수정' : '마일스톤 추가'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="마일스톤 이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input placeholder="예: 1차 릴리즈, 베타 오픈" />
          </Form.Item>

          <Form.Item name="date" label="날짜" rules={[{ required: true, message: '날짜를 선택하세요.' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="색상">
            <Space wrap>
              {PRESET_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setPickerColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: 4, backgroundColor: c,
                    cursor: 'pointer', border: pickerColor === c ? '2px solid #000' : '2px solid transparent',
                  }}
                />
              ))}
            </Space>
          </Form.Item>

          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="마일스톤 설명 (선택)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
