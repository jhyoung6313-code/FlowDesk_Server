import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Input, Select, Form, Card, Typography, Space, Tag, Divider,
  Collapse, Switch, InputNumber, Tooltip, Popconfirm, message, Spin,
  Row, Col, Badge, List, TimePicker, DatePicker,
} from 'antd';
import ResizableDrawer from '../../components/common/ResizableDrawer';
import {
  PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined,
  DragOutlined, CheckSquareOutlined, LikeOutlined, InfoCircleOutlined,
  BranchesOutlined, UserOutlined, ClockCircleOutlined, WarningOutlined,
  HistoryOutlined, RollbackOutlined, ApiOutlined, CopyOutlined,
  ScheduleOutlined, PlayCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as pbApi from '../../api/playbook';
import { getUsers } from '../../api/users';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

const CATEGORY_OPTIONS = [
  { value: 'general',     label: '범용'        },
  { value: 'incident',    label: '인시던트'     },
  { value: 'release',     label: '배포/릴리즈'  },
  { value: 'onboarding',  label: '온보딩'       },
  { value: 'offboarding', label: '오프보딩'     },
  { value: 'review',      label: '정기점검'     },
  { value: 'maintenance', label: '유지보수'     },
  { value: 'emergency',   label: '긴급대응'     },
];

const STEP_TYPE_MAP = {
  task:     { label: '체크', icon: <CheckSquareOutlined />, color: '#1677ff' },
  approval: { label: '승인', icon: <LikeOutlined />,       color: '#52c41a' },
  note:     { label: '안내', icon: <InfoCircleOutlined />,  color: '#faad14' },
  decision: { label: '분기', icon: <BranchesOutlined />,   color: '#722ed1' },
};

const PHASE_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2'];

let tempId = 0;
const nextId = () => `t_${++tempId}`;

// ─── StepCard ───────────────────────────────────────────────

function StepCard({ step, phaseId, users, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const typeInfo = STEP_TYPE_MAP[step.type] || STEP_TYPE_MAP.task;

  return (
    <Card
      size="small"
      style={{ marginBottom: 8, borderLeft: `3px solid ${typeInfo.color}` }}
      bodyStyle={{ padding: '8px 12px' }}
    >
      {/* 1행: 유형 · 제목 · 담당자 · 기한 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Tooltip title={typeInfo.label}>
          <span style={{ color: typeInfo.color, fontSize: 14 }}>{typeInfo.icon}</span>
        </Tooltip>
        <Input
          value={step.title}
          onChange={(e) => onUpdate({ ...step, title: e.target.value })}
          placeholder="단계 제목"
          style={{ flex: 1, minWidth: 140, fontSize: 13 }}
          variant="borderless"
        />
        <Select
          value={step.assigneeMode === 'specific' ? step.assigneeUserId : undefined}
          onChange={(v) => onUpdate({
            ...step,
            assigneeMode: v ? 'specific' : 'unassigned',
            assigneeUserId: v ?? null,
          })}
          allowClear
          showSearch
          filterOption={filterUserOption}
          size="small"
          placeholder="담당자"
          suffixIcon={<UserOutlined />}
          style={{ width: 130 }}
          options={buildUserOptions(users, getMyDepartment())}
        />
        <DatePicker
          value={step.dueAt ? dayjs(step.dueAt) : null}
          onChange={(d) => onUpdate({ ...step, dueAt: d ? d.toISOString() : null })}
          showTime={{ format: 'HH:mm' }}
          format="MM/DD HH:mm"
          size="small"
          placeholder="기한"
          style={{ width: 150 }}
        />
        <Button
          type="text"
          size="small"
          onClick={() => setOpen((v) => !v)}
          style={{ color: '#888', fontSize: 11 }}
        >
          {open ? '접기' : '상세'}
        </Button>
        <Popconfirm title="삭제?" onConfirm={onDelete}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>

      {/* 2행: 메모 / 지침 (항상 노출) */}
      <TextArea
        value={step.instructions || ''}
        onChange={(e) => onUpdate({ ...step, instructions: e.target.value })}
        placeholder="메모 / 지침 (선택, {{변수}} 사용 가능)"
        autoSize={{ minRows: 1, maxRows: 4 }}
        size="small"
        style={{ marginTop: 6, fontSize: 12 }}
      />

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--fd-border)' }}>
          <Row gutter={[10, 10]}>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>유형</Text>
              <Select
                value={step.type}
                onChange={(v) => onUpdate({ ...step, type: v })}
                size="small"
                style={{ width: '100%' }}
              >
                {Object.entries(STEP_TYPE_MAP).map(([k, v]) => (
                  <Select.Option key={k} value={k}>{v.label}</Select.Option>
                ))}
              </Select>
            </Col>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>예상 시간 (분)</Text>
              <InputNumber
                value={step.estimatedMins}
                onChange={(v) => onUpdate({ ...step, estimatedMins: v })}
                size="small"
                min={1}
                style={{ width: '100%' }}
                placeholder="예: 30"
              />
            </Col>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>SLA (분)</Text>
              <InputNumber
                value={step.slaMins}
                onChange={(v) => onUpdate({ ...step, slaMins: v })}
                size="small"
                min={1}
                style={{ width: '100%' }}
                placeholder="초과 시 경고"
              />
            </Col>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>증거 필수</Text>
              <br />
              <Switch
                size="small"
                checked={!!step.requireEvidence}
                onChange={(v) => onUpdate({ ...step, requireEvidence: v })}
              />
            </Col>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>병렬 그룹 번호</Text>
              <InputNumber
                value={step.parallelGroup ?? null}
                onChange={(v) => onUpdate({ ...step, parallelGroup: v })}
                size="small"
                min={1}
                style={{ width: '100%' }}
                placeholder="같은 번호 = 병렬"
              />
            </Col>
            {step.type === 'decision' && (
              <Col span={24}>
                <Text type="secondary" style={{ fontSize: 11 }}>분기 옵션</Text>
                {(step.decisionOptions || []).map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    <Input
                      value={opt.label}
                      onChange={(e) => {
                        const opts = [...(step.decisionOptions || [])];
                        opts[idx] = { ...opts[idx], label: e.target.value };
                        onUpdate({ ...step, decisionOptions: opts });
                      }}
                      size="small"
                      placeholder="옵션 이름 (예: 예)"
                      style={{ flex: 2 }}
                    />
                    <InputNumber
                      value={opt.nextStepOrder ?? null}
                      onChange={(v) => {
                        const opts = [...(step.decisionOptions || [])];
                        opts[idx] = { ...opts[idx], nextStepOrder: v };
                        onUpdate({ ...step, decisionOptions: opts });
                      }}
                      size="small"
                      min={0}
                      placeholder="이동할 스텝 순서"
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="text" size="small" danger icon={<DeleteOutlined />}
                      onClick={() => {
                        const opts = (step.decisionOptions || []).filter((_, i) => i !== idx);
                        onUpdate({ ...step, decisionOptions: opts });
                      }}
                    />
                  </div>
                ))}
                <Button
                  type="dashed" size="small" icon={<PlusOutlined />}
                  style={{ marginTop: 6, width: '100%' }}
                  onClick={() => onUpdate({ ...step, decisionOptions: [...(step.decisionOptions || []), { label: '', nextStepOrder: null }] })}
                >
                  옵션 추가
                </Button>
                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                  "이동할 스텝 순서": 해당 번호 이전 스텝이 자동으로 스킵됩니다
                </Text>
              </Col>
            )}
          </Row>
        </div>
      )}
    </Card>
  );
}

// ─── PhaseBlock ──────────────────────────────────────────────

function PhaseBlock({ phase, steps, users, onPhaseUpdate, onPhaseDelete, onStepAdd, onStepUpdate, onStepDelete }) {
  const addStep = () => {
    onStepAdd({
      _tempId: nextId(),
      phaseTempId: phase._tempId,
      title: '',
      type: 'task',
      assigneeMode: 'unassigned',
      order: steps.length,
    });
  };

  return (
    <Card
      style={{ marginBottom: 16, borderTop: `3px solid ${phase.color || '#1677ff'}` }}
      bodyStyle={{ padding: '12px 16px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 12, height: 12, borderRadius: '50%',
            backgroundColor: phase.color || '#1677ff', flexShrink: 0,
          }}
        />
        <Input
          value={phase.name}
          onChange={(e) => onPhaseUpdate({ ...phase, name: e.target.value })}
          placeholder="페이즈 이름 (예: 탐지)"
          style={{ flex: 1, fontWeight: 600 }}
          variant="borderless"
        />
        <Select
          value={phase.color || '#1677ff'}
          onChange={(v) => onPhaseUpdate({ ...phase, color: v })}
          size="small"
          style={{ width: 80 }}
        >
          {PHASE_COLORS.map((c) => (
            <Select.Option key={c} value={c}>
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: c }} />
            </Select.Option>
          ))}
        </Select>
        <Badge count={steps.length} color={phase.color || '#1677ff'} />
        <Popconfirm title="페이즈와 포함된 단계를 모두 삭제합니까?" onConfirm={onPhaseDelete}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>

      {steps.map((s) => (
        <StepCard
          key={s._tempId}
          step={s}
          phaseId={phase._tempId}
          users={users}
          onUpdate={onStepUpdate}
          onDelete={() => onStepDelete(s._tempId)}
        />
      ))}

      <Button
        type="dashed"
        icon={<PlusOutlined />}
        size="small"
        onClick={addStep}
        style={{ width: '100%', marginTop: 4 }}
      >
        단계 추가
      </Button>
    </Card>
  );
}

// ─── VariableEditor ──────────────────────────────────────────

function VariableEditor({ variables, onChange }) {
  const add = () => onChange([...variables, { key: '', label: '', type: 'text', required: false }]);
  const remove = (i) => onChange(variables.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...variables];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        Run 시작 시 입력받을 변수. 단계 제목/지침에서 {'{{변수키}}'} 형태로 사용.
      </Text>
      {variables.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <Input
            value={v.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            placeholder="키 (영문)"
            size="small"
            style={{ width: 110 }}
          />
          <Input
            value={v.label}
            onChange={(e) => update(i, 'label', e.target.value)}
            placeholder="표시 이름"
            size="small"
            style={{ width: 130 }}
          />
          <Select
            value={v.type || 'text'}
            onChange={(val) => update(i, 'type', val)}
            size="small"
            style={{ width: 80 }}
          >
            <Select.Option value="text">텍스트</Select.Option>
            <Select.Option value="user">팀원</Select.Option>
          </Select>
          <Switch
            size="small"
            checked={!!v.required}
            onChange={(val) => update(i, 'required', val)}
            checkedChildren="필수"
            unCheckedChildren="선택"
          />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
        </div>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={add} style={{ marginTop: 8 }}>
        변수 추가
      </Button>
    </div>
  );
}

// ─── Main Editor ─────────────────────────────────────────────

export default function PlaybookEditor({ embedded = false, embeddedId = null, onClose, onSaved } = {}) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const id = embedded ? embeddedId : routeId;
  const isNew = !id || id === 'new';

  // 목록(닫기) 이동: 임베드 시 드로어 닫기, 아니면 라우트 이동
  const goList = () => (embedded ? onClose?.() : navigate('/playbooks'));

  const [form] = Form.useForm();
  const [schedForm] = Form.useForm();
  const [phases, setPhases] = useState([]);
  const [steps, setSteps] = useState([]);
  const [variables, setVariables] = useState([]);
  const [defaultParticipants, setDefaultParticipants] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [versionDrawer, setVersionDrawer] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [webhookDrawer, setWebhookDrawer] = useState(false);
  const [webhooks, setWebhooks] = useState([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [scheduleDrawer, setScheduleDrawer] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [schedRecType, setSchedRecType] = useState('weekly');

  useEffect(() => {
    getUsers().then((u) => setUsers(u.filter((x) => x.isActive)));
    if (!isNew) {
      pbApi.getPlaybook(id).then((pb) => {
        form.setFieldsValue({
          name: pb.name, description: pb.description,
          category: pb.category, isPublic: pb.isPublic,
        });
        setTags(pb.tags || []);
        setVariables(pb.variables || []);
        setDefaultParticipants(pb.defaultParticipants || []);

        const phaseList = pb.phases.map((ph) => ({ ...ph, _tempId: nextId() }));
        setPhases(phaseList);

        const phaseRealToTemp = {};
        phaseList.forEach((ph) => { phaseRealToTemp[ph.id] = ph._tempId; });

        setSteps(pb.steps.map((s) => ({
          ...s,
          _tempId: nextId(),
          phaseTempId: s.phaseId ? (phaseRealToTemp[s.phaseId] ?? null) : null,
        })));

        setLoading(false);
      }).catch(() => { message.error('불러오기 실패'); setLoading(false); });
    }
  }, [id]);

  const addPhase = () => {
    const color = PHASE_COLORS[phases.length % PHASE_COLORS.length];
    setPhases((prev) => [...prev, { _tempId: nextId(), name: '', color, order: prev.length }]);
  };

  const updatePhase = (updated) => setPhases((prev) => prev.map((p) => p._tempId === updated._tempId ? updated : p));
  const deletePhase = (_tempId) => {
    setPhases((prev) => prev.filter((p) => p._tempId !== _tempId));
    setSteps((prev) => prev.filter((s) => s.phaseTempId !== _tempId));
  };

  const addStep = (newStep) => setSteps((prev) => [...prev, newStep]);
  const updateStep = (updated) => setSteps((prev) => prev.map((s) => s._tempId === updated._tempId ? updated : s));
  const deleteStep = (_tempId) => setSteps((prev) => prev.filter((s) => s._tempId !== _tempId));

  const addFreeStep = () => {
    setSteps((prev) => [...prev, {
      _tempId: nextId(),
      phaseTempId: null,
      title: '',
      type: 'task',
      assigneeMode: 'unassigned',
      order: prev.length,
    }]);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const orderedPhases = phases.map((ph, i) => ({ ...ph, order: i }));
      const orderedSteps = steps.map((s, i) => ({ ...s, order: i }));

      const payload = {
        ...values,
        tags,
        variables,
        defaultParticipants,
        phases: orderedPhases,
        steps: orderedSteps,
      };

      if (isNew) {
        const pb = await pbApi.createPlaybook(payload);
        message.success('Playbook이 생성되었습니다.');
        if (embedded) { onSaved?.(pb); onClose?.(); }
        else navigate(`/playbooks/${pb.id}`);
      } else {
        await pbApi.updatePlaybook(id, payload);
        message.success('저장되었습니다.');
        if (embedded) { onSaved?.(); onClose?.(); }
        else navigate(`/playbooks/${id}`);
      }
    } catch (err) {
      if (!err?.errorFields) message.error('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenVersions = async () => {
    setVersionDrawer(true);
    setVersionLoading(true);
    try {
      setVersions(await pbApi.getPlaybookVersions(id));
    } catch { message.error('버전 이력 로드 실패'); }
    finally { setVersionLoading(false); }
  };

  const handleRestoreVersion = async (versionId) => {
    try {
      await pbApi.restorePlaybookVersion(id, versionId);
      message.success('롤백 완료. 페이지를 새로고침합니다.');
      setVersionDrawer(false);
      window.location.reload();
    } catch { message.error('롤백 실패'); }
  };

  const handleOpenWebhooks = async () => {
    setWebhookDrawer(true);
    setWebhookLoading(true);
    try { setWebhooks(await pbApi.getWebhooks(id)); }
    catch { message.error('웹훅 로드 실패'); }
    finally { setWebhookLoading(false); }
  };

  const handleCreateWebhook = async () => {
    if (!newWebhookName.trim()) return;
    try {
      const hook = await pbApi.createWebhook(id, { name: newWebhookName });
      setWebhooks((prev) => [...prev, hook]);
      setNewWebhookName('');
      message.success('웹훅이 생성되었습니다.');
    } catch { message.error('생성 실패'); }
  };

  const handleDeleteWebhook = async (hookId) => {
    try {
      await pbApi.deleteWebhook(id, hookId);
      setWebhooks((prev) => prev.filter((h) => h.id !== hookId));
      message.success('삭제되었습니다.');
    } catch { message.error('삭제 실패'); }
  };

  const getWebhookUrl = (token) => `${window.location.origin}/api/webhooks/trigger/${token}`;

  const handleOpenSchedules = async () => {
    setScheduleDrawer(true);
    setScheduleLoading(true);
    try { setSchedules(await pbApi.getSchedules(id)); }
    catch { message.error('스케줄 로드 실패'); }
    finally { setScheduleLoading(false); }
  };

  const handleCreateSchedule = async (values) => {
    try {
      const { recurrenceTime, ...rest } = values;
      const sched = await pbApi.createSchedule(id, {
        ...rest,
        recurrenceTime: recurrenceTime ? recurrenceTime.format('HH:mm') : '09:00',
      });
      setSchedules((prev) => [...prev, sched]);
      schedForm.resetFields();
      setSchedRecType('weekly');
      message.success('스케줄이 추가되었습니다.');
    } catch { message.error('추가 실패'); }
  };

  const handleToggleSchedule = async (scheduleId, isActive) => {
    try {
      const updated = await pbApi.updateSchedule(id, scheduleId, { isActive });
      setSchedules((prev) => prev.map((s) => s.id === scheduleId ? updated : s));
    } catch { message.error('수정 실패'); }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    try {
      await pbApi.deleteSchedule(id, scheduleId);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      message.success('삭제되었습니다.');
    } catch { message.error('삭제 실패'); }
  };

  const handleRunScheduleNow = async (scheduleId) => {
    try {
      await pbApi.runScheduleNow(id, scheduleId);
      message.success('Run이 즉시 생성되었습니다.');
    } catch { message.error('실행 실패'); }
  };

  const formatRecurrence = (s) => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    if (s.recurrenceType === 'daily') return `매일 ${s.recurrenceTime}`;
    if (s.recurrenceType === 'weekly') return `매주 ${days[s.recurrenceDay] ?? '?'}요일 ${s.recurrenceTime}`;
    if (s.recurrenceType === 'monthly') return `매월 ${s.recurrenceDay}일 ${s.recurrenceTime}`;
    return s.recurrenceType;
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;

  const freeSteps = steps.filter((s) => !s.phaseTempId);

  return (
    <div style={{ padding: embedded ? 0 : 24, maxWidth: embedded ? '100%' : 1000, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={goList}>{embedded ? '닫기' : '목록'}</Button>
        <Title level={4} style={{ margin: 0 }}>{isNew ? '새 Playbook' : 'Playbook 편집'}</Title>
        <Space>
          {!isNew && (
            <>
              <Button icon={<ScheduleOutlined />} onClick={handleOpenSchedules}>스케줄</Button>
              <Button icon={<ApiOutlined />} onClick={handleOpenWebhooks}>웹훅</Button>
              <Button icon={<HistoryOutlined />} onClick={handleOpenVersions}>버전 이력</Button>
            </>
          )}
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            저장
          </Button>
        </Space>
      </div>

      <Row gutter={24}>
        {/* 좌측: 기본 정보 */}
        <Col xs={24} md={10}>
          <Card title="기본 정보" size="small" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical" size="small">
              <Form.Item name="name" label="이름" rules={[{ required: true }]}>
                <Input placeholder="예: 서비스 장애 대응 절차" />
              </Form.Item>
              <Form.Item name="category" label="카테고리" initialValue="general">
                <Select options={CATEGORY_OPTIONS} />
              </Form.Item>
              <Form.Item name="description" label="설명">
                <TextArea rows={2} placeholder="Playbook 목적 및 적용 상황..." />
              </Form.Item>
              <Form.Item label="태그">
                <Select
                  mode="tags"
                  value={tags}
                  onChange={setTags}
                  placeholder="태그 입력 후 Enter"
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item
                label="기본 참여자"
                tooltip="이 Playbook으로 Run을 시작하면 자동으로 참여자로 등록됩니다."
              >
                <Select
                  mode="multiple"
                  value={defaultParticipants}
                  onChange={setDefaultParticipants}
                  placeholder="팀원 선택 (이름·부서 검색)"
                  style={{ width: '100%' }}
                  showSearch
                  filterOption={filterUserOption}
                  options={buildUserOptions(users, getMyDepartment())}
                />
              </Form.Item>
              <Form.Item name="isPublic" label="공개 범위" initialValue={true}>
                <Select>
                  <Select.Option value={true}>전체 공개</Select.Option>
                  <Select.Option value={false}>비공개</Select.Option>
                </Select>
              </Form.Item>
            </Form>
          </Card>

          <Card title="Variables" size="small">
            <VariableEditor variables={variables} onChange={setVariables} />
          </Card>
        </Col>

        {/* 우측: 페이즈 & 스텝 */}
        <Col xs={24} md={14}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={5} style={{ margin: 0 }}>페이즈 & 단계</Title>
            <Button icon={<PlusOutlined />} size="small" onClick={addPhase}>페이즈 추가</Button>
          </div>

          {phases.map((ph) => (
            <PhaseBlock
              key={ph._tempId}
              phase={ph}
              steps={steps.filter((s) => s.phaseTempId === ph._tempId)}
              users={users}
              onPhaseUpdate={updatePhase}
              onPhaseDelete={() => deletePhase(ph._tempId)}
              onStepAdd={addStep}
              onStepUpdate={updateStep}
              onStepDelete={deleteStep}
            />
          ))}

          {/* 페이즈 미지정 단계 */}
          {(phases.length === 0 || freeSteps.length > 0) && (
            <Card
              title={phases.length === 0 ? '단계 목록' : '페이즈 미지정 단계'}
              size="small"
              style={{ marginBottom: 16 }}
            >
              {freeSteps.map((s) => (
                <StepCard
                  key={s._tempId}
                  step={s}
                  users={users}
                  onUpdate={updateStep}
                  onDelete={() => deleteStep(s._tempId)}
                />
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                size="small"
                onClick={addFreeStep}
                style={{ width: '100%' }}
              >
                단계 추가
              </Button>
            </Card>
          )}

          {phases.length === 0 && freeSteps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#bbb' }}>
              페이즈 또는 단계를 추가하세요
            </div>
          )}
        </Col>
      </Row>

      {/* 버전 이력 Drawer */}
      <ResizableDrawer
        title="버전 이력"
        open={versionDrawer}
        onClose={() => setVersionDrawer(false)}
        width={360}
      >
        {versionLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : versions.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>버전 이력이 없습니다.</div>
        ) : (
          <List
            dataSource={versions}
            renderItem={(v) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="restore"
                    title={`v${v.version}으로 롤백하시겠습니까?`}
                    onConfirm={() => handleRestoreVersion(v.id)}
                  >
                    <Button size="small" icon={<RollbackOutlined />}>롤백</Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={`v${v.version}`}
                  description={
                    <>
                      <div style={{ fontSize: 11 }}>{v.creator?.displayName}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{dayjs(v.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </ResizableDrawer>

      {/* 자동 실행 스케줄 Drawer */}
      <ResizableDrawer
        title="자동 실행 스케줄"
        open={scheduleDrawer}
        onClose={() => setScheduleDrawer(false)}
        width={520}
      >
        <div style={{ marginBottom: 20, padding: 12, background: 'var(--fd-surface-sunken)', borderRadius: 6, border: '1px solid var(--fd-border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>새 스케줄 추가</div>
          <Form form={schedForm} layout="vertical" size="small" onFinish={handleCreateSchedule}>
            <Form.Item name="name" label="스케줄 이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
              <Input placeholder="예: 매주 월요일 주간 점검" />
            </Form.Item>
            <Row gutter={8}>
              <Col span={8}>
                <Form.Item name="recurrenceType" label="반복 유형" initialValue="weekly" rules={[{ required: true }]}>
                  <Select onChange={(v) => { setSchedRecType(v); schedForm.setFieldValue('recurrenceDay', undefined); }}>
                    <Select.Option value="daily">매일</Select.Option>
                    <Select.Option value="weekly">매주</Select.Option>
                    <Select.Option value="monthly">매월</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              {schedRecType === 'weekly' && (
                <Col span={8}>
                  <Form.Item name="recurrenceDay" label="요일" rules={[{ required: true, message: '요일 선택' }]}>
                    <Select placeholder="요일">
                      {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                        <Select.Option key={i} value={i}>{d}요일</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              )}
              {schedRecType === 'monthly' && (
                <Col span={8}>
                  <Form.Item name="recurrenceDay" label="일(日)" rules={[{ required: true, message: '날짜 입력' }]}>
                    <InputNumber min={1} max={31} style={{ width: '100%' }} placeholder="1~31" />
                  </Form.Item>
                </Col>
              )}
              <Col span={8}>
                <Form.Item name="recurrenceTime" label="실행 시각" initialValue={dayjs('09:00', 'HH:mm')} rules={[{ required: true, message: '시각 선택' }]}>
                  <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Button type="primary" htmlType="submit" size="small" icon={<PlusOutlined />}>추가</Button>
          </Form>
        </div>

        {scheduleLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : schedules.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>등록된 스케줄이 없습니다.</div>
        ) : (
          <List
            dataSource={schedules}
            renderItem={(s) => (
              <List.Item
                actions={[
                  <Tooltip key="run" title="지금 실행">
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={() => handleRunScheduleNow(s.id)}
                    />
                  </Tooltip>,
                  <Switch
                    key="active"
                    size="small"
                    checked={s.isActive}
                    onChange={(v) => handleToggleSchedule(s.id, v)}
                  />,
                  <Popconfirm key="del" title="스케줄을 삭제하시겠습니까?" onConfirm={() => handleDeleteSchedule(s.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={4}>
                      {s.name}
                      {!s.isActive && <Tag color="default" style={{ fontSize: 10 }}>비활성</Tag>}
                    </Space>
                  }
                  description={
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {formatRecurrence(s)}
                      {s.lastRunAt && ` · 마지막 실행: ${dayjs(s.lastRunAt).format('MM/DD HH:mm')}`}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </ResizableDrawer>

      {/* 웹훅 Drawer */}
      <ResizableDrawer
        title="웹훅 관리"
        open={webhookDrawer}
        onClose={() => setWebhookDrawer(false)}
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={newWebhookName}
              onChange={(e) => setNewWebhookName(e.target.value)}
              placeholder="웹훅 이름"
              onPressEnter={handleCreateWebhook}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateWebhook}>생성</Button>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            생성된 URL로 POST 요청 시 이 Playbook의 Run이 자동 시작됩니다.
          </div>
        </div>

        {webhookLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : webhooks.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>웹훅이 없습니다.</div>
        ) : (
          <List
            dataSource={webhooks}
            renderItem={(h) => {
              const url = getWebhookUrl(h.token);
              return (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="del"
                      title="웹훅을 삭제하시겠습니까?"
                      onConfirm={() => handleDeleteWebhook(h.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={h.name}
                    description={
                      <div>
                        <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--fd-text-secondary)', wordBreak: 'break-all' }}>
                          POST {url}
                        </div>
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          style={{ padding: 0, fontSize: 11 }}
                          onClick={() => { navigator.clipboard.writeText(url); message.success('URL 복사됨'); }}
                        >
                          URL 복사
                        </Button>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </ResizableDrawer>
    </div>
  );
}
