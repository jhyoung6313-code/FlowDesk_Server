import { useEffect, useState, useCallback } from 'react';
import {
  Tabs, Table, Button, Space, Typography, Popconfirm, message, Modal,
  Form, Input, Select, Switch, Card, Divider, Tag, InputNumber, Radio, Checkbox, Row, Col,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, PlusCircleOutlined, MinusCircleOutlined,
  ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, EyeOutlined, HolderOutlined,
} from '@ant-design/icons';
import {
  getApprovalFormTypes, createApprovalFormType, updateApprovalFormType, deleteApprovalFormType,
  getApprovalTemplates, createApprovalTemplate, updateApprovalTemplate, deleteApprovalTemplate,
  getApprovalTemplate,
} from '../../api/approval';
import { getUsers } from '../../api/users';
import dayjs from 'dayjs';

const { Text } = Typography;

const ROLE_OPTIONS = [
  { value: 'approval', label: '승인' },
  { value: 'agreement', label: '합의' },
  { value: 'delegation', label: '전결' },
  { value: 'reference', label: '참조' },
];
const SCOPE_OPTIONS = [
  { value: 'team', label: '같은 팀' },
  { value: 'department', label: '같은 부서' },
  { value: 'all', label: '전체' },
];
const OP_OPTIONS = [
  { value: 'truthy', label: '값 있음/예' },
  { value: 'eq', label: '= 같음' },
  { value: 'ne', label: '≠ 다름' },
  { value: 'gt', label: '> 초과' },
  { value: 'gte', label: '≥ 이상' },
  { value: 'lt', label: '< 미만' },
  { value: 'lte', label: '≤ 이하' },
  { value: 'contains', label: '포함' },
];

// 조건 평가 (미리보기용 — 백엔드 resolvePresetLine 로직 근사)
function evalCondition(cond, raw) {
  if (!cond?.field) return true;
  const v = raw;
  const cv = cond.value;
  switch (cond.op || 'truthy') {
    case 'truthy': {
      if (Array.isArray(v)) return v.length > 0;
      const s = String(v ?? '').trim().toLowerCase();
      return !(s === '' || s === '아니오' || s === 'false' || s === 'no' || s === '0');
    }
    case 'eq': return String(v ?? '') === String(cv ?? '');
    case 'ne': return String(v ?? '') !== String(cv ?? '');
    case 'gt': return Number(v) > Number(cv);
    case 'gte': return Number(v) >= Number(cv);
    case 'lt': return Number(v) < Number(cv);
    case 'lte': return Number(v) <= Number(cv);
    case 'contains': return String(v ?? '').includes(String(cv ?? ''));
    default: return true;
  }
}

const FIELD_TYPES = [
  { value: 'text', label: '텍스트' },
  { value: 'textarea', label: '장문 텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'money', label: '금액' },
  { value: 'date', label: '날짜' },
  { value: 'select', label: '선택(드롭다운)' },
  { value: 'radio', label: '단일선택(라디오)' },
  { value: 'checkbox', label: '다중선택(체크박스)' },
  { value: 'user', label: '사용자 선택' },
  { value: 'divider', label: '구분선/설명' },
];
// 선택지(options)가 필요한 타입
const OPTION_TYPES = new Set(['select', 'radio', 'checkbox']);

// 기안 화면 미리보기 (읽기전용)
function PreviewFields({ fieldsJson }) {
  let fields = [];
  try { fields = JSON.parse(fieldsJson || '[]'); } catch {}
  const parseOpts = (o) => (Array.isArray(o) ? o : (o ? o.split('\n').map(s => s.trim()).filter(Boolean) : []));
  return (
    <Form layout="vertical">
      <Row gutter={16}>
        {fields.map((f, i) => {
          if (f.type === 'divider') return <Col span={24} key={i}><Divider orientation="left" style={{ fontSize: 13, color: '#888' }}>{f.label}</Divider></Col>;
          const lbl = <>{f.label}{f.required && <span style={{ color: '#ff4d4f' }}> *</span>}</>;
          let ctrl;
          switch (f.type) {
            case 'textarea': ctrl = <Input.TextArea rows={2} disabled placeholder={f.placeholder} />; break;
            case 'number': ctrl = <InputNumber style={{ width: '100%' }} disabled placeholder={f.placeholder} />; break;
            case 'money': ctrl = <InputNumber style={{ width: '100%' }} disabled addonAfter="원" placeholder={f.placeholder} />; break;
            case 'date': ctrl = <Input disabled placeholder="YYYY-MM-DD" />; break;
            case 'select': ctrl = <Select disabled placeholder={f.placeholder || '선택'} options={parseOpts(f.options).map(o => ({ label: o, value: o }))} />; break;
            case 'radio': ctrl = <Radio.Group disabled options={parseOpts(f.options)} />; break;
            case 'checkbox': ctrl = <Checkbox.Group disabled options={parseOpts(f.options)} />; break;
            case 'user': ctrl = <Select disabled placeholder={f.placeholder || '사용자 선택'} />; break;
            default: ctrl = <Input disabled placeholder={f.placeholder} />;
          }
          return <Col key={i} xs={24} sm={f.width === 'half' ? 12 : 24}><Form.Item label={lbl} style={{ marginBottom: 12 }}>{ctrl}</Form.Item></Col>;
        })}
      </Row>
    </Form>
  );
}

const ICON_OPTIONS = ['📋', '📁', '📌', '🗂️', '📢', '💡', '❓', '📝', '🔔', '⭐', '📑', '✅'];

// ── 결재 양식 종류 탭 ─────────────────────────────────────────
function FormTypeTab() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [ftUsers, setFtUsers] = useState([]);
  const [ftLine, setFtLine] = useState([]);
  const [ftRulePos, setFtRulePos] = useState('');
  const [ftRuleScope, setFtRuleScope] = useState('team');

  useEffect(() => { getUsers().then(setFtUsers).catch(() => {}); }, []);

  const ftNextGroup = (line) => { const gs = line.filter(s => s.type !== 'reference').map(s => s.stepOrder); return gs.length ? Math.max(...gs) + 1 : 1; };
  const ftParse = (lineJson) => {
    if (!lineJson) return [];
    let l = []; try { l = JSON.parse(lineJson); } catch { return []; }
    return l.map((s, i) => {
      const type = s.type || 'approval';
      const stepOrder = type === 'reference' ? 0 : (s.stepOrder || i + 1);
      if (s.rule?.by === 'position') return { key: `r${i}`, kind: 'rule', position: s.rule.value || '', scope: s.rule.scope || 'all', type, stepOrder };
      const u = ftUsers.find(x => x.id === s.approverId);
      return { key: `u${s.approverId}`, kind: 'user', approverId: s.approverId, approverName: u?.displayName || `사용자 ${s.approverId}`, type, stepOrder };
    });
  };
  const ftAddUser = (uid) => {
    if (!uid || ftLine.some(s => s.kind === 'user' && s.approverId === uid)) return;
    const u = ftUsers.find(x => x.id === uid);
    setFtLine(p => [...p, { key: `u${uid}`, kind: 'user', approverId: uid, approverName: u?.displayName || '', type: 'approval', stepOrder: ftNextGroup(p) }]);
  };
  const ftAddRule = () => {
    const pos = ftRulePos.trim();
    if (!pos) { message.warning('직급/직책을 입력하세요.'); return; }
    setFtLine(p => [...p, { key: `r${Date.now()}`, kind: 'rule', position: pos, scope: ftRuleScope, type: 'approval', stepOrder: ftNextGroup(p) }]);
    setFtRulePos('');
  };
  const ftRemove = (i) => setFtLine(p => p.filter((_, idx) => idx !== i));
  const ftSetRole = (i, type) => setFtLine(p => p.map((s, idx) => idx !== i ? s : { ...s, type, stepOrder: type === 'reference' ? 0 : (s.stepOrder || ftNextGroup(p)) }));
  const ftSetGroup = (i, v) => setFtLine(p => p.map((s, idx) => idx === i ? { ...s, stepOrder: Math.max(1, Number(v) || 1) } : s));
  const ftLineToJson = () => ftLine.length > 0
    ? JSON.stringify(ftLine.map(s => {
        const stepOrder = s.type === 'reference' ? 0 : s.stepOrder;
        return s.kind === 'rule'
          ? { stepOrder, type: s.type, rule: { by: 'position', value: s.position, scope: s.scope } }
          : { stepOrder, type: s.type, approverId: s.approverId };
      }))
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    try { setTypes(await getApprovalFormTypes()); }
    catch { message.error('목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setFtLine([]); setModalOpen(true); };
  const openEdit = (rec) => {
    setEditing(rec);
    form.setFieldsValue({ name: rec.name, description: rec.description, parentId: rec.parentId || undefined, icon: rec.icon || undefined, isActive: rec.isActive });
    setFtLine(ftParse(rec.lineJson));
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = { ...values, lineJson: ftLineToJson() };
      if (editing) {
        await updateApprovalFormType(editing.id, payload);
        message.success('수정되었습니다.');
      } else {
        await createApprovalFormType(payload);
        message.success('생성되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await deleteApprovalFormType(id); message.success('삭제되었습니다.'); load(); }
    catch { message.error('삭제 실패 (하위 항목이 있을 수 있습니다.)'); }
  };

  const columns = [
    { title: '아이콘', dataIndex: 'icon', width: 50, render: v => v || '-' },
    {
      title: '이름', dataIndex: 'name',
      render: (name, rec) => (
        <Space>
          {rec.parentId && <Text type="secondary" style={{ fontSize: 11 }}>└ </Text>}
          <Text>{name}</Text>
        </Space>
      ),
    },
    { title: '설명', dataIndex: 'description', render: v => v || '-' },
    {
      title: '활성',
      dataIndex: 'isActive',
      width: 60,
      render: v => <Tag color={v ? 'green' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '관리', key: 'actions', width: 100,
      render: (_, rec) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(rec.id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>추가</Button>
      </div>
      <Table dataSource={types} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} />
      <Modal title={editing ? '결재 양식 종류 수정' : '결재 양식 종류 추가'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} confirmLoading={saving} okText="저장" cancelText="취소">
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label="상위 종류">
            <Select allowClear placeholder="없음 (최상위)">
              {types.filter(t => t.id !== editing?.id).map(t => (
                <Select.Option key={t.id} value={t.id}>{t.icon} {t.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="icon" label="아이콘">
            <Select allowClear placeholder="선택">
              {ICON_OPTIONS.map(ic => <Select.Option key={ic} value={ic}>{ic}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="isActive" label="활성" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>

        <Divider style={{ margin: '12px 0' }}>기본 결재 라인 (이 종류 공통, 선택)</Divider>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          이 종류의 <b>공통 기본 결재선</b>입니다. 하위 양식(템플릿)에 자체 결재선이 없으면 이 결재선이 상속됩니다.
        </Text>
        <Space size={6} wrap style={{ marginBottom: 8 }}>
          <Select
            placeholder="지정 사용자 추가" style={{ width: 190 }} size="small"
            showSearch optionFilterProp="children" onChange={ftAddUser} value={null}
          >
            {ftUsers.map(u => <Select.Option key={u.id} value={u.id}>{u.displayName} ({u.username})</Select.Option>)}
          </Select>
          <Input.Group compact>
            <Input size="small" placeholder="직급/직책 (예: 팀장)" style={{ width: 130 }}
              value={ftRulePos} onChange={e => setFtRulePos(e.target.value)} onPressEnter={ftAddRule} />
            <Select size="small" value={ftRuleScope} onChange={setFtRuleScope} options={SCOPE_OPTIONS} style={{ width: 90 }} />
            <Button size="small" icon={<PlusCircleOutlined />} onClick={ftAddRule}>규칙 추가</Button>
          </Input.Group>
        </Space>
        {ftLine.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>지정된 기본 결재선이 없습니다.</Text>
        ) : ftLine.map((step, i) => (
          <div key={step.key || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px dashed #f0f0f0' }}>
            {step.kind === 'rule'
              ? <Tag color="geekblue" style={{ margin: 0 }}>규칙: {step.position} · {SCOPE_OPTIONS.find(o => o.value === step.scope)?.label}</Tag>
              : <Text style={{ fontSize: 13, minWidth: 90 }}>{step.approverName}</Text>}
            <Select size="small" value={step.type} style={{ width: 78 }} onChange={v => ftSetRole(i, v)} options={ROLE_OPTIONS} />
            {step.type === 'reference'
              ? <Text type="secondary" style={{ fontSize: 12, width: 56 }}>열람</Text>
              : (
                <Space size={2} style={{ width: 56 }}>
                  <InputNumber size="small" min={1} value={step.stepOrder} controls={false} onChange={v => ftSetGroup(i, v)} style={{ width: 42 }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>차</Text>
                </Space>
              )}
            <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => ftRemove(i)} />
          </div>
        ))}
      </Modal>
    </>
  );
}

// ── 양식 템플릿 탭 ────────────────────────────────────────────
function TemplateTab() {
  const [types, setTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState([]);
  const [defaultLine, setDefaultLine] = useState([]);
  const [previewTpl, setPreviewTpl] = useState(null);
  const [sampleValues, setSampleValues] = useState({});

  const openPreview = async (rec) => {
    try {
      const full = await getApprovalTemplate(rec.id);
      setPreviewTpl(full);
    } catch { message.error('미리보기를 불러오지 못했습니다.'); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typeList, tplList, userList] = await Promise.all([
        getApprovalFormTypes(), getApprovalTemplates(), getUsers(),
      ]);
      setTypes(typeList);
      setTemplates(tplList);
      setUsers(userList);
    } catch { message.error('목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setFields([{ id: Date.now(), type: 'text', label: '', required: false, placeholder: '', options: '' }]);
    setDefaultLine([]);
    setModalOpen(true);
  };

  const openEdit = async (rec) => {
    setEditing(rec);
    form.setFieldsValue({ formTypeId: rec.formType?.id, name: rec.name, description: rec.description, code: rec.code });
    try {
      const full = await getApprovalTemplate(rec.id);
      setFields(full.fieldsJson ? JSON.parse(full.fieldsJson) : []);
      setDefaultLine(parseLineToState(full.lineJson));
    } catch {}
    setModalOpen(true);
  };

  // 프리셋 결재선(JSON)을 편집기 상태로 변환
  const parseLineToState = (lineJson) => {
    if (!lineJson) return [];
    let line = [];
    try { line = JSON.parse(lineJson); } catch { return []; }
    return line.map((s, i) => {
      const type = s.type || 'approval';
      const stepOrder = type === 'reference' ? 0 : (s.stepOrder || i + 1);
      const condition = s.condition?.field ? { ...s.condition } : null;
      if (s.rule?.by === 'position') {
        return { key: `r${i}-${Date.now()}`, kind: 'rule', position: s.rule.value || '', scope: s.rule.scope || 'all', type, stepOrder, condition };
      }
      const found = users.find(u => u.id === s.approverId);
      return { key: `u${s.approverId}`, kind: 'user', approverId: s.approverId, approverName: found?.displayName || `사용자 ${s.approverId}`, type, stepOrder, condition };
    });
  };

  const openDuplicate = async (rec) => {
    setEditing(null); // 새 템플릿으로 생성
    try {
      const full = await getApprovalTemplate(rec.id);
      form.setFieldsValue({ formTypeId: full.formType?.id, name: `${full.name} (복사)`, description: full.description, code: full.code });
      setFields(full.fieldsJson ? JSON.parse(full.fieldsJson) : []);
      setDefaultLine(parseLineToState(full.lineJson));
    } catch { message.error('복제할 템플릿을 불러오지 못했습니다.'); return; }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (fields.length === 0) { message.warning('폼 필드를 1개 이상 추가하세요.'); return; }
      setSaving(true);

      const payload = {
        formTypeId: values.formTypeId,
        name: values.name,
        description: values.description || null,
        code: (values.code || 'DOC').toUpperCase(),
        fieldsJson: JSON.stringify(fields),
        lineJson: defaultLine.length > 0
          ? JSON.stringify(defaultLine.map(s => {
              const stepOrder = s.type === 'reference' ? 0 : s.stepOrder;
              const base = s.kind === 'rule'
                ? { stepOrder, type: s.type, rule: { by: 'position', value: s.position, scope: s.scope } }
                : { stepOrder, type: s.type, approverId: s.approverId };
              if (s.condition?.field) {
                base.condition = { field: s.condition.field, op: s.condition.op || 'truthy', value: s.condition.value ?? '' };
              }
              return base;
            }))
          : null,
      };

      if (editing) {
        await updateApprovalTemplate(editing.id, payload);
        message.success('수정되었습니다.');
      } else {
        await createApprovalTemplate(payload);
        message.success('생성되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await deleteApprovalTemplate(id); message.success('비활성화되었습니다.'); load(); }
    catch { message.error('실패'); }
  };

  // 폼 필드 빌더
  const addField = () => setFields(prev => [...prev, { id: Date.now(), type: 'text', label: '', required: false, placeholder: '', options: '' }]);
  const removeField = (id) => setFields(prev => prev.filter(f => f.id !== id));
  const updateField = (id, key, value) => setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  const moveField = (idx, dir) => {
    const arr = [...fields];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    setFields(arr);
  };
  const [dragField, setDragField] = useState(null);
  const moveFieldTo = (from, to) => {
    if (from == null || to == null || from === to) return;
    setFields(prev => { const a = [...prev]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });
  };

  // 기본 결재라인 (프리셋)
  const nextGroupNo = (line) => {
    const gs = line.filter(s => s.type !== 'reference').map(s => s.stepOrder);
    return gs.length ? Math.max(...gs) + 1 : 1;
  };
  const [rulePosition, setRulePosition] = useState('');
  const [ruleScope, setRuleScope] = useState('team');

  const addApprover = (userId) => {
    if (!userId || defaultLine.some(s => s.kind === 'user' && s.approverId === userId)) return;
    const found = users.find(u => u.id === userId);
    setDefaultLine(prev => [...prev, {
      key: `u${userId}`, kind: 'user', approverId: userId, approverName: found?.displayName || '',
      type: 'approval', stepOrder: nextGroupNo(prev),
    }]);
  };
  const addRule = () => {
    const pos = rulePosition.trim();
    if (!pos) { message.warning('직급/직책을 입력하세요.'); return; }
    setDefaultLine(prev => [...prev, {
      key: `r${Date.now()}`, kind: 'rule', position: pos, scope: ruleScope,
      type: 'approval', stepOrder: nextGroupNo(prev),
    }]);
    setRulePosition('');
  };
  const removeApprover = (idx) => setDefaultLine(prev => prev.filter((_, i) => i !== idx));
  const setLineRole = (idx, type) => setDefaultLine(prev => prev.map((s, i) => {
    if (i !== idx) return s;
    return { ...s, type, stepOrder: type === 'reference' ? 0 : (s.stepOrder || nextGroupNo(prev)) };
  }));
  const setLineGroup = (idx, stepOrder) => setDefaultLine(prev => prev.map((s, i) => (i === idx ? { ...s, stepOrder: Math.max(1, Number(stepOrder) || 1) } : s)));
  const toggleCondition = (idx) => setDefaultLine(prev => prev.map((s, i) => {
    if (i !== idx) return s;
    return s.condition ? { ...s, condition: null } : { ...s, condition: { field: '', op: 'truthy', value: '' } };
  }));
  const setCondition = (idx, patch) => setDefaultLine(prev => prev.map((s, i) => (i === idx ? { ...s, condition: { ...s.condition, ...patch } } : s)));

  // 조건에 쓸 수 있는 필드(구분선 제외)
  const conditionFieldOptions = fields.filter(f => f.type !== 'divider').map(f => ({ label: f.label || f.id, value: f.id }));

  const columns = [
    { title: '양식 종류', render: (_, rec) => rec.formType?.name || '-' },
    { title: '템플릿 이름', dataIndex: 'name' },
    { title: '설명', dataIndex: 'description', render: v => v || '-' },
    {
      title: '관리', key: 'actions', width: 150,
      render: (_, rec) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openPreview(rec)} title="미리보기" />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} title="수정" />
          <Button size="small" icon={<CopyOutlined />} onClick={() => openDuplicate(rec)} title="복제" />
          <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(rec.id)} okText="확인" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} title="비활성화" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>추가</Button>
      </div>
      <Table dataSource={templates} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} />

      <Modal
        title={editing ? '양식 템플릿 수정' : '양식 템플릿 추가'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="저장"
        cancelText="취소"
        width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="formTypeId" label="결재 양식 종류" rules={[{ required: true, message: '종류를 선택하세요.' }]}>
            <Select placeholder="선택">
              {types.map(t => <Select.Option key={t.id} value={t.id}>{t.icon} {t.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="name" label="템플릿 이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label="양식코드 (문서번호 채번용)"
            tooltip="문서번호가 {코드}-{연도}-{일련번호}로 채번됩니다. 예: EXP → EXP-2026-0001"
            rules={[{ pattern: /^[A-Za-z0-9]{2,10}$/, message: '영문·숫자 2~10자로 입력하세요.' }]}
          >
            <Input placeholder="예) EXP, VAC" maxLength={10} style={{ textTransform: 'uppercase', width: 200 }} />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input />
          </Form.Item>
        </Form>

        <Divider style={{ margin: '12px 0' }}>폼 필드 설계</Divider>
        <Button size="small" icon={<PlusCircleOutlined />} onClick={addField} style={{ marginBottom: 8 }}>
          필드 추가
        </Button>
        {fields.map((field, idx) => (
          <Card
            key={field.id}
            size="small"
            draggable
            onDragStart={() => setDragField(idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { moveFieldTo(dragField, idx); setDragField(null); }}
            onDragEnd={() => setDragField(null)}
            style={{ marginBottom: 8, background: '#fafafa', opacity: dragField === idx ? 0.4 : 1 }}
            bodyStyle={{ padding: '8px 12px' }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <HolderOutlined style={{ color: '#bbb', cursor: 'grab', marginTop: 6 }} />
              <Select
                size="small" style={{ width: 100 }}
                value={field.type}
                onChange={v => updateField(field.id, 'type', v)}
              >
                {FIELD_TYPES.map(t => <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>)}
              </Select>
              <Input
                size="small" placeholder="레이블 (필드명)"
                value={field.label}
                onChange={e => updateField(field.id, 'label', e.target.value)}
                style={{ width: 160 }}
              />
              <Input
                size="small" placeholder="플레이스홀더"
                value={field.placeholder}
                onChange={e => updateField(field.id, 'placeholder', e.target.value)}
                style={{ width: 140 }}
              />
              {OPTION_TYPES.has(field.type) && (
                <Input.TextArea
                  size="small" placeholder="선택지 (줄바꿈 구분)"
                  value={field.options}
                  onChange={e => updateField(field.id, 'options', e.target.value)}
                  rows={2}
                  style={{ width: 160 }}
                />
              )}
              <Space size={4}>
                {field.type !== 'divider' && (
                  <Button size="small" onClick={() => updateField(field.id, 'width', field.width === 'half' ? 'full' : 'half')} title="필드 폭">
                    {field.width === 'half' ? '반칸' : '전체'}
                  </Button>
                )}
                <Button size="small" type={field.required ? 'primary' : 'default'}
                  onClick={() => updateField(field.id, 'required', !field.required)}>
                  {field.required ? '필수' : '선택'}
                </Button>
                <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveField(idx, -1)} disabled={idx === 0} />
                <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1} />
                <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => removeField(field.id)} />
              </Space>
            </div>
          </Card>
        ))}

        <Divider style={{ margin: '12px 0' }}>기본 결재 라인 프리셋 (선택)</Divider>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          지정 사용자 또는 직급/직책 규칙으로 프리셋을 만들면, 기안 시 기안자의 조직 기준으로 자동 지정됩니다.
          같은 <b>차수</b>는 병렬 결재입니다.
        </Text>
        <Space size={6} wrap style={{ marginBottom: 8 }}>
          <Select
            placeholder="지정 사용자 추가" style={{ width: 190 }} size="small"
            showSearch optionFilterProp="children" onChange={addApprover} value={null}
          >
            {users.map(u => (
              <Select.Option key={u.id} value={u.id}>{u.displayName} ({u.username})</Select.Option>
            ))}
          </Select>
          <Input.Group compact>
            <Input
              size="small" placeholder="직급/직책 (예: 팀장)" style={{ width: 130 }}
              value={rulePosition} onChange={e => setRulePosition(e.target.value)} onPressEnter={addRule}
            />
            <Select size="small" value={ruleScope} onChange={setRuleScope} options={SCOPE_OPTIONS} style={{ width: 90 }} />
            <Button size="small" icon={<PlusCircleOutlined />} onClick={addRule}>규칙 추가</Button>
          </Input.Group>
        </Space>
        {defaultLine.map((step, i) => (
          <div key={step.key || i} style={{ padding: '4px 0', borderBottom: '1px dashed #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {step.kind === 'rule'
                ? <Tag color="geekblue" style={{ margin: 0 }}>규칙: {step.position} · {SCOPE_OPTIONS.find(o => o.value === step.scope)?.label}</Tag>
                : <Text style={{ fontSize: 13, minWidth: 90 }}>{step.approverName}</Text>}
              <Select size="small" value={step.type} style={{ width: 78 }} onChange={v => setLineRole(i, v)} options={ROLE_OPTIONS} />
              {step.type === 'reference'
                ? <Text type="secondary" style={{ fontSize: 12, width: 56 }}>열람</Text>
                : (
                  <Space size={2} style={{ width: 56 }}>
                    <InputNumber size="small" min={1} value={step.stepOrder} controls={false} onChange={v => setLineGroup(i, v)} style={{ width: 42 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>차</Text>
                  </Space>
                )}
              <Button
                size="small" type={step.condition ? 'primary' : 'default'} ghost={!!step.condition}
                onClick={() => toggleCondition(i)}
              >조건</Button>
              <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => removeApprover(i)} />
            </div>
            {step.condition && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>조건:</Text>
                <Select
                  size="small" placeholder="필드" style={{ width: 120 }}
                  value={step.condition.field || undefined}
                  onChange={v => setCondition(i, { field: v })}
                  options={conditionFieldOptions}
                />
                <Select size="small" style={{ width: 110 }} value={step.condition.op} onChange={v => setCondition(i, { op: v })} options={OP_OPTIONS} />
                {!['truthy'].includes(step.condition.op) && (
                  <Input size="small" placeholder="값" style={{ width: 90 }} value={step.condition.value} onChange={e => setCondition(i, { value: e.target.value })} />
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>일 때만 결재</Text>
              </div>
            )}
          </div>
        ))}

        {/* 조건 결재선 미리보기 — 샘플 값에 따라 최종 결재선 시뮬레이션 */}
        {(() => {
          const condFields = [...new Set(defaultLine.filter(s => s.condition?.field).map(s => s.condition.field))];
          if (condFields.length === 0) return null;
          const resolved = defaultLine.filter(s => !s.condition || evalCondition(s.condition, sampleValues[s.condition.field]));
          const renderSampleInput = (fid) => {
            const f = fields.find(x => x.id === fid);
            const type = f?.type;
            const opts = f ? (Array.isArray(f.options) ? f.options : (f.options ? f.options.split('\n').map(s => s.trim()).filter(Boolean) : [])) : [];
            const set = (v) => setSampleValues(prev => ({ ...prev, [fid]: v }));
            if (type === 'select' || type === 'radio') {
              return <Select size="small" allowClear style={{ width: 130 }} value={sampleValues[fid]} onChange={set} options={opts.map(o => ({ label: o, value: o }))} />;
            }
            if (type === 'checkbox') {
              return <Select size="small" mode="multiple" allowClear style={{ minWidth: 130 }} value={sampleValues[fid] || []} onChange={set} options={opts.map(o => ({ label: o, value: o }))} />;
            }
            return <Input size="small" style={{ width: 130 }} value={sampleValues[fid] ?? ''} onChange={e => set(e.target.value)} placeholder="샘플 값" />;
          };
          return (
            <>
              <Divider style={{ margin: '12px 0' }}>조건 결재선 미리보기</Divider>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                샘플 값을 입력하면 조건에 따라 상신 시 최종 결재선이 어떻게 구성되는지 시뮬레이션합니다.
              </Text>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                {condFields.map(fid => {
                  const f = fields.find(x => x.id === fid);
                  return (
                    <div key={fid} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Text style={{ fontSize: 11, color: '#888' }}>{f?.label || fid}</Text>
                      {renderSampleInput(fid)}
                    </div>
                  );
                })}
              </div>
              <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '8px 10px' }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: '#389e0d', display: 'block', marginBottom: 6 }}>최종 결재선</Text>
                {resolved.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>포함될 결재자가 없습니다.</Text>
                ) : (
                  <Space size={[4, 4]} wrap>
                    {resolved.map((s, i) => (
                      <Tag key={i} color={s.condition ? 'gold' : 'blue'} style={{ margin: 0 }}>
                        {s.type === 'reference' ? '참조' : `${s.stepOrder}차`} · {s.kind === 'rule' ? `규칙:${s.position}` : s.approverName} · {ROLE_OPTIONS.find(o => o.value === s.type)?.label}{s.condition ? ' (조건)' : ''}
                      </Tag>
                    ))}
                  </Space>
                )}
              </div>
            </>
          );
        })()}
      </Modal>

      <Modal
        title={`미리보기 — ${previewTpl?.name || ''}`}
        open={!!previewTpl}
        onCancel={() => setPreviewTpl(null)}
        footer={<Button onClick={() => setPreviewTpl(null)}>닫기</Button>}
        width={560}
      >
        {previewTpl && (
          previewTpl.fieldsJson && JSON.parse(previewTpl.fieldsJson || '[]').length > 0
            ? <PreviewFields fieldsJson={previewTpl.fieldsJson} />
            : <Text type="secondary">폼 필드가 없습니다.</Text>
        )}
      </Modal>
    </>
  );
}

export default function ApprovalAdmin() {
  return (
    <div style={{ padding: '20px 24px' }}>
      <Typography.Title level={5} style={{ marginBottom: 16 }}>결재 양식 관리</Typography.Title>
      <Tabs
        items={[
          { key: 'types', label: '결재 양식 종류', children: <FormTypeTab /> },
          { key: 'templates', label: '양식 템플릿', children: <TemplateTab /> },
        ]}
      />
    </div>
  );
}
