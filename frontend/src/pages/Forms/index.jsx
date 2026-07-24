import { useEffect, useState, useCallback } from 'react';
import {
  Card, Button, Space, Typography, Tag, message, Modal, Form, Input, Switch,
  Select, List, Empty, Spin, Popconfirm, Radio, Checkbox, Rate, InputNumber, DatePicker, Divider, Progress, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FormOutlined, BarChartOutlined,
  SendOutlined, EyeOutlined, PlayCircleOutlined, PauseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useAuthStore from '../../store/authStore';
import {
  getForms, getForm, createForm, updateForm, deleteForm, setFormStatus, submitForm, getFormResults,
} from '../../api/forms';

const FIELD_TYPES = [
  { value: 'text', label: '단답형' }, { value: 'textarea', label: '장문형' },
  { value: 'single', label: '단일 선택' }, { value: 'multiple', label: '복수 선택' },
  { value: 'rating', label: '별점(1~5)' }, { value: 'number', label: '숫자' }, { value: 'date', label: '날짜' },
];
const STATUS = { draft: { label: '초안', color: 'default' }, open: { label: '진행중', color: 'green' }, closed: { label: '마감', color: 'red' } };
const isChoice = (t) => t === 'single' || t === 'multiple';

// ── 설문 빌더 모달 ──
function BuilderModal({ open, editing, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({ title: editing.title, description: editing.description, anonymous: editing.anonymous, multiResponse: editing.multiResponse });
      setFields((editing.fields || []).map((f) => ({ type: f.type, label: f.label, required: f.required, options: (f.options || []).join('\n') })));
    } else {
      form.resetFields();
      setFields([{ type: 'text', label: '', required: false, options: '' }]);
    }
  }, [open, editing, form]);

  const setField = (i, patch) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const save = async () => {
    const v = await form.validateFields();
    const payload = {
      title: v.title, description: v.description || null, anonymous: !!v.anonymous, multiResponse: !!v.multiResponse,
      fields: fields.filter((f) => f.label.trim()).map((f) => ({
        type: f.type, label: f.label.trim(), required: !!f.required,
        options: isChoice(f.type) ? f.options.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      })),
    };
    if (!payload.fields.length) return message.warning('문항을 1개 이상 추가하세요.');
    setSaving(true);
    try {
      if (editing) await updateForm(editing.id, payload); else await createForm(payload);
      message.success(editing ? '수정되었습니다.' : '설문이 생성되었습니다.');
      onSaved(); onClose();
    } catch (err) {
      message.error(err.response?.data?.error || '저장에 실패했습니다.');
    } finally { setSaving(false); }
  };

  return (
    <Modal title={editing ? '설문 수정' : '새 설문'} open={open} onCancel={onClose} onOk={save} confirmLoading={saving} width={720} okText="저장">
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력하세요' }]}>
          <Input maxLength={200} placeholder="예) 사내 만족도 조사" />
        </Form.Item>
        <Form.Item name="description" label="설명"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <Space size={24}>
          <Form.Item name="anonymous" label="익명 응답" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="multiResponse" label="재응답 허용" valuePropName="checked"><Switch /></Form.Item>
        </Space>
        {editing?.responseCount > 0 && <Typography.Text type="warning" style={{ display: 'block', marginBottom: 8 }}>이미 응답이 있어 문항은 변경할 수 없습니다.</Typography.Text>}
        <Divider orientation="left" plain>문항</Divider>
        {fields.map((f, i) => (
          <Card key={i} size="small" style={{ marginBottom: 8 }}
            title={<Space><Select value={f.type} style={{ width: 130 }} options={FIELD_TYPES} onChange={(t) => setField(i, { type: t })} />
              <Checkbox checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })}>필수</Checkbox></Space>}
            extra={<Button size="small" danger icon={<DeleteOutlined />} onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} />}>
            <Input placeholder={`문항 ${i + 1}`} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} style={{ marginBottom: isChoice(f.type) ? 8 : 0 }} />
            {isChoice(f.type) && (
              <Input.TextArea rows={3} placeholder="보기를 줄바꿈으로 구분 (예:&#10;예&#10;아니오)" value={f.options} onChange={(e) => setField(i, { options: e.target.value })} />
            )}
          </Card>
        ))}
        <Button type="dashed" icon={<PlusOutlined />} block onClick={() => setFields((fs) => [...fs, { type: 'text', label: '', required: false, options: '' }])}>문항 추가</Button>
      </Form>
    </Modal>
  );
}

// ── 응답 작성 모달 ──
function FillModal({ formId, open, onClose, onSubmitted }) {
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && formId) { setAnswers({}); getForm(formId).then(setData).catch(() => message.error('설문을 불러오지 못했습니다.')); }
    else setData(null);
  }, [open, formId]);

  const submit = async () => {
    setSaving(true);
    try {
      const payload = (data.fields || []).map((f) => ({ fieldId: f.id, value: answers[f.id] ?? (f.type === 'multiple' ? [] : '') }));
      await submitForm(formId, payload);
      message.success('응답이 제출되었습니다.'); onSubmitted?.(); onClose();
    } catch (err) { message.error(err.response?.data?.error || '제출에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  const setA = (fid, v) => setAnswers((a) => ({ ...a, [fid]: v }));

  return (
    <Modal title={data?.title || '설문 응답'} open={open} onCancel={onClose} onOk={submit} confirmLoading={saving}
      okText="제출" okButtonProps={{ disabled: !data || data.alreadyResponded }} width={620}>
      {!data ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div> : data.alreadyResponded ? (
        <Empty description="이미 이 설문에 응답하셨습니다." />
      ) : (
        <>
          {data.description && <Typography.Paragraph type="secondary">{data.description}</Typography.Paragraph>}
          {data.fields.map((f) => (
            <Form.Item key={f.id} label={<span>{f.label}{f.required && <Typography.Text type="danger"> *</Typography.Text>}</span>} style={{ marginBottom: 16 }}>
              {f.type === 'text' && <Input value={answers[f.id] || ''} onChange={(e) => setA(f.id, e.target.value)} />}
              {f.type === 'textarea' && <Input.TextArea rows={3} value={answers[f.id] || ''} onChange={(e) => setA(f.id, e.target.value)} />}
              {f.type === 'number' && <InputNumber style={{ width: '100%' }} value={answers[f.id]} onChange={(v) => setA(f.id, v)} />}
              {f.type === 'rating' && <Rate value={answers[f.id] || 0} onChange={(v) => setA(f.id, v)} />}
              {f.type === 'date' && <DatePicker style={{ width: '100%' }} onChange={(d) => setA(f.id, d ? d.format('YYYY-MM-DD') : '')} />}
              {f.type === 'single' && <Radio.Group value={answers[f.id]} onChange={(e) => setA(f.id, e.target.value)}><Space direction="vertical">{f.options.map((o) => <Radio key={o} value={o}>{o}</Radio>)}</Space></Radio.Group>}
              {f.type === 'multiple' && <Checkbox.Group value={answers[f.id] || []} onChange={(v) => setA(f.id, v)}><Space direction="vertical">{f.options.map((o) => <Checkbox key={o} value={o}>{o}</Checkbox>)}</Space></Checkbox.Group>}
            </Form.Item>
          ))}
        </>
      )}
    </Modal>
  );
}

// ── 결과 모달 ──
function ResultsModal({ formId, open, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (open && formId) { setData(null); getFormResults(formId).then(setData).catch(() => message.error('결과를 불러오지 못했습니다.')); }
  }, [open, formId]);

  return (
    <Modal title={<span><BarChartOutlined /> {data?.title || '설문 결과'}</span>} open={open} onCancel={onClose} footer={<Button onClick={onClose}>닫기</Button>} width={640}>
      {!data ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div> : (
        <>
          <Typography.Text type="secondary">총 응답 {data.responseCount}건</Typography.Text>
          <Divider style={{ margin: '12px 0' }} />
          {data.summary.map((s) => (
            <div key={s.fieldId} style={{ marginBottom: 20 }}>
              <Typography.Text strong>{s.label}</Typography.Text>
              {s.counts && (
                <div style={{ marginTop: 8 }}>
                  {Object.entries(s.counts).map(([opt, n]) => {
                    const pct = data.responseCount ? Math.round((n / data.responseCount) * 100) : 0;
                    return <div key={opt} style={{ marginBottom: 6 }}><Space style={{ width: '100%', justifyContent: 'space-between' }}><span>{opt}</span><span>{n}표 ({pct}%)</span></Space><Progress percent={pct} showInfo={false} size="small" /></div>;
                  })}
                </div>
              )}
              {s.avg !== undefined && <div style={{ marginTop: 4 }}><Tag color="blue">평균 {s.avg}</Tag><Typography.Text type="secondary"> ({s.count}건)</Typography.Text></div>}
              {s.values && (
                <List size="small" style={{ marginTop: 4 }} dataSource={s.values.slice(0, 50)} locale={{ emptyText: '응답 없음' }}
                  renderItem={(v) => <List.Item style={{ padding: '4px 0' }}>{v}</List.Item>} />
              )}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

export default function FormsPage() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fillId, setFillId] = useState(null);
  const [resultsId, setResultsId] = useState(null);
  const user = useAuthStore((s) => s.user);

  const load = useCallback(() => {
    setLoading(true);
    getForms().then(setForms).catch(() => message.error('설문 목록을 불러오지 못했습니다.')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const mine = (f) => f.createdBy === user?.id || user?.role === 'admin';

  const openEdit = async (f) => { const full = await getForm(f.id); setEditing(full); setBuilderOpen(true); };
  const toggleStatus = async (f, status) => { try { await setFormStatus(f.id, status); load(); } catch (e) { message.error(e.response?.data?.error || '실패'); } };
  const remove = async (f) => { try { await deleteForm(f.id); message.success('삭제되었습니다.'); load(); } catch { message.error('삭제 실패'); } };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <Space className="fd-toolbar" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}><FormOutlined /> 설문 · 투표</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setBuilderOpen(true); }}>새 설문</Button>
      </Space>

      {loading ? <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
        : forms.length === 0 ? <Empty description="설문이 없습니다." />
          : (
            <List
              grid={{ gutter: 12, xs: 1, sm: 1, md: 2 }}
              dataSource={forms}
              renderItem={(f) => (
                <List.Item>
                  <Card size="small" style={{ borderRadius: 10 }}
                    title={<Space><Tag color={STATUS[f.status]?.color}>{STATUS[f.status]?.label}</Tag>{f.title}</Space>}
                    extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(f.createdAt).format('MM/DD')}</Typography.Text>}
                  >
                    <Space size={4} wrap style={{ marginBottom: 8 }}>
                      {f.anonymous && <Tag>익명</Tag>}
                      {f.multiResponse && <Tag>재응답</Tag>}
                      <Tag>문항 {f._count?.fields ?? 0}</Tag>
                      <Tag color="blue">응답 {f._count?.responses ?? 0}</Tag>
                    </Space>
                    <div>
                      <Space wrap>
                        {f.status === 'open' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => setFillId(f.id)}>응답</Button>}
                        {mine(f) && <Button size="small" icon={<BarChartOutlined />} onClick={() => setResultsId(f.id)}>결과</Button>}
                        {mine(f) && f.status !== 'open' && <Tooltip title="응답 받기 시작"><Button size="small" icon={<PlayCircleOutlined />} onClick={() => toggleStatus(f, 'open')}>개시</Button></Tooltip>}
                        {mine(f) && f.status === 'open' && <Tooltip title="응답 마감"><Button size="small" icon={<PauseCircleOutlined />} onClick={() => toggleStatus(f, 'closed')}>마감</Button></Tooltip>}
                        {mine(f) && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(f)} />}
                        {mine(f) && <Popconfirm title="삭제하시겠습니까?" onConfirm={() => remove(f)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
                      </Space>
                    </div>
                  </Card>
                </List.Item>
              )}
            />
          )}

      <BuilderModal open={builderOpen} editing={editing} onClose={() => setBuilderOpen(false)} onSaved={load} />
      <FillModal formId={fillId} open={!!fillId} onClose={() => setFillId(null)} onSubmitted={load} />
      <ResultsModal formId={resultsId} open={!!resultsId} onClose={() => setResultsId(null)} />
    </div>
  );
}
