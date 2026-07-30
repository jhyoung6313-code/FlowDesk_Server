import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Space, Typography, Popconfirm, message, Modal, Form,
  Input, Select, Switch, Tag, Card, Divider, Tooltip, Drawer, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined,
  PlayCircleOutlined, HistoryOutlined,
} from '@ant-design/icons';
import {
  getAutomationCatalog, getAutomationRules, getAutomationRule,
  createAutomationRule, updateAutomationRule, deleteAutomationRule, testAutomationRule,
} from '../../api/automation';

const OP_LABEL = {
  eq: '= 같음', ne: '≠ 다름', in: '∈ 포함(목록)', nin: '∉ 미포함(목록)',
  contains: '⊇ 값 포함', gt: '> 초과', lt: '< 미만',
  changed_to: '→ 상태 전이', is_empty: '비어있음', not_empty: '비어있지않음',
};

const STATUS_COLOR = { success: 'green', failed: 'red', skipped: 'default' };

export default function AutomationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState({ events: [], actions: [], ops: [] });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [logsRule, setLogsRule] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getAutomationRules()
      .then(setItems)
      .catch(() => message.error('자동화 규칙을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    getAutomationCatalog().then(setCatalog).catch(() => {});
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true, event: catalog.events[0]?.value, conditions: [], actions: [{ type: 'notify', config: '{"toAssignees":true,"message":""}' }] });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      isActive: record.isActive,
      event: record.event,
      conditions: (record.conditions || []).map((c) => ({ ...c, value: Array.isArray(c.value) ? c.value.join(',') : c.value })),
      actions: (record.actions || []).map((a) => ({ type: a.type, config: JSON.stringify(a.config || {}, null, 0) })),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      // actions.config 문자열 → 객체 파싱
      let actions;
      try {
        actions = (v.actions || []).map((a) => ({ type: a.type, config: a.config ? JSON.parse(a.config) : {} }));
      } catch {
        setSaving(false);
        return message.error('액션 설정(JSON) 형식이 올바르지 않습니다.');
      }
      const payload = {
        name: v.name.trim(),
        description: v.description || null,
        isActive: !!v.isActive,
        event: v.event,
        conditions: (v.conditions || []).filter((c) => c.field),
        actions,
      };
      if (editing) {
        await updateAutomationRule(editing.id, payload);
        message.success('수정되었습니다.');
      } else {
        await createAutomationRule(payload);
        message.success('자동화 규칙이 추가되었습니다.');
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
    try { await deleteAutomationRule(id); message.success('삭제되었습니다.'); load(); }
    catch { message.error('삭제에 실패했습니다.'); }
  };

  const handleTest = async (record) => {
    try {
      await testAutomationRule(record.id, { title: '테스트 컨텍스트', status: 'done', priority: 'high' });
      message.success('테스트 실행 요청됨. 로그를 확인하세요.');
      setTimeout(() => openLogs(record), 600);
    } catch { message.error('테스트 실행에 실패했습니다.'); }
  };

  const openLogs = async (record) => {
    try {
      const full = await getAutomationRule(record.id);
      setLogsRule(full);
    } catch { message.error('로그를 불러오지 못했습니다.'); }
  };

  const eventLabel = (v) => catalog.events.find((e) => e.value === v)?.label || v;

  const columns = [
    {
      title: '규칙', key: 'name',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{r.name}</Typography.Text>
          {r.description && <Typography.Text type="secondary" style={{ fontSize: 13 }}>{r.description}</Typography.Text>}
        </Space>
      ),
    },
    { title: '이벤트', dataIndex: 'event', key: 'event', render: (v) => <Tag color="blue">{eventLabel(v)}</Tag> },
    {
      title: '액션', key: 'actions',
      render: (_, r) => <Space size={4} wrap>{(r.actions || []).map((a, i) => <Tag key={i}>{catalog.actions.find((x) => x.value === a.type)?.label || a.type}</Tag>)}</Space>,
    },
    {
      title: '상태', dataIndex: 'isActive', key: 'isActive',
      render: (v) => v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>,
    },
    {
      title: '실행', key: 'runCount',
      render: (_, r) => (
        <Space size={4}>
          <Typography.Text>{r.runCount || 0}회</Typography.Text>
          {r.lastError && <Tooltip title={r.lastError}><Tag color="red">오류</Tag></Tooltip>}
        </Space>
      ),
    },
    {
      title: '관리', key: 'ops',
      render: (_, r) => (
        <Space>
          <Tooltip title="테스트 실행"><Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleTest(r)} /></Tooltip>
          <Tooltip title="실행 로그"><Button size="small" icon={<HistoryOutlined />} onClick={() => openLogs(r)} /></Tooltip>
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
      <Space className="fd-toolbar" style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <ThunderboltOutlined style={{ color: '#faad14', marginRight: 8 }} />자동화 규칙
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>규칙 추가</Button>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        이벤트(업무·결재·게시판 등)가 발생하면 조건을 검사해 알림·이메일·채팅·웹훅·업무생성 액션을 자동 실행합니다. (M365 Power Automate 경량판)
      </Typography.Paragraph>

      <Table dataSource={items} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />

      <Modal
        title={editing ? '자동화 규칙 수정' : '자동화 규칙 추가'}
        open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}
        okText="저장" cancelText="취소" confirmLoading={saving} width={720}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space size={16} style={{ display: 'flex' }} align="start">
            <Form.Item name="name" label="규칙 이름" rules={[{ required: true, message: '이름을 입력하세요.' }]} style={{ flex: 1 }}>
              <Input placeholder="예: 긴급업무 완료 시 팀장 알림" maxLength={200} />
            </Form.Item>
            <Form.Item name="isActive" label="활성" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="설명">
            <Input placeholder="선택 사항" maxLength={500} />
          </Form.Item>
          <Form.Item name="event" label="트리거 이벤트" rules={[{ required: true }]}>
            <Select options={catalog.events.map((e) => ({ value: e.value, label: e.label }))} />
          </Form.Item>

          <Divider orientation="left" plain>조건 (모두 만족 시 실행 · AND)</Divider>
          <Form.List name="conditions">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item {...rest} name={[name, 'field']} style={{ marginBottom: 0 }}>
                      <Input placeholder="필드 (예: priority)" style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'op']} style={{ marginBottom: 0 }} initialValue="eq">
                      <Select style={{ width: 150 }} options={(catalog.ops || []).map((o) => ({ value: o, label: OP_LABEL[o] || o }))} />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'value']} style={{ marginBottom: 0 }}>
                      <Input placeholder="값 (목록은 콤마)" style={{ width: 180 }} />
                    </Form.Item>
                    <Button danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ op: 'eq' })} icon={<PlusOutlined />} block>조건 추가</Button>
              </>
            )}
          </Form.List>

          <Divider orientation="left" plain>액션 (순서대로 실행)</Divider>
          <Form.List name="actions" rules={[{ validator: async (_, v) => (!v || v.length < 1) ? Promise.reject(new Error('액션을 1개 이상 추가하세요.')) : Promise.resolve() }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Card key={key} size="small" style={{ marginBottom: 8 }}
                    title={<Form.Item {...rest} name={[name, 'type']} style={{ marginBottom: 0 }}>
                      <Select style={{ width: 200 }} options={catalog.actions.map((a) => ({ value: a.value, label: a.label }))} />
                    </Form.Item>}
                    extra={<Button danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />}
                  >
                    <Form.Item {...rest} name={[name, 'config']} style={{ marginBottom: 0 }}
                      label="설정 (JSON)" tooltip='예) 알림: {"toAssignees":true,"message":"{{title}} 완료"} · 웹훅: {"url":"https://..."}'>
                      <Input.TextArea rows={2} placeholder='{"toAssignees": true, "message": "{{title}}"}' />
                    </Form.Item>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add({ type: 'notify', config: '{}' })} icon={<PlusOutlined />} block>액션 추가</Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Drawer
        title={`실행 로그 · ${logsRule?.name || ''}`} open={!!logsRule} onClose={() => setLogsRule(null)} width={520}
      >
        {logsRule?.logs?.length ? logsRule.logs.map((log) => (
          <Card key={log.id} size="small" style={{ marginBottom: 8 }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Tag color={STATUS_COLOR[log.status]}>{log.status}</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>{new Date(log.createdAt).toLocaleString('ko-KR')}</Typography.Text>
            </Space>
            {log.detail && <Typography.Paragraph style={{ margin: '8px 0 0', fontSize: 13 }}>{log.detail}</Typography.Paragraph>}
          </Card>
        )) : <Empty description="실행 로그 없음" />}
      </Drawer>
    </div>
  );
}
