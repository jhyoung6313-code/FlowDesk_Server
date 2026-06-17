import React, { useEffect, useState } from 'react';
import {
  Table, Button, Input, Space, Popconfirm, message, Typography, Row, Form, Modal,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getParts, createPart, updatePart, deletePart } from '../../api/parts';

export default function PartsAdminPage() {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getParts()
      .then(setParts)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleOpen = (part = null) => {
    setEditTarget(part);
    form.setFieldsValue(part ? { name: part.name, description: part.description } : {});
    if (!part) form.resetFields();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editTarget) {
        await updatePart(editTarget.id, values);
        message.success('파트가 수정되었습니다.');
      } else {
        await createPart(values);
        message.success('파트가 등록되었습니다.');
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
      await deletePart(id);
      message.success('파트가 삭제되었습니다.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || '삭제에 실패했습니다.');
    }
  };

  const columns = [
    { title: '파트명', dataIndex: 'name', key: 'name', width: 160 },
    { title: '설명', dataIndex: 'description', key: 'description' },
    {
      title: '업무 수',
      key: 'taskCount',
      width: 80,
      render: (_, record) => record._count?.tasks ?? 0,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleOpen(record)} />
          <Popconfirm
            title="파트를 삭제하시겠습니까?"
            description="연결된 업무의 파트 정보도 해제됩니다."
            onConfirm={() => handleDelete(record.id)}
            okText="삭제"
            cancelText="취소"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>파트 관리</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpen()}>
          파트 추가
        </Button>
      </Row>

      <Table
        dataSource={parts}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={false}
      />

      <Modal
        title={editTarget ? '파트 수정' : '파트 추가'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="파트명"
            rules={[{ required: true, message: '파트명을 입력하세요.' }]}
          >
            <Input placeholder="예: 개발팀, 기획팀, QA" />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
