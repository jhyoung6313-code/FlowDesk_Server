import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Space, Typography, Tag, Popconfirm, message,
  Modal, Form, Input, Select, DatePicker, Switch, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getRecurringTasks, createRecurringTask, updateRecurringTask,
  deleteRecurringTask, generateRecurringTasksNow,
} from '../../api/recurringTasks';
import { getParts } from '../../api/parts';
import { getUsers } from '../../api/users';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';
import useAuthStore from '../../store/authStore';

const { Option } = Select;

const RECURRENCE_LABEL = { daily: '매일', weekly: '매주', monthly: '매월' };
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const PRIORITY_LABEL = { high: '높음', normal: '보통', low: '낮음' };
const PRIORITY_COLOR = { high: 'red', normal: 'blue', low: 'default' };

export default function RecurringTasksPage() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [parts, setParts]         = useState([]);
  const [users, setUsers]         = useState([]);
  const [form] = Form.useForm();
  const [saving, setSaving]       = useState(false);
  const [recType, setRecType]     = useState('daily');
  const user = useAuthStore((s) => s.user);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getRecurringTasks(), getParts(), getUsers()])
      .then(([r, p, u]) => {
        setItems(r);
        setParts(p);
        setUsers(u.filter((u) => u.isActive));
      })
      .catch(() => message.error('데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ recurrenceType: 'daily', priority: 'normal' });
    setRecType('daily');
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      title: record.title,
      description: record.description,
      partId: record.partId ?? undefined,
      priority: record.priority,
      recurrenceType: record.recurrenceType,
      recurrenceDay: record.recurrenceDay ?? undefined,
      recurrenceEnd: record.recurrenceEnd ? dayjs(record.recurrenceEnd) : null,
      assigneeValues: [
        ...(record.assigneeIds?.map((id) => `uid:${id}`) || []),
        ...(record.extraNames || []),
      ],
      isActive: record.isActive,
    });
    setRecType(record.recurrenceType);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const allValues = values.assigneeValues || [];
      const assigneeIds = allValues.filter((v) => String(v).startsWith('uid:')).map((v) => Number(String(v).replace('uid:', '')));
      const extraNames  = allValues.filter((v) => !String(v).startsWith('uid:')).map((v) => String(v).trim()).filter(Boolean);

      const data = {
        title: values.title,
        description: values.description,
        partId: values.partId,
        priority: values.priority,
        recurrenceType: values.recurrenceType,
        recurrenceDay: values.recurrenceDay ?? null,
        recurrenceEnd: values.recurrenceEnd ? values.recurrenceEnd.format('YYYY-MM-DD') : null,
        assigneeIds,
        extraNames,
        isActive: values.isActive !== undefined ? values.isActive : true,
      };

      if (editing) {
        await updateRecurringTask(editing.id, data);
        message.success('수정되었습니다.');
      } else {
        await createRecurringTask(data);
        message.success('반복 업무가 등록되었습니다.');
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
      await deleteRecurringTask(id);
      message.success('삭제되었습니다.');
      load();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const handleGenerate = async () => {
    try {
      const res = await generateRecurringTasksNow();
      message.success(res.message);
    } catch {
      message.error('생성에 실패했습니다.');
    }
  };

  const columns = [
    { title: '제목', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: '반복 주기',
      key: 'recurrence',
      render: (_, r) => {
        let label = RECURRENCE_LABEL[r.recurrenceType] || r.recurrenceType;
        if (r.recurrenceType === 'weekly' && r.recurrenceDay != null) label += ` (${DAY_NAMES[r.recurrenceDay]}요일)`;
        if (r.recurrenceType === 'monthly' && r.recurrenceDay != null) label += ` (매월 ${r.recurrenceDay}일)`;
        return <Tag color="blue">{label}</Tag>;
      },
    },
    { title: '파트', dataIndex: ['part', 'name'], key: 'part', render: (v) => v ? <Tag>{v}</Tag> : '-' },
    {
      title: '우선순위',
      dataIndex: 'priority',
      key: 'priority',
      render: (v) => <Tag color={PRIORITY_COLOR[v]}>{PRIORITY_LABEL[v]}</Tag>,
    },
    {
      title: '종료일',
      dataIndex: 'recurrenceEnd',
      key: 'recurrenceEnd',
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD') : '무기한',
    },
    {
      title: '활성',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
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
        <Typography.Title level={4} style={{ margin: 0 }}>반복 업무 관리</Typography.Title>
        <Space>
          <Tooltip title="오늘 날짜 기준으로 반복 업무를 즉시 생성합니다">
            <Button icon={<PlayCircleOutlined />} onClick={handleGenerate}>지금 생성</Button>
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>반복 업무 추가</Button>
        </Space>
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
        title={editing ? '반복 업무 수정' : '반복 업무 추가'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={saving}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="업무 제목" rules={[{ required: true, message: '제목을 입력하세요.' }]}>
            <Input placeholder="반복 생성될 업무 제목" />
          </Form.Item>

          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="partId" label="담당파트">
            <Select placeholder="파트 선택" allowClear>
              {parts.map((p) => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="priority" label="우선순위" initialValue="normal">
            <Select>
              <Option value="high">높음</Option>
              <Option value="normal">보통</Option>
              <Option value="low">낮음</Option>
            </Select>
          </Form.Item>

          <Form.Item name="assigneeValues" label="담당자">
            <Select mode="tags" placeholder="담당자 선택 또는 이름 직접 입력" allowClear tokenSeparators={[',']}
              showSearch filterOption={filterUserOption}
              options={buildUserOptions(users, getMyDepartment(), { valuePrefix: 'uid:' })} />
          </Form.Item>

          <Form.Item name="recurrenceType" label="반복 주기" rules={[{ required: true }]}>
            <Select onChange={(v) => { setRecType(v); form.setFieldValue('recurrenceDay', undefined); }}>
              <Option value="daily">매일</Option>
              <Option value="weekly">매주</Option>
              <Option value="monthly">매월</Option>
            </Select>
          </Form.Item>

          {recType === 'weekly' && (
            <Form.Item name="recurrenceDay" label="반복 요일" rules={[{ required: true, message: '요일을 선택하세요.' }]}>
              <Select placeholder="요일 선택">
                {DAY_NAMES.map((d, i) => <Option key={i} value={i}>{d}요일</Option>)}
              </Select>
            </Form.Item>
          )}

          {recType === 'monthly' && (
            <Form.Item name="recurrenceDay" label="반복 일" rules={[{ required: true, message: '날짜를 선택하세요.' }]}>
              <Select placeholder="매월 몇 일">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <Option key={d} value={d}>{d}일</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item name="recurrenceEnd" label="반복 종료일 (선택)">
            <DatePicker style={{ width: '100%' }} placeholder="무기한 반복 시 비워두세요" />
          </Form.Item>

          {editing && (
            <Form.Item name="isActive" label="활성 상태" valuePropName="checked">
              <Switch checkedChildren="활성" unCheckedChildren="비활성" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
