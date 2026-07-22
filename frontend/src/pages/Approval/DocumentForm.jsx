import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Form, Input, Select, Button, Space, Upload, message, Typography, Divider,
  Card, DatePicker, InputNumber, Avatar, Radio, Checkbox, Modal, Tooltip, Popconfirm, Row, Col,
} from 'antd';
import {
  DeleteOutlined, PaperClipOutlined, SaveOutlined,
  SendOutlined, ArrowLeftOutlined, HolderOutlined, StarOutlined,
} from '@ant-design/icons';
import {
  getApprovalFormTypes, getApprovalTemplates, getApprovalTemplate, getApproval,
  resolveApprovalLine, createApproval, updateApproval, submitApproval,
  uploadApprovalAttachment,
} from '../../api/approval';
import { getApprovalLinePresets, updateApprovalLinePresets } from '../../api/settings';
import { getUsers } from '../../api/users';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

// 결재선 역할
const ROLE_OPTIONS = [
  { value: 'approval', label: '승인' },
  { value: 'agreement', label: '합의' },
  { value: 'delegation', label: '전결' },
  { value: 'reference', label: '참조' },
];

// 선택지 파싱 헬퍼
function parseOptions(options) {
  if (Array.isArray(options)) return options;
  return options ? options.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

// 동적 폼 필드 렌더러
function DynamicField({ field, form, users = [] }) {
  const { type, label, required, options, placeholder, id: fieldId } = field;

  const rules = required ? [{ required: true, message: `${label}을(를) 입력하세요.` }] : [];

  switch (type) {
    case 'divider':
      return (
        <Divider key={fieldId} orientation="left" style={{ fontSize: 13, color: '#888' }}>
          {label}
        </Divider>
      );
    case 'money':
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <InputNumber
            style={{ width: '100%' }}
            placeholder={placeholder || '금액'}
            formatter={v => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
            parser={v => (v ? v.replace(/,/g, '') : '')}
            addonAfter="원"
          />
        </Form.Item>
      );
    case 'radio': {
      const opts = parseOptions(options);
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <Radio.Group options={opts} />
        </Form.Item>
      );
    }
    case 'checkbox': {
      const opts = parseOptions(options);
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <Checkbox.Group options={opts} />
        </Form.Item>
      );
    }
    case 'user':
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <Select
            placeholder={placeholder || '사용자 선택'}
            showSearch optionFilterProp="children" allowClear
          >
            {users.map(u => <Select.Option key={u.id} value={u.displayName}>{u.displayName} ({u.username})</Select.Option>)}
          </Select>
        </Form.Item>
      );
    case 'text':
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <Input placeholder={placeholder || ''} />
        </Form.Item>
      );
    case 'textarea':
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <TextArea rows={3} placeholder={placeholder || ''} />
        </Form.Item>
      );
    case 'number':
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <InputNumber style={{ width: '100%' }} placeholder={placeholder || ''} />
        </Form.Item>
      );
    case 'date':
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      );
    case 'select': {
      const opts = Array.isArray(options) ? options : (options ? options.split('\n').map(s => s.trim()).filter(Boolean) : []);
      return (
        <Form.Item key={fieldId} name={['formData', fieldId]} label={label} rules={rules}>
          <Select placeholder={placeholder || '선택'}>
            {opts.map(o => <Select.Option key={o} value={o}>{o}</Select.Option>)}
          </Select>
        </Form.Item>
      );
    }
    default:
      return null;
  }
}

export default function DocumentForm({ embedded = false, initialDocId = null, copyFromId = null, onClose, onSaved } = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = embedded ? initialDocId : params.id;
  const isEdit = !!id;
  const copyId = embedded ? copyFromId : searchParams.get('copyFrom');

  // 저장/상신 후 이동: 페이지 모드는 라우팅, 임베드(Drawer) 모드는 콜백
  const afterSave = (savedId) => {
    if (embedded) onSaved?.(savedId);
    else navigate(`/approvals/${savedId}`);
  };
  const goBack = () => { if (embedded) onClose?.(); else navigate(-1); };

  const [form] = Form.useForm();
  const [formTypes, setFormTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [approvalLine, setApprovalLine] = useState([]); // [{approverId, approverName, type, stepOrder}]
  const [conditionalPreview, setConditionalPreview] = useState([]); // 조건 통과 시 자동 추가될 결재자
  const [users, setUsers] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [docId, setDocId] = useState(id ? Number(id) : null);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState(null);
  const [isUrgent, setIsUrgent] = useState(false);
  const [dueDate, setDueDate] = useState(null);
  const [presets, setPresets] = useState([]);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => { getApprovalLinePresets().then(setPresets).catch(() => {}); }, []);

  // 프리셋 불러오기
  const loadPreset = (pid) => {
    const p = presets.find(x => x.id === pid);
    if (!p) return;
    setApprovalLine((p.steps || []).map(s => ({
      approverId: s.approverId, approverName: s.approverName,
      type: s.type || 'approval', stepOrder: s.stepOrder || 0,
    })));
    message.success(`결재선 '${p.name}'을 불러왔습니다.`);
  };
  // 현재 결재선을 프리셋으로 저장
  const savePreset = async () => {
    if (!presetName.trim()) { message.warning('프리셋 이름을 입력하세요.'); return; }
    if (approvalLine.length === 0) { message.warning('저장할 결재선이 없습니다.'); return; }
    const next = [
      ...presets,
      {
        id: Date.now(),
        name: presetName.trim(),
        steps: approvalLine.map(s => ({ approverId: s.approverId, approverName: s.approverName, type: s.type, stepOrder: s.stepOrder })),
      },
    ];
    setPresets(next);
    try { await updateApprovalLinePresets(next); message.success('결재선 프리셋을 저장했습니다.'); }
    catch { message.error('프리셋 저장 실패'); }
    setSaveOpen(false); setPresetName('');
  };
  const deletePreset = async (pid) => {
    const next = presets.filter(p => p.id !== pid);
    setPresets(next);
    try { await updateApprovalLinePresets(next); } catch {}
  };
  // 드래그로 결재자 순서 변경 — 비참조는 순차 차수로 재설정(참조는 0)
  const moveApprover = (from, to) => {
    setApprovalLine(prev => {
      if (from == null || to == null || from === to) return prev;
      const arr = [...prev];
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      let c = 0;
      return arr.map(s => (s.type === 'reference' ? { ...s, stepOrder: 0 } : { ...s, stepOrder: ++c }));
    });
  };

  useEffect(() => {
    Promise.all([getApprovalFormTypes(), getUsers()]).then(([types, userList]) => {
      setFormTypes(types);
      setUsers(userList.filter ? userList.filter(u => u.isActive !== false) : userList);
    }).catch(() => message.error('데이터를 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!selectedTypeId) { setTemplates([]); return; }
    getApprovalTemplates({ formTypeId: selectedTypeId }).then(setTemplates).catch(() => {});
  }, [selectedTypeId]);

  useEffect(() => {
    if (!isEdit) return;
    getApproval(id).then(doc => {
      setDocId(doc.id);
      setSelectedTypeId(doc.template?.formType?.id);
      form.setFieldsValue({ templateId: doc.templateId, title: doc.title });
      const fd = doc.formData ? JSON.parse(doc.formData) : {};
      // formData 필드 설정
      form.setFieldsValue({ formData: fd });
      // 기존 결재라인 (역할·그룹 포함)
      const line = doc.steps.map(s => ({
        approverId: s.approverId, approverName: s.approver?.displayName,
        type: s.type || 'approval', stepOrder: s.stepOrder || 0,
      }));
      setApprovalLine(line);
      setExistingAttachments(doc.attachments || []);
      setIsUrgent(!!doc.isUrgent);
      setDueDate(doc.dueDate ? dayjs(doc.dueDate) : null);
      // 템플릿 로드
      getApprovalTemplate(doc.templateId).then(tpl => {
        setSelectedTemplate(tpl);
        setFields(tpl.fieldsJson ? JSON.parse(tpl.fieldsJson) : []);
      }).catch(() => {});
    }).catch(() => message.error('문서를 불러오지 못했습니다.'));
  }, [id, isEdit]);

  // 문서 복제: 기존 문서 내용·결재선을 새 초안으로 프리필 (docId는 설정하지 않아 새 문서로 저장)
  useEffect(() => {
    if (isEdit || !copyId) return;
    getApproval(copyId).then(doc => {
      setSelectedTypeId(doc.template?.formType?.id);
      form.setFieldsValue({ templateId: doc.templateId, title: `[사본] ${doc.title}` });
      const fd = doc.formData ? JSON.parse(doc.formData) : {};
      form.setFieldsValue({ formData: fd });
      setApprovalLine((doc.steps || []).map(s => ({
        approverId: s.approverId, approverName: s.approver?.displayName,
        type: s.type || 'approval', stepOrder: s.stepOrder || 0,
      })));
      setIsUrgent(!!doc.isUrgent);
      setDueDate(doc.dueDate ? dayjs(doc.dueDate) : null);
      getApprovalTemplate(doc.templateId).then(tpl => {
        setSelectedTemplate(tpl);
        setFields(tpl.fieldsJson ? JSON.parse(tpl.fieldsJson) : []);
        form.setFieldsValue({ formData: fd });
      }).catch(() => {});
      message.info('기존 문서를 복제했습니다. 내용을 확인 후 상신하세요.');
    }).catch(() => message.error('원본 문서를 불러오지 못했습니다.'));
  }, [copyId, isEdit]);

  const handleTemplateChange = async (tplId) => {
    if (!tplId) { setSelectedTemplate(null); setFields([]); setApprovalLine([]); return; }
    try {
      const tpl = await getApprovalTemplate(tplId);
      setSelectedTemplate(tpl);
      setFields(tpl.fieldsJson ? JSON.parse(tpl.fieldsJson) : []);
      // 프리셋 결재선을 조직 기준으로 해석(고정 사용자 + 직급 규칙). 조건부는 별도 미리보기.
      try {
        const fd = form.getFieldValue('formData') || {};
        const { steps, conditional, unresolved } = await resolveApprovalLine(tplId, fd);
        setApprovalLine(steps.map(s => ({
          approverId: s.approverId, approverName: s.approverName,
          type: s.type || 'approval', stepOrder: s.type === 'reference' ? 0 : s.stepOrder,
        })));
        setConditionalPreview(conditional || []);
        if (unresolved?.length) {
          message.warning(`프리셋 중 ${unresolved.length}개 항목을 자동 지정하지 못했습니다. 결재자를 직접 추가하세요.`);
        }
      } catch {
        setApprovalLine([]);
        setConditionalPreview([]);
      }
    } catch {
      message.error('템플릿을 불러오지 못했습니다.');
    }
  };

  // 폼 값이 바뀌면 조건부 자동 결재자 미리보기만 갱신 (편집한 결재선은 건드리지 않음)
  const handleValuesChange = async (changed) => {
    if (!('formData' in changed)) return;
    const tplId = form.getFieldValue('templateId');
    if (!tplId) return;
    try {
      const fd = form.getFieldValue('formData') || {};
      const { conditional } = await resolveApprovalLine(tplId, fd);
      setConditionalPreview(conditional || []);
    } catch {}
  };

  const nextGroupNo = (line) => {
    const gs = line.filter(s => s.type !== 'reference').map(s => s.stepOrder);
    return gs.length ? Math.max(...gs) + 1 : 1;
  };

  const addApprover = (userId) => {
    if (!userId) return;
    if (approvalLine.some(s => s.approverId === userId)) {
      message.warning('이미 추가된 결재자입니다.');
      return;
    }
    const found = users.find(u => u.id === userId);
    setApprovalLine(prev => [
      ...prev,
      { approverId: userId, approverName: found?.displayName || '', type: 'approval', stepOrder: nextGroupNo(prev) },
    ]);
  };

  const removeApprover = (idx) => setApprovalLine(prev => prev.filter((_, i) => i !== idx));

  const setRole = (idx, type) => {
    setApprovalLine(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      // 참조로 바꾸면 그룹에서 제외(0), 참조에서 벗어나면 새 그룹 부여
      const stepOrder = type === 'reference' ? 0 : (s.stepOrder || nextGroupNo(prev));
      return { ...s, type, stepOrder };
    }));
  };

  const setGroup = (idx, stepOrder) => {
    setApprovalLine(prev => prev.map((s, i) => (i === idx ? { ...s, stepOrder: Math.max(1, Number(stepOrder) || 1) } : s)));
  };

  const buildPayload = async () => {
    const values = await form.validateFields();
    if (approvalLine.filter(s => s.type !== 'reference').length === 0) {
      message.warning('승인/합의/전결 결재자를 1명 이상 추가하세요. (참조만으로는 상신할 수 없습니다.)');
      throw new Error('no approver');
    }
    const formData = {};
    if (values.formData) {
      for (const [k, v] of Object.entries(values.formData)) {
        if (v !== undefined && v !== null) {
          formData[k] = v instanceof Object && v.$isDayjsObject ? v.format('YYYY-MM-DD') : v;
        }
      }
    }
    return {
      templateId: values.templateId,
      title: values.title,
      formData: JSON.stringify(formData),
      isUrgent,
      dueDate: dueDate ? dueDate.format('YYYY-MM-DD') : null,
      steps: approvalLine.map(s => ({
        approverId: s.approverId,
        type: s.type || 'approval',
        stepOrder: s.type === 'reference' ? 0 : s.stepOrder,
      })),
    };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = await buildPayload();
      let saved;
      if (isEdit) {
        saved = await updateApproval(id, payload);
        setDocId(Number(id));
      } else {
        saved = await createApproval(payload);
        setDocId(saved.id);
      }
      for (const file of pendingFiles) {
        await uploadApprovalAttachment(saved.id, file);
      }
      message.success('임시저장되었습니다.');
      afterSave(saved.id);
    } catch (err) {
      if (err.message === 'no approver' || err?.errorFields) return;
      message.error('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const payload = await buildPayload();
      let saved;
      if (docId) {
        await updateApproval(docId, payload);
        for (const file of pendingFiles) {
          await uploadApprovalAttachment(docId, file);
        }
        await submitApproval(docId);
      } else {
        saved = await createApproval(payload);
        for (const file of pendingFiles) {
          await uploadApprovalAttachment(saved.id, file);
        }
        await submitApproval(saved.id);
        setDocId(saved.id);
      }
      message.success('상신되었습니다.');
      afterSave(docId || saved?.id);
    } catch (err) {
      if (err.message === 'no approver' || err?.errorFields) return;
      message.error('상신 실패');
    } finally {
      setSubmitting(false);
    }
  };

  // 결재라인 시각화
  const approverSelectId = 'new-approver-select';

  return (
    <div style={{ maxWidth: embedded ? '100%' : 860, margin: '0 auto', padding: embedded ? 0 : '24px 16px' }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0 }}>{isEdit ? '결재 문서 수정' : '결재 요청'}</Title>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>돌아가기</Button>
        </div>
      )}

      <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
        {/* 양식 선택 */}
        <Card size="small" title="양식 선택" style={{ marginBottom: 12 }}>
          <Form.Item label="결재 양식 종류">
            <Select
              placeholder="양식 종류 선택"
              onChange={v => { setSelectedTypeId(v); form.setFieldValue('templateId', undefined); setSelectedTemplate(null); setFields([]); setApprovalLine([]); }}
              value={selectedTypeId}
            >
              {formTypes.map(t => (
                <Select.Option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="templateId" label="결재 양식" rules={[{ required: true, message: '양식을 선택하세요.' }]}>
            <Select placeholder="양식 선택" onChange={handleTemplateChange} disabled={!selectedTypeId}>
              {templates.map(t => (
                <Select.Option key={t.id} value={t.id}>{t.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력하세요.' }]}>
            <Input placeholder="결재 문서 제목" maxLength={200} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Checkbox checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)}>
              <span style={{ color: isUrgent ? '#e0483d' : undefined, fontWeight: isUrgent ? 700 : 400 }}>🔴 긴급</span>
            </Checkbox>
            <Space size={8}>
              <Text style={{ fontSize: 13, color: '#888' }}>결재 마감기한</Text>
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                placeholder="선택 (선택사항)"
                disabledDate={(d) => d && d < dayjs().startOf('day')}
              />
            </Space>
          </div>
        </Card>

        {/* 동적 폼 필드 (필드 폭 반영: 반칸=12, 전체=24) */}
        {fields.length > 0 && (
          <Card size="small" title="결재 내용" style={{ marginBottom: 12 }}>
            <Row gutter={16}>
              {fields.map(f => (
                <Col key={f.id} xs={24} sm={f.type === 'divider' ? 24 : (f.width === 'half' ? 12 : 24)}>
                  <DynamicField field={f} form={form} users={users} />
                </Col>
              ))}
            </Row>
          </Card>
        )}

        {/* 결재라인 */}
        <Card
          size="small"
          title="결재 라인"
          style={{ marginBottom: 12 }}
          extra={
            <Space size={4} wrap>
              {presets.length > 0 && (
                <Select
                  placeholder="프리셋 불러오기" style={{ width: 140 }} size="small"
                  value={null} onChange={loadPreset} popupMatchSelectWidth={false}
                >
                  {presets.map(p => (
                    <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                  ))}
                </Select>
              )}
              <Tooltip title="현재 결재선을 프리셋으로 저장/관리">
                <Button size="small" icon={<StarOutlined />}
                  onClick={() => { setSaveOpen(true); setPresetName(''); }} />
              </Tooltip>
              <Select
                id={approverSelectId}
                placeholder="결재자 추가"
                style={{ width: 180 }}
                showSearch
                optionFilterProp="children"
                onChange={addApprover}
                value={null}
                size="small"
              >
                {users.map(u => (
                  <Select.Option key={u.id} value={u.id}>
                    {u.displayName}{u.position ? ` · ${u.position}` : ''} ({u.username})
                  </Select.Option>
                ))}
              </Select>
            </Space>
          }
        >
          {approvalLine.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 13 }}>결재자를 추가하세요. 위 선택박스에서 추가합니다.</Text>
          ) : (
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                <HolderOutlined /> 드래그로 순서 변경(차수 순차 재설정) · 같은 <b>차수</b>는 병렬 결재 · 참조는 열람 통보.
              </Text>
              {approvalLine.map((step, i) => (
                <div key={step.approverId}
                  draggable
                  onDragStart={() => setDraggingIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { moveApprover(draggingIdx, i); setDraggingIdx(null); }}
                  onDragEnd={() => setDraggingIdx(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    borderRadius: 6, marginBottom: 6, background: 'var(--fd-bg-layout, #fafafa)',
                    opacity: draggingIdx === i ? 0.4 : 1, cursor: 'grab',
                    border: '1px solid var(--fd-border, #f0f0f0)',
                  }}>
                  <HolderOutlined style={{ color: '#bbb', flexShrink: 0 }} />
                  <Avatar size={26} style={{ background: '#1677ff', fontSize: 12, flexShrink: 0 }}>
                    {step.approverName?.[0] || '?'}
                  </Avatar>
                  <Text style={{ fontSize: 13, flex: 1, minWidth: 0 }} ellipsis>{step.approverName}</Text>
                  <Select
                    size="small" value={step.type} style={{ width: 82 }}
                    onChange={(v) => setRole(i, v)}
                    options={ROLE_OPTIONS}
                  />
                  {step.type === 'reference' ? (
                    <Text type="secondary" style={{ width: 62, fontSize: 12, textAlign: 'center' }}>열람</Text>
                  ) : (
                    <Space size={2} style={{ width: 62 }}>
                      <InputNumber
                        size="small" min={1} value={step.stepOrder} controls={false}
                        onChange={(v) => setGroup(i, v)}
                        style={{ width: 44 }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>차</Text>
                    </Space>
                  )}
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeApprover(i)} />
                </div>
              ))}
            </div>
          )}

          {conditionalPreview.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff7e6', border: '1px solid #ffe7ba', borderRadius: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: 600, color: '#d46b08' }}>
                조건 충족 · 상신 시 자동 추가될 결재자
              </Text>
              <div style={{ marginTop: 4 }}>
                {conditionalPreview.map((s, i) => (
                  <div key={`${s.approverId}-${i}`} style={{ fontSize: 12, color: '#874d00' }}>
                    · {s.stepOrder ? `${s.stepOrder}차 ` : '참조 '}{s.approverName}
                    {s.ruleLabel ? ` (${s.ruleLabel})` : ''} — {ROLE_OPTIONS.find(o => o.value === s.type)?.label || s.type}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </Form>

      {/* 첨부파일 */}
      <Card size="small" title="첨부파일" style={{ marginBottom: 12 }}>
        {existingAttachments.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {existingAttachments.map(att => (
              <div key={att.id} style={{ fontSize: 13, padding: '2px 0' }}>
                <PaperClipOutlined style={{ marginRight: 6 }} />{att.originalName}
              </div>
            ))}
          </div>
        )}
        <Upload
          multiple
          beforeUpload={file => { setPendingFiles(prev => [...prev, file]); return false; }}
          onRemove={file => setPendingFiles(prev => prev.filter(f => f.uid !== file.uid))}
          fileList={pendingFiles.map(f => ({ uid: f.uid || f.name, name: f.name, status: 'done' }))}
        >
          <Button size="small" icon={<PaperClipOutlined />}>파일 첨부</Button>
        </Upload>
      </Card>

      <Divider />
      <Space>
        <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave}>임시저장</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>상신</Button>
        <Button onClick={goBack}>취소</Button>
      </Space>

      {/* 결재선 프리셋 저장/관리 */}
      <Modal
        title={<Space><StarOutlined />결재선 프리셋</Space>}
        open={saveOpen}
        onCancel={() => { setSaveOpen(false); setPresetName(''); }}
        footer={null}
      >
        <div style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>현재 결재선 저장</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Input placeholder="프리셋 이름 (예: 지출결재 표준선)" value={presetName}
              onChange={e => setPresetName(e.target.value)} onPressEnter={savePreset} />
            <Button type="primary" onClick={savePreset} disabled={approvalLine.length === 0}>저장</Button>
          </div>
          {approvalLine.length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>먼저 결재자를 추가하세요.</Text>}
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <Text style={{ fontSize: 13, fontWeight: 600 }}>저장된 프리셋</Text>
        {presets.length === 0 ? (
          <div style={{ color: '#999', fontSize: 12, padding: '8px 0' }}>저장된 프리셋이 없습니다.</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {presets.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{p.name} <Text type="secondary" style={{ fontSize: 11 }}>({(p.steps || []).length}명)</Text></span>
                <Button size="small" onClick={() => { loadPreset(p.id); setSaveOpen(false); }}>불러오기</Button>
                <Popconfirm title="삭제하시겠습니까?" onConfirm={() => deletePreset(p.id)} okText="삭제" cancelText="취소">
                  <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
