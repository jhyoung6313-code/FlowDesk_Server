import { useState, useEffect, useCallback } from 'react';
import {
  Button, Select, Progress, Tag, Empty, Spin, message, Modal, Form, Input, DatePicker,
  InputNumber, Space, Popconfirm, Typography, Tooltip, Checkbox, List,
} from 'antd';
import {
  PlusOutlined, FlagOutlined, AimOutlined, DeleteOutlined, EditOutlined,
  CheckCircleOutlined, RiseOutlined, LinkOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useAuthStore from '../../store/authStore';
import { getUsers } from '../../api/users';
import { getTasks } from '../../api/tasks';
import {
  getCycles, createCycle, getTree,
  createObjective, updateObjective, deleteObjective,
  createKeyResult, updateKeyResult, deleteKeyResult, createCheckin,
  getLinks, addLink, removeLink,
} from '../../api/okr';

const SCOPE = { company: { label: '전사', color: 'purple' }, dept: { label: '부서', color: 'geekblue' }, team: { label: '팀', color: 'blue' }, personal: { label: '개인', color: 'default' } };
const STATUS = { on_track: { label: '정상', color: 'success' }, at_risk: { label: '주의', color: 'warning' }, off_track: { label: '위험', color: 'error' } };
const METRIC = { percent: '%', number: '수치', boolean: '완료여부' };

function progressColor(p) { return p >= 70 ? '#52c41a' : p >= 40 ? '#faad14' : '#ff4d4f'; }

// ── KR 행 ──
function KrRow({ kr, canEdit, users, onCheckin, onEdit, onDelete, onLink }) {
  const unit = kr.metricType === 'percent' ? '%' : kr.metricType === 'boolean' ? '' : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px dashed var(--fd-border)' }}>
      <AimOutlined style={{ color: 'var(--fd-text-secondary)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{kr.title}
          {kr.autoProgress && <Tooltip title="연결 업무 완료율로 자동 계산"><Tag color="cyan" style={{ marginLeft: 6 }}>자동</Tag></Tooltip>}
          {kr._count?.links > 0 && <Tag style={{ marginLeft: 6 }}><LinkOutlined /> {kr._count.links}</Tag>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fd-text-secondary)' }}>
          {kr.metricType === 'boolean' ? '완료 여부' : `${Number(kr.currentValue)}${unit} / ${Number(kr.targetValue)}${unit}`}
          {kr.owner && <span style={{ marginLeft: 8 }}>· {kr.owner.displayName}</span>}
        </div>
      </div>
      <Progress type="circle" percent={kr.progress} size={38} strokeColor={progressColor(kr.progress)} />
      {canEdit && (
        <Space size={2}>
          <Tooltip title="체크인"><Button size="small" type="text" icon={<RiseOutlined />} onClick={() => onCheckin(kr)} /></Tooltip>
          <Tooltip title="업무 연결"><Button size="small" type="text" icon={<LinkOutlined />} onClick={() => onLink(kr)} /></Tooltip>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(kr)} />
          <Popconfirm title="KR을 삭제할까요?" onConfirm={() => onDelete(kr)}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      )}
    </div>
  );
}

// ── 목표 카드 ──
function ObjectiveCard({ obj, canEdit, users, onChanged, onAddKr, onCheckin, onEditKr, onLink }) {
  const setStatus = async (status) => { await updateObjective(obj.id, { status }); onChanged(); };
  return (
    <div style={{ border: '1px solid var(--fd-border)', borderRadius: 8, padding: 16, marginBottom: 14, background: 'var(--fd-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space wrap size={6}>
            <Tag color={SCOPE[obj.scope]?.color}>{SCOPE[obj.scope]?.label}</Tag>
            <FlagOutlined style={{ color: progressColor(obj.progress) }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>{obj.title}</span>
          </Space>
          {obj.description && <div style={{ color: 'var(--fd-text-secondary)', fontSize: 12, marginTop: 4 }}>{obj.description}</div>}
          <div style={{ fontSize: 12, color: 'var(--fd-text-secondary)', marginTop: 4 }}>책임자: {obj.owner?.displayName}</div>
        </div>
        <div style={{ textAlign: 'center', width: 120 }}>
          <Progress percent={obj.progress} strokeColor={progressColor(obj.progress)} />
          {canEdit ? (
            <Select size="small" value={obj.status} style={{ width: 90, marginTop: 4 }} onChange={setStatus}
              options={Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
          ) : <Tag color={STATUS[obj.status]?.color} style={{ marginTop: 4 }}>{STATUS[obj.status]?.label}</Tag>}
        </div>
        {canEdit && (
          <Popconfirm title="목표를 삭제할까요?" description="핵심결과도 함께 삭제됩니다." okType="danger" onConfirm={async () => { await deleteObjective(obj.id); onChanged(); }}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        {obj.keyResults.length === 0
          ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>핵심결과(KR)가 없습니다.</Typography.Text>
          : obj.keyResults.map((kr) => (
              <KrRow key={kr.id} kr={kr} canEdit={canEdit} users={users}
                onCheckin={onCheckin} onEdit={onEditKr} onLink={onLink}
                onDelete={async (k) => { await deleteKeyResult(k.id); onChanged(); }} />
            ))}
        {canEdit && <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => onAddKr(obj)}>핵심결과 추가</Button>}
      </div>
    </div>
  );
}

export default function OkrPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState(null);
  const [objectives, setObjectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  const [objModal, setObjModal] = useState(false);
  const [krModal, setKrModal] = useState(null); // { objId } or { kr }
  const [checkinKr, setCheckinKr] = useState(null);
  const [cycleModal, setCycleModal] = useState(false);
  const [linkKr, setLinkKr] = useState(null);
  const [links, setLinks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [linkTaskId, setLinkTaskId] = useState(null);

  const [objForm] = Form.useForm();
  const [krForm] = Form.useForm();
  const [checkinForm] = Form.useForm();
  const [cycleForm] = Form.useForm();

  useEffect(() => { getUsers().then(setUsers).catch(() => {}); }, []);

  // KR ↔ 업무 연결 모달
  const openLink = async (kr) => {
    setLinkKr(kr); setLinkTaskId(null);
    try {
      const [ls] = await Promise.all([
        getLinks(kr.id),
        allTasks.length ? Promise.resolve() : getTasks().then(setAllTasks),
      ]);
      setLinks(ls);
    } catch { message.error('연결 정보를 불러오지 못했습니다.'); }
  };
  const doAddLink = async () => {
    if (!linkTaskId) return;
    await addLink(linkKr.id, linkTaskId);
    setLinks(await getLinks(linkKr.id)); setLinkTaskId(null); loadTree();
  };
  const doRemoveLink = async (linkId) => {
    await removeLink(linkKr.id, linkId);
    setLinks(await getLinks(linkKr.id)); loadTree();
  };

  const loadCycles = useCallback(async () => {
    const cs = await getCycles();
    setCycles(cs);
    setCycleId((prev) => prev || (cs.find((c) => c.isActive)?.id ?? cs[0]?.id ?? null));
    return cs;
  }, []);
  useEffect(() => { loadCycles().catch(() => message.error('주기를 불러오지 못했습니다.')); }, [loadCycles]);

  const loadTree = useCallback(async () => {
    if (!cycleId) { setObjectives([]); setLoading(false); return; }
    setLoading(true);
    try { setObjectives(await getTree(cycleId)); }
    catch { message.error('목표를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, [cycleId]);
  useEffect(() => { loadTree(); }, [loadTree]);

  const cycleProgress = objectives.length ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length) : 0;

  // 목표 생성
  const submitObjective = async () => {
    const v = await objForm.validateFields();
    await createObjective({ cycleId, ...v });
    setObjModal(false); objForm.resetFields(); loadTree();
    message.success('목표를 생성했습니다.');
  };

  // KR 생성/수정
  const submitKr = async () => {
    const v = await krForm.validateFields();
    if (krModal.kr) { await updateKeyResult(krModal.kr.id, v); message.success('KR을 수정했습니다.'); }
    else { await createKeyResult(krModal.objId, v); message.success('KR을 추가했습니다.'); }
    setKrModal(null); krForm.resetFields(); loadTree();
  };

  // 체크인
  const submitCheckin = async () => {
    const v = await checkinForm.validateFields();
    await createCheckin(checkinKr.id, v);
    setCheckinKr(null); checkinForm.resetFields(); loadTree();
    message.success('체크인을 기록했습니다.');
  };

  // 주기 생성
  const submitCycle = async () => {
    const v = await cycleForm.validateFields();
    const c = await createCycle({ name: v.name, startDate: v.range[0].toISOString(), endDate: v.range[1].toISOString() });
    setCycleModal(false); cycleForm.resetFields();
    await loadCycles(); setCycleId(c.id);
    message.success('주기를 생성했습니다.');
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="fd-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>🎯 OKR / 목표 관리</Typography.Title>
        <Select
          value={cycleId} onChange={setCycleId} style={{ minWidth: 180 }} placeholder="주기 선택"
          options={cycles.map((c) => ({ value: c.id, label: `${c.name}${c.isActive ? ' (진행중)' : ''}` }))}
          notFoundContent="주기가 없습니다"
        />
        {isAdmin && <Button icon={<PlusOutlined />} onClick={() => setCycleModal(true)}>주기</Button>}
        <div style={{ flex: 1 }} />
        {cycleId && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { objForm.resetFields(); setObjModal(true); }}>목표 추가</Button>
        )}
      </div>

      {cycleId && objectives.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--fd-surface-sunken)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 600 }}>주기 전체 진척</span>
          <Progress percent={cycleProgress} strokeColor={progressColor(cycleProgress)} style={{ flex: 1 }} />
          <span style={{ color: 'var(--fd-text-secondary)', fontSize: 12 }}>목표 {objectives.length}개</span>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
        : !cycleId ? (
          <Empty description={isAdmin ? '주기를 먼저 생성하세요' : '설정된 OKR 주기가 없습니다'} style={{ marginTop: 48 }}>
            {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCycleModal(true)}>주기 만들기</Button>}
          </Empty>
        ) : objectives.length === 0 ? (
          <Empty description="이 주기에 목표가 없습니다" style={{ marginTop: 48 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { objForm.resetFields(); setObjModal(true); }}>목표 추가</Button>
          </Empty>
        ) : objectives.map((obj) => (
          <ObjectiveCard key={obj.id} obj={obj}
            canEdit={isAdmin || obj.ownerId === user?.id} users={users}
            onChanged={loadTree}
            onAddKr={(o) => { krForm.resetFields(); krForm.setFieldsValue({ metricType: 'percent', startValue: 0, targetValue: 100, currentValue: 0 }); setKrModal({ objId: o.id }); }}
            onEditKr={(kr) => { krForm.setFieldsValue(kr); setKrModal({ kr }); }}
            onCheckin={(kr) => { checkinForm.resetFields(); checkinForm.setFieldsValue({ value: Number(kr.currentValue) }); setCheckinKr(kr); }}
            onLink={openLink}
          />
        ))}

      {/* 목표 모달 */}
      <Modal title="새 목표(Objective)" open={objModal} onCancel={() => setObjModal(false)} onOk={submitObjective} okText="생성">
        <Form form={objForm} layout="vertical">
          <Form.Item name="title" label="목표" rules={[{ required: true, message: '목표를 입력하세요' }]}>
            <Input placeholder="예) 고객 만족도를 업계 최고 수준으로 끌어올린다" maxLength={300} />
          </Form.Item>
          <Form.Item name="description" label="설명"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="scope" label="범위" initialValue="team">
              <Select style={{ width: 120 }} options={Object.entries(SCOPE).map(([v, s]) => ({ value: v, label: s.label }))} />
            </Form.Item>
            <Form.Item name="ownerId" label="책임자">
              <Select style={{ width: 160 }} placeholder="본인" allowClear optionFilterProp="label"
                options={users.map((u) => ({ value: u.id, label: u.displayName }))} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* KR 모달 */}
      <Modal title={krModal?.kr ? '핵심결과 수정' : '핵심결과(KR) 추가'} open={!!krModal} onCancel={() => setKrModal(null)} onOk={submitKr} okText="저장">
        <Form form={krForm} layout="vertical">
          <Form.Item name="title" label="핵심결과" rules={[{ required: true, message: 'KR을 입력하세요' }]}>
            <Input placeholder="예) NPS 40 → 60 달성" maxLength={300} />
          </Form.Item>
          <Space align="start" wrap>
            <Form.Item name="metricType" label="측정 유형" initialValue="percent">
              <Select style={{ width: 120 }} options={Object.entries(METRIC).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
            <Form.Item name="startValue" label="시작값"><InputNumber style={{ width: 90 }} /></Form.Item>
            <Form.Item name="targetValue" label="목표값"><InputNumber style={{ width: 90 }} /></Form.Item>
            <Form.Item name="currentValue" label="현재값"><InputNumber style={{ width: 90 }} /></Form.Item>
          </Space>
          <Form.Item name="ownerId" label="담당자">
            <Select style={{ width: 200 }} placeholder="미지정" allowClear optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: u.displayName }))} />
          </Form.Item>
          <Form.Item name="autoProgress" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>연결된 업무 완료율로 진척 자동 계산</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* KR ↔ 업무 연결 모달 */}
      <Modal title={<span><LinkOutlined /> 업무 연결 — {linkKr?.title}</span>} open={!!linkKr} onCancel={() => setLinkKr(null)} footer={<Button onClick={() => setLinkKr(null)}>닫기</Button>}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          업무를 연결하면 KR의 <b>자동 진척</b> 옵션이 켜져 있을 때 연결 업무 완료율로 진척이 계산됩니다.
        </Typography.Paragraph>
        <Space.Compact style={{ display: 'flex', marginBottom: 12 }}>
          <Select showSearch value={linkTaskId} onChange={setLinkTaskId} placeholder="업무 선택" style={{ flex: 1 }} optionFilterProp="label"
            options={allTasks.map((t) => ({ value: t.id, label: t.title }))} />
          <Button type="primary" icon={<PlusOutlined />} onClick={doAddLink}>연결</Button>
        </Space.Compact>
        <List size="small" dataSource={links} locale={{ emptyText: '연결된 업무가 없습니다.' }}
          renderItem={(l) => (
            <List.Item actions={[<a key="x" onClick={() => doRemoveLink(l.id)}>해제</a>]}>
              {l.task ? <span>{l.task.status === 'done' ? '✅' : '⬜'} {l.task.title}{l.task.delYn === '1' && <Tag color="default" style={{ marginLeft: 6 }}>삭제됨</Tag>}</span> : `업무 #${l.refId}`}
            </List.Item>
          )} />
      </Modal>

      {/* 체크인 모달 */}
      <Modal title={<span><CheckCircleOutlined /> 체크인 — {checkinKr?.title}</span>} open={!!checkinKr} onCancel={() => setCheckinKr(null)} onOk={submitCheckin} okText="기록">
        <Form form={checkinForm} layout="vertical">
          <Form.Item name="value" label="현재값" rules={[{ required: true, message: '현재값을 입력하세요' }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="confidence" label="신뢰도 (1~10)"><InputNumber min={1} max={10} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="comment" label="코멘트"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} /></Form.Item>
        </Form>
      </Modal>

      {/* 주기 모달 */}
      <Modal title="새 OKR 주기" open={cycleModal} onCancel={() => setCycleModal(false)} onOk={submitCycle} okText="생성">
        <Form form={cycleForm} layout="vertical">
          <Form.Item name="name" label="주기 이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
            <Input placeholder="예) 2026 Q3" maxLength={50} />
          </Form.Item>
          <Form.Item name="range" label="기간" rules={[{ required: true, message: '기간을 선택하세요' }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
