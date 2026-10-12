import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Form, Input, Select, Button, Space, Upload, message, Typography, Divider,
  Card, DatePicker, InputNumber, Avatar, Radio, Checkbox, Modal, Tooltip, Popconfirm, Row, Col, Tag,
} from 'antd';
import {
  DeleteOutlined, PaperClipOutlined, SaveOutlined,
  SendOutlined, ArrowLeftOutlined, HolderOutlined, StarOutlined,
  UpOutlined, DownOutlined,
} from '@ant-design/icons';
import {
  getApprovalFormTypes, getApprovalTemplates, getApprovalTemplate, getApproval,
  resolveApprovalLine, createApproval, updateApproval, submitApproval,
  uploadApprovalAttachment, getFreeformApprovalTemplate,
} from '../../api/approval';
import {
  getApprovalLinePresets, updateApprovalLinePresets,
  getSharedApprovalLinePresets, addSharedApprovalLinePreset, deleteSharedApprovalLinePreset,
} from '../../api/settings';
import { getUsers } from '../../api/users';
import { flowStepsOf, groupOrdersOf, nextGroupNo, compactGroups } from '../../utils/approvalLine';
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

export default function DocumentForm({ embedded = false, initialDocId = null, copyFromId = null, freeform = false, onClose, onSaved } = {}) {
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
  const [sharedPresets, setSharedPresets] = useState([]);
  const [draggingUid, setDraggingUid] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetShared, setPresetShared] = useState(false);
  // 병렬그룹 완료조건 — { [stepOrder]: {mode:'all'|'any'|'quorum', n?} }. 지정 없으면 'all'(전원 동의).
  // 결재선 구조를 바꾸는 조작(병합/분리/순서이동/추가/삭제/역할변경)은 전부 이 상태를 초기화한다 —
  // 차수 번호에 매달아두면 멤버 구성이 바뀐 뒤에도 과거 설정이 새 멤버에게 그대로 눌러붙어
  // "의도치 않게 완화된 승인 조건"이 조용히 적용되는 위험이 있어, 구조가 바뀌면 안전한 기본값
  // (전원 동의)으로 되돌리고 사용자가 다시 지정하게 한다.
  const [groupPolicies, setGroupPolicies] = useState({});

  // approvalLine 각 행의 안정적인 로컬 식별자 — approverId는 유일하지 않을 수 있다
  // (직급/직책 규칙이 특정 사용자를 직접 지정한 행과 같은 사람으로 해석되는 경우 등).
  // 병합/분리/삭제/역할변경/드래그를 approverId로 매칭하면 동명의 다른 행까지 함께 바뀌므로
  // 행 생성 시 한 번 부여하는 _uid를 조작 키로 쓴다(백엔드 전송 payload에는 포함하지 않음).
  const uidSeq = useRef(0);
  const newUid = () => `s${++uidSeq.current}`;
  const withUid = (arr) => arr.map(s => ({ ...s, _uid: newUid() }));

  useEffect(() => {
    getApprovalLinePresets().then(setPresets).catch(() => {});
    getSharedApprovalLinePresets().then(setSharedPresets).catch(() => {});
  }, []);

  // 프리셋 불러오기 (개인/팀 공유 통합 목록에서)
  const loadPreset = (pid) => {
    const p = [...presets, ...sharedPresets].find(x => x.id === pid);
    if (!p) return;
    setApprovalLine(withUid((p.steps || []).map(s => ({
      approverId: s.approverId, approverName: s.approverName,
      type: s.type || 'approval', stepOrder: s.stepOrder || 0,
    }))));
    setGroupPolicies({});
    message.success(`결재선 '${p.name}'을 불러왔습니다.`);
  };
  // 현재 결재선을 프리셋으로 저장 — "팀과 공유" 체크 시 전원이 쓸 수 있는 공유 프리셋으로 저장
  const savePreset = async () => {
    if (!presetName.trim()) { message.warning('프리셋 이름을 입력하세요.'); return; }
    if (approvalLine.length === 0) { message.warning('저장할 결재선이 없습니다.'); return; }
    const entry = {
      id: `${presetShared ? 's' : 'p'}${Date.now()}`,
      name: presetName.trim(),
      steps: approvalLine.map(s => ({ approverId: s.approverId, approverName: s.approverName, type: s.type, stepOrder: s.stepOrder })),
    };
    try {
      if (presetShared) {
        // 서버가 그 순간의 최신 공유 프리셋 배열에 1건만 추가해 반환 — 다른 사람이 그 사이에
        // 추가/삭제한 내용을 덮어쓰지 않는다(이전의 "전체 배열 PUT" 방식은 동시 편집 시
        // lost-update 위험이 있었다).
        const next = await addSharedApprovalLinePreset(entry);
        setSharedPresets(next);
      } else {
        const next = [...presets, entry];
        setPresets(next);
        await updateApprovalLinePresets(next);
      }
      message.success(presetShared ? '팀 공유 결재선 프리셋을 저장했습니다.' : '결재선 프리셋을 저장했습니다.');
    } catch { message.error('프리셋 저장 실패'); }
    setSaveOpen(false); setPresetName(''); setPresetShared(false);
  };
  const deletePreset = async (pid, shared) => {
    if (shared) {
      try {
        const next = await deleteSharedApprovalLinePreset(pid);
        setSharedPresets(next);
      } catch {}
    } else {
      const next = presets.filter(p => p.id !== pid);
      setPresets(next);
      try { await updateApprovalLinePresets(next); } catch {}
    }
  };
  // 결재자를 특정 차수 그룹에 병합(드래그&드롭) — 같은 차수 = 병렬 결재. _uid로 매칭해
  // 같은 approverId가 두 행에 있어도(직급 규칙이 직접 지정자와 같은 사람으로 풀리는 경우 등)
  // 드래그한 그 행 하나만 움직인다.
  const mergeIntoGroup = (uid, targetOrder) => {
    setApprovalLine(prev => compactGroups(prev.map(s => (s._uid === uid ? { ...s, stepOrder: targetOrder } : s))));
    setGroupPolicies({});
  };
  // 병렬 그룹에서 결재자 한 명을 바로 다음 차수의 단독 그룹으로 분리 — 뒤쪽 차수를 정수로 한 칸씩
  // 밀어 자리를 만든 뒤 분리 대상을 그 자리에 바로 배정한다(소수 임시값 없이 항상 정수 유지).
  const splitToNewGroup = (uid) => {
    setApprovalLine(prev => {
      const item = prev.find(s => s._uid === uid);
      if (!item) return prev;
      const curOrder = item.stepOrder;
      const shifted = prev.map(s => {
        if (s.type === 'reference') return s;
        if (s._uid === uid) return { ...s, stepOrder: curOrder + 1 };
        if (s.stepOrder > curOrder) return { ...s, stepOrder: s.stepOrder + 1 };
        return s;
      });
      return compactGroups(shifted);
    });
    setGroupPolicies({});
  };
  // 그룹(차수) 전체를 앞/뒤 그룹과 맞바꿔 순서 이동 — 항상 1..N 연속이라는 가정 대신, 실제
  // 정렬된 차수 목록에서 진짜 이웃 값을 찾아 스왑한다(조건부 결재자용으로 비워둔 차수 등
  // gap이 있는 상태에서도 ▲▼가 조용히 no-op 되지 않도록).
  const moveGroup = (order, dir) => {
    const orders = groupOrdersOf(approvalLine);
    const gi = orders.indexOf(order);
    const neighbor = orders[gi + dir];
    if (neighbor === undefined) return;
    setApprovalLine(prev => prev.map(s => {
      if (s.type === 'reference') return s;
      if (s.stepOrder === order) return { ...s, stepOrder: neighbor };
      if (s.stepOrder === neighbor) return { ...s, stepOrder: order };
      return s;
    }));
    // 순서만 바뀌고 그룹 구성원은 그대로이므로, 완료조건도 번호를 따라 함께 맞바꾼다
    // (병합/분리처럼 구성원 자체가 바뀌는 조작과 달리 리셋할 이유가 없음)
    setGroupPolicies(prev => {
      const a = prev[order], b = prev[neighbor];
      const next = { ...prev };
      if (b === undefined) delete next[order]; else next[order] = b;
      if (a === undefined) delete next[neighbor]; else next[neighbor] = a;
      return next;
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
      const line = withUid(doc.steps.map(s => ({
        approverId: s.approverId, approverName: s.approver?.displayName,
        type: s.type || 'approval', stepOrder: s.stepOrder || 0,
      })));
      setApprovalLine(line);
      try { setGroupPolicies(doc.groupPolicyJson ? JSON.parse(doc.groupPolicyJson) : {}); } catch { setGroupPolicies({}); }
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
      setApprovalLine(withUid((doc.steps || []).map(s => ({
        approverId: s.approverId, approverName: s.approver?.displayName,
        type: s.type || 'approval', stepOrder: s.stepOrder || 0,
      }))));
      try { setGroupPolicies(doc.groupPolicyJson ? JSON.parse(doc.groupPolicyJson) : {}); } catch { setGroupPolicies({}); }
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
    if (!tplId) { setSelectedTemplate(null); setFields([]); setApprovalLine([]); setGroupPolicies({}); return; }
    try {
      const tpl = await getApprovalTemplate(tplId);
      setSelectedTemplate(tpl);
      setFields(tpl.fieldsJson ? JSON.parse(tpl.fieldsJson) : []);
      // 프리셋 결재선을 조직 기준으로 해석(고정 사용자 + 직급 규칙). 조건부는 별도 미리보기.
      try {
        const fd = form.getFieldValue('formData') || {};
        const { steps, conditional, unresolved } = await resolveApprovalLine(tplId, fd);
        setApprovalLine(withUid(steps.map(s => ({
          approverId: s.approverId, approverName: s.approverName,
          type: s.type || 'approval', stepOrder: s.type === 'reference' ? 0 : s.stepOrder,
        }))));
        setGroupPolicies({});
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

  // 자유 양식(제목+본문)으로 빠르게 시작 — 관리자가 양식을 미리 만들어두지 않아도 즉시 작성 가능.
  // 양식종류/양식 선택란은 그대로 두어(자동으로만 채워줌) 원하면 다른 정식 양식으로 바꿀 수 있다.
  useEffect(() => {
    if (!freeform || isEdit || copyId) return;
    getFreeformApprovalTemplate().then(tpl => {
      setSelectedTypeId(tpl.formType?.id);
      form.setFieldValue('templateId', tpl.id);
      handleTemplateChange(tpl.id);
    }).catch(() => message.error('자유 양식을 불러오지 못했습니다.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeform]);

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

  // 중복 체크를 setApprovalLine 업데이터 내부에서 수행 — 더블클릭 등으로 같은 틱에
  // addApprover가 두 번 불려도 둘 다 바깥의(오래된) approvalLine 스냅샷만 보고 통과시키는
  // 일이 없도록 한다.
  const addApprover = (userId) => {
    if (!userId) return;
    let duplicate = false;
    setApprovalLine(prev => {
      if (prev.some(s => s.approverId === userId)) { duplicate = true; return prev; }
      const found = users.find(u => u.id === userId);
      return [...prev, { _uid: newUid(), approverId: userId, approverName: found?.displayName || '', type: 'approval', stepOrder: nextGroupNo(prev) }];
    });
    if (duplicate) message.warning('이미 추가된 결재자입니다.');
  };

  const removeApprover = (uid) => {
    setApprovalLine(prev => compactGroups(prev.filter(s => s._uid !== uid)));
    setGroupPolicies({});
  };

  const setRole = (uid, type) => {
    setApprovalLine(prev => compactGroups(prev.map(s => {
      if (s._uid !== uid) return s;
      // 참조로 바꾸면 그룹에서 제외(0), 참조에서 벗어나면 새 그룹 부여
      const stepOrder = type === 'reference' ? 0 : (s.stepOrder || nextGroupNo(prev));
      return { ...s, type, stepOrder };
    })));
    setGroupPolicies({});
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
      groupPolicies,
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

  // 결재라인 시각화 — 참조 제외/포함 분리 + 차수(그룹) 목록. approvalLine이 바뀔 때만 재계산.
  const approverSelectId = 'new-approver-select';
  const flowItems = useMemo(() => flowStepsOf(approvalLine), [approvalLine]);
  const refItems = useMemo(() => approvalLine.filter(s => s.type === 'reference'), [approvalLine]);
  const orders = useMemo(() => groupOrdersOf(approvalLine), [approvalLine]);

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
              {(presets.length > 0 || sharedPresets.length > 0) && (
                <Select
                  placeholder="프리셋 불러오기" style={{ width: 160 }} size="small"
                  value={null} onChange={loadPreset} popupMatchSelectWidth={false}
                >
                  {presets.length > 0 && (
                    <Select.OptGroup label="내 프리셋">
                      {presets.map(p => (
                        <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                      ))}
                    </Select.OptGroup>
                  )}
                  {sharedPresets.length > 0 && (
                    <Select.OptGroup label="팀 공유">
                      {sharedPresets.map(p => (
                        <Select.Option key={p.id} value={p.id}>⭐ {p.name}</Select.Option>
                      ))}
                    </Select.OptGroup>
                  )}
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
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
                <HolderOutlined /> 결재자를 다른 차수 상자로 드래그하면 그 차수와 <b>병렬</b> 결재로 묶입니다 · 상자의 ▲▼로 차수 순서 이동.
              </Text>
              {orders.map((order, gi) => {
                const items = flowItems.filter(s => s.stepOrder === order);
                const parallel = items.length > 1;
                return (
                  <div
                    key={order}
                    onDragOver={(e) => { if (draggingUid != null) e.preventDefault(); }}
                    onDrop={() => { if (draggingUid != null) mergeIntoGroup(draggingUid, order); setDraggingUid(null); }}
                    style={{
                      border: `1px solid var(--fd-border, #f0f0f0)`, borderLeft: '3px solid #1677ff',
                      borderRadius: 6, padding: '6px 10px', marginBottom: 8,
                      background: 'var(--fd-bg-layout, #fafafa)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <Text strong style={{ fontSize: 13 }}>{order}차</Text>
                      {parallel && <Tag color="cyan" style={{ margin: 0, fontSize: 13, lineHeight: '16px' }}>병렬</Tag>}
                      {parallel && (
                        <Space size={4}>
                          <Select
                            size="small" style={{ width: 92 }}
                            value={groupPolicies[order]?.mode || 'all'}
                            onChange={(v) => setGroupPolicies(prev => ({
                              ...prev,
                              // 과반수 기본값 = floor(n/2)+1 — 짝수 인원(예: 4명)에서 ceil(n/2)을 쓰면
                              // 정확히 절반(2명)만으로 통과돼 "과반수"라는 이름과 실제 동작이 어긋난다.
                              [order]: v === 'quorum' ? { mode: 'quorum', n: Math.max(2, Math.floor(items.length / 2) + 1) } : { mode: v },
                            }))}
                            options={[
                              { value: 'all', label: '전원 동의' },
                              { value: 'any', label: '임의 1인' },
                              { value: 'quorum', label: '과반수' },
                            ]}
                          />
                          {groupPolicies[order]?.mode === 'quorum' && (
                            <Tooltip title="승인에 필요한 최소 인원">
                              <InputNumber
                                size="small" min={2} max={items.length} style={{ width: 54 }}
                                value={groupPolicies[order]?.n}
                                onChange={(v) => setGroupPolicies(prev => ({ ...prev, [order]: { mode: 'quorum', n: v } }))}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      )}
                      <Space size={0} style={{ marginLeft: 'auto' }}>
                        <Button size="small" type="text" icon={<UpOutlined />} disabled={gi === 0} onClick={() => moveGroup(order, -1)} />
                        <Button size="small" type="text" icon={<DownOutlined />} disabled={gi === orders.length - 1} onClick={() => moveGroup(order, 1)} />
                      </Space>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {items.map(step => (
                        <div key={step._uid}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(step._uid)); setDraggingUid(step._uid); }}
                          onDragEnd={() => setDraggingUid(null)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                            borderRadius: 16, background: 'var(--fd-bg-container, #fff)',
                            border: '1px solid var(--fd-border, #f0f0f0)',
                            opacity: draggingUid === step._uid ? 0.4 : 1, cursor: 'grab',
                          }}>
                          <HolderOutlined style={{ color: '#bbb', flexShrink: 0 }} />
                          <Avatar size={24} style={{ background: '#1677ff', fontSize: 13, flexShrink: 0 }}>
                            {step.approverName?.[0] || '?'}
                          </Avatar>
                          <Text style={{ fontSize: 13, maxWidth: 90 }} ellipsis>{step.approverName}</Text>
                          <Select
                            size="small" value={step.type} style={{ width: 78 }}
                            onChange={(v) => setRole(step._uid, v)}
                            options={ROLE_OPTIONS}
                          />
                          {parallel && (
                            <Tooltip title="새 차수로 분리">
                              <Button size="small" type="text" onClick={() => splitToNewGroup(step._uid)}>분리</Button>
                            </Tooltip>
                          )}
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeApprover(step._uid)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {refItems.length > 0 && (
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--fd-border, #f0f0f0)' }}>
                  <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>참조 (열람 통보)</Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {refItems.map(step => (
                      <div key={step._uid} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                        borderRadius: 16, background: 'var(--fd-bg-container, #fff)',
                        border: '1px solid var(--fd-border, #f0f0f0)',
                      }}>
                        <Avatar size={24} style={{ background: '#8c8c8c', fontSize: 13, flexShrink: 0 }}>
                          {step.approverName?.[0] || '?'}
                        </Avatar>
                        <Text style={{ fontSize: 13, maxWidth: 90 }} ellipsis>{step.approverName}</Text>
                        <Select
                          size="small" value={step.type} style={{ width: 78 }}
                          onChange={(v) => setRole(step._uid, v)}
                          options={ROLE_OPTIONS}
                        />
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeApprover(step._uid)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {conditionalPreview.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff7e6', border: '1px solid #ffe7ba', borderRadius: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: 600, color: '#d46b08' }}>
                조건 충족 · 상신 시 자동 추가될 결재자
              </Text>
              <div style={{ marginTop: 4 }}>
                {conditionalPreview.map((s, i) => (
                  <div key={`${s.approverId}-${i}`} style={{ fontSize: 13, color: '#874d00' }}>
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
        onCancel={() => { setSaveOpen(false); setPresetName(''); setPresetShared(false); }}
        footer={null}
      >
        <div style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>현재 결재선 저장</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Input placeholder="프리셋 이름 (예: 지출결재 표준선)" value={presetName}
              onChange={e => setPresetName(e.target.value)} onPressEnter={savePreset} />
            <Button type="primary" onClick={savePreset} disabled={approvalLine.length === 0}>저장</Button>
          </div>
          <Checkbox checked={presetShared} onChange={e => setPresetShared(e.target.checked)} style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 13 }}>팀과 공유 (전원이 열람·사용 가능)</Text>
          </Checkbox>
          {approvalLine.length === 0 && <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>먼저 결재자를 추가하세요.</Text>}
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <Text style={{ fontSize: 13, fontWeight: 600 }}>내 프리셋</Text>
        {presets.length === 0 ? (
          <div style={{ color: '#999', fontSize: 13, padding: '8px 0' }}>저장된 프리셋이 없습니다.</div>
        ) : (
          <div style={{ marginTop: 6, marginBottom: 12 }}>
            {presets.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{p.name} <Text type="secondary" style={{ fontSize: 13 }}>({(p.steps || []).length}명)</Text></span>
                <Button size="small" onClick={() => { loadPreset(p.id); setSaveOpen(false); }}>불러오기</Button>
                <Popconfirm title="삭제하시겠습니까?" onConfirm={() => deletePreset(p.id, false)} okText="삭제" cancelText="취소">
                  <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
        <Text style={{ fontSize: 13, fontWeight: 600 }}>⭐ 팀 공유 프리셋</Text>
        {sharedPresets.length === 0 ? (
          <div style={{ color: '#999', fontSize: 13, padding: '8px 0' }}>공유된 프리셋이 없습니다.</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {sharedPresets.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{p.name} <Text type="secondary" style={{ fontSize: 13 }}>({(p.steps || []).length}명)</Text></span>
                <Button size="small" onClick={() => { loadPreset(p.id); setSaveOpen(false); }}>불러오기</Button>
                <Popconfirm title="삭제하시겠습니까? (팀 전체에서 사라집니다)" onConfirm={() => deletePreset(p.id, true)} okText="삭제" cancelText="취소">
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
