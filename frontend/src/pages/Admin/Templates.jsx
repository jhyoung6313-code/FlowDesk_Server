import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Space, Typography, Tag, Popconfirm, message,
  Modal, Form, Input, Select, InputNumber, Descriptions, Tooltip, DatePicker, Card, Empty,
} from 'antd';
import {
  DeleteOutlined, EditOutlined, FileTextOutlined, EyeOutlined, PlusOutlined, ThunderboltOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTemplates, updateTemplate, deleteTemplate } from '../../api/templates';
import { getTemplateSets, createTemplateSet, deleteTemplateSet, applyTemplateSet } from '../../api/templateSets';
import { getParts } from '../../api/parts';
import { getUsers } from '../../api/users';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';

const { Option } = Select;
const PRIORITY_LABEL = { high: '높음', normal: '보통', low: '낮음' };
const PRIORITY_COLOR = { high: 'red', normal: 'blue', low: 'default' };

export default function TemplatesPage() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [parts, setParts]       = useState([]);
  const [users, setUsers]       = useState([]);

  // 상세 보기 모달
  const [viewTarget, setViewTarget] = useState(null);

  // 수정 모달
  const [editOpen, setEditOpen]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving]       = useState(false);

  // 템플릿 세트
  const [sets, setSets] = useState([]);
  const [setCreateOpen, setSetCreateOpen] = useState(false);
  const [setForm] = Form.useForm();
  const [setCreating, setSetCreating] = useState(false);
  const [applyTarget, setApplyTarget] = useState(null); // 적용할 세트
  const [applyDate, setApplyDate] = useState(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getTemplates(), getParts(), getUsers(), getTemplateSets()])
      .then(([t, p, u, s]) => {
        setItems(t);
        setParts(p);
        setUsers(u.filter((u) => u.isActive));
        setSets(s);
      })
      .catch(() => message.error('데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      name:         record.name,
      title:        record.title,
      description:  record.description,
      partId:       record.partId ?? undefined,
      priority:     record.priority,
      durationDays: record.durationDays ?? undefined,
      assigneeIds:  record.assigneeIds ?? [],
      extraNames:   (record.extraNames ?? []).join(', '),
      setId:        record.setId ?? undefined,
      dayOffset:    record.dayOffset ?? 0,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const extraNames = values.extraNames
        ? values.extraNames.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      await updateTemplate(editing.id, {
        name:         values.name.trim(),
        title:        values.title.trim(),
        description:  values.description,
        partId:       values.partId ?? null,
        priority:     values.priority,
        durationDays: values.durationDays ?? null,
        assigneeIds:  values.assigneeIds ?? [],
        extraNames,
        setId:        values.setId ?? null,
        dayOffset:    values.dayOffset ?? 0,
      });
      message.success('수정되었습니다.');
      setEditOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSet = async () => {
    try {
      const values = await setForm.validateFields();
      setSetCreating(true);
      await createTemplateSet({ name: values.name.trim(), description: values.description });
      message.success('세트가 생성되었습니다. 이제 각 템플릿을 수정하여 이 세트에 포함시키세요.');
      setSetCreateOpen(false);
      setForm.resetFields();
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '생성에 실패했습니다.');
    } finally {
      setSetCreating(false);
    }
  };

  const handleDeleteSet = async (id) => {
    try {
      await deleteTemplateSet(id);
      message.success('세트가 삭제되었습니다. (소속 템플릿은 유지됩니다)');
      load();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const handleApplySet = async () => {
    if (!applyDate) { message.warning('기준일을 선택하세요.'); return; }
    setApplying(true);
    try {
      const result = await applyTemplateSet(applyTarget.id, applyDate.format('YYYY-MM-DD'));
      message.success(result.message || '업무가 생성되었습니다.');
      setApplyTarget(null);
      setApplyDate(null);
    } catch (err) {
      message.error(err?.response?.data?.error || '적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTemplate(id);
      message.success('삭제되었습니다.');
      load();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const getUserName = (id) => users.find((u) => u.id === id)?.displayName ?? `#${id}`;
  const getPartName = (id) => parts.find((p) => p.id === id)?.name ?? '-';

  const columns = [
    {
      title: '템플릿명',
      dataIndex: 'name',
      key: 'name',
      render: (v) => (
        <Space>
          <FileTextOutlined style={{ color: '#52c41a' }} />
          <Typography.Text strong>{v}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '업무 제목',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '팀',
      dataIndex: 'partId',
      key: 'partId',
      render: (v) => v ? <Tag>{getPartName(v)}</Tag> : <Typography.Text type="secondary">-</Typography.Text>,
    },
    {
      title: '우선순위',
      dataIndex: 'priority',
      key: 'priority',
      render: (v) => <Tag color={PRIORITY_COLOR[v]}>{PRIORITY_LABEL[v]}</Tag>,
    },
    {
      title: '기간(일)',
      dataIndex: 'durationDays',
      key: 'durationDays',
      render: (v) => v ? `${v}일` : <Typography.Text type="secondary">-</Typography.Text>,
      align: 'center',
    },
    {
      title: '담당자',
      key: 'assignees',
      render: (_, r) => {
        const names = [
          ...(r.assigneeIds ?? []).map(getUserName),
          ...(r.extraNames ?? []),
        ];
        if (!names.length) return <Typography.Text type="secondary">-</Typography.Text>;
        return (
          <Space size={2} wrap>
            {names.slice(0, 3).map((n, i) => <Tag key={i}>{n}</Tag>)}
            {names.length > 3 && <Tag>+{names.length - 3}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '세트',
      key: 'set',
      render: (_, r) => {
        const s = sets.find((s) => s.id === r.setId);
        if (!s) return <Typography.Text type="secondary">-</Typography.Text>;
        return <Tag color="purple">{s.name} (D+{r.dayOffset || 0})</Tag>;
      },
    },
    {
      title: '등록자',
      key: 'creator',
      render: (_, r) => r.creator?.displayName ?? '-',
    },
    {
      title: '관리',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Tooltip title="상세 보기">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setViewTarget(r)} />
          </Tooltip>
          <Tooltip title="수정">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm
            title="이 템플릿을 삭제하시겠습니까?"
            onConfirm={() => handleDelete(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space className="fd-toolbar" style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>업무 템플릿 관리</Typography.Title>
        <Typography.Text type="secondary">
          업무 폼에서 "템플릿으로 저장" 버튼으로 등록된 템플릿을 관리합니다.
        </Typography.Text>
      </Space>

      <Card
        size="small"
        title={<><AppstoreOutlined /> 템플릿 세트</>}
        extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setSetCreateOpen(true)}>새 세트</Button>}
        style={{ marginBottom: 16, borderRadius: 8 }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          여러 업무 템플릿을 하나의 세트로 묶으면, 기준일(킥오프일) 하나만 지정해 세트에 속한 업무를 한 번에 생성할 수 있습니다.
          각 템플릿을 수정해 "소속 세트"와 "마감 오프셋(D+n)"을 지정하세요.
        </Typography.Paragraph>
        {sets.length === 0 ? (
          <Empty description="등록된 세트가 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space wrap size={[8, 8]}>
            {sets.map((s) => (
              <Card key={s.id} size="small" style={{ width: 220 }}>
                <Typography.Text strong>{s.name}</Typography.Text>
                <div><Tag>{s.itemCount}개 템플릿</Tag></div>
                <Space style={{ marginTop: 8 }}>
                  <Button
                    size="small" type="primary" icon={<ThunderboltOutlined />}
                    disabled={s.itemCount === 0}
                    onClick={() => setApplyTarget(s)}
                  >
                    적용
                  </Button>
                  <Popconfirm title="이 세트를 삭제하시겠습니까? (소속 템플릿은 유지됩니다)" onConfirm={() => handleDeleteSet(s.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '저장된 템플릿이 없습니다.' }}
      />

      {/* 상세 보기 모달 */}
      <Modal
        title={`템플릿 상세: ${viewTarget?.name ?? ''}`}
        open={!!viewTarget}
        onCancel={() => setViewTarget(null)}
        footer={[
          <Button key="close" onClick={() => setViewTarget(null)}>닫기</Button>,
        ]}
        width={520}
      >
        {viewTarget && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 8 }}>
            <Descriptions.Item label="템플릿명">{viewTarget.name}</Descriptions.Item>
            <Descriptions.Item label="업무 제목">{viewTarget.title}</Descriptions.Item>
            <Descriptions.Item label="설명">
              {viewTarget.description || <Typography.Text type="secondary">-</Typography.Text>}
            </Descriptions.Item>
            <Descriptions.Item label="팀">
              {viewTarget.partId ? getPartName(viewTarget.partId) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="우선순위">
              <Tag color={PRIORITY_COLOR[viewTarget.priority]}>
                {PRIORITY_LABEL[viewTarget.priority]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="기간">
              {viewTarget.durationDays ? `${viewTarget.durationDays}일` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="담당자">
              <Space size={2} wrap>
                {[
                  ...(viewTarget.assigneeIds ?? []).map(getUserName),
                  ...(viewTarget.extraNames ?? []),
                ].map((n, i) => <Tag key={i}>{n}</Tag>)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="등록자">
              {viewTarget.creator?.displayName ?? '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 수정 모달 */}
      <Modal
        title="템플릿 수정"
        open={editOpen}
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={saving}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="템플릿명"
            rules={[{ required: true, message: '템플릿명을 입력하세요.' }]}
          >
            <Input placeholder="예: 주간 보고서 작업" maxLength={100} />
          </Form.Item>
          <Form.Item
            name="title"
            label="업무 제목"
            rules={[{ required: true, message: '업무 제목을 입력하세요.' }]}
          >
            <Input placeholder="생성될 업무의 기본 제목" maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={3} placeholder="업무 설명" />
          </Form.Item>
          <Form.Item name="partId" label="팀">
            <Select placeholder="팀 선택" allowClear>
              {parts.map((p) => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="우선순위">
            <Select>
              <Option value="high">높음</Option>
              <Option value="normal">보통</Option>
              <Option value="low">낮음</Option>
            </Select>
          </Form.Item>
          <Form.Item name="durationDays" label="기간 (일)">
            <InputNumber min={1} max={3650} placeholder="업무 기본 기간(일)" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="assigneeIds" label="담당자 (등록 사용자)">
            <Select mode="multiple" placeholder="담당자 선택" allowClear showSearch
              filterOption={filterUserOption}
              options={buildUserOptions(users, getMyDepartment())} />
          </Form.Item>
          <Form.Item name="extraNames" label="외부 담당자 (쉼표 구분)">
            <Input placeholder="예: 홍길동, 김철수" />
          </Form.Item>
          <Form.Item name="setId" label="소속 세트">
            <Select placeholder="세트 선택 (단독 템플릿이면 비워두기)" allowClear>
              {sets.map((s) => <Option key={s.id} value={s.id}>{s.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="dayOffset" label="마감 오프셋 (기준일 + N일)">
            <InputNumber min={0} max={3650} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 세트 생성 모달 */}
      <Modal
        title="템플릿 세트 생성"
        open={setCreateOpen}
        onOk={handleCreateSet}
        onCancel={() => setSetCreateOpen(false)}
        okText="생성"
        cancelText="취소"
        confirmLoading={setCreating}
      >
        <Form form={setForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="세트 이름" rules={[{ required: true, message: '세트 이름을 입력하세요.' }]}>
            <Input placeholder="예: 신규 프로젝트 킥오프" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="세트 설명 (선택)" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 세트 적용 모달 */}
      <Modal
        title={`"${applyTarget?.name}" 세트 적용`}
        open={!!applyTarget}
        onOk={handleApplySet}
        onCancel={() => { setApplyTarget(null); setApplyDate(null); }}
        okText="업무 일괄 생성"
        cancelText="취소"
        confirmLoading={applying}
      >
        <Typography.Paragraph type="secondary">
          기준일(킥오프일)을 선택하면 세트에 속한 각 템플릿의 "마감 오프셋(D+n)"만큼 더한 날짜를 마감일로 하여 업무가 일괄 생성됩니다.
        </Typography.Paragraph>
        <DatePicker style={{ width: '100%' }} value={applyDate} onChange={setApplyDate} placeholder="기준일 선택" />
      </Modal>
    </div>
  );
}
