import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button, Segmented, List, Empty, Spin, Tag, Avatar, Space, Typography, message,
  Modal, Form, Input, DatePicker, Select, Popconfirm, Tooltip, Checkbox, Divider,
} from 'antd';
import {
  PlusOutlined, TeamOutlined, EnvironmentOutlined, ClockCircleOutlined, EditOutlined,
  DeleteOutlined, SaveOutlined, CheckOutlined, CloseOutlined, ExportOutlined, SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import RichEditor from '../../components/RichEditor';
import useAuthStore from '../../store/authStore';
import { getUsers } from '../../api/users';
import {
  getMeetings, getMeeting, createMeeting, updateMeeting, deleteMeeting, rsvpMeeting,
  addDecision, deleteDecision, addActionItem, updateActionItem, deleteActionItem, actionItemToTask,
} from '../../api/meetings';

const STATUS = {
  scheduled: { label: '예정', color: 'blue' },
  in_progress: { label: '진행중', color: 'processing' },
  done: { label: '완료', color: 'success' },
  cancelled: { label: '취소', color: 'default' },
};
const RSVP = {
  invited: { label: '미응답', color: 'default' },
  accepted: { label: '참석', color: 'green' },
  declined: { label: '불참', color: 'red' },
  attended: { label: '참석함', color: 'blue' },
  absent: { label: '불참석', color: 'volcano' },
};

// ── 생성/수정 모달 ──
function MeetingModal({ open, onClose, onSaved, users, editing }) {
  const [form] = Form.useForm();
  const [agenda, setAgenda] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        form.setFieldsValue({
          title: editing.title,
          range: [dayjs(editing.startAt), editing.endAt ? dayjs(editing.endAt) : null],
          location: editing.location,
          attendeeUserIds: editing.attendees.filter((a) => a.userId).map((a) => a.userId),
        });
        setAgenda(editing.agenda.map((a) => ({ title: a.title, durationMin: a.durationMin })));
      } else {
        form.resetFields();
        setAgenda([]);
      }
    }
  }, [open, editing, form]);

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        title: v.title,
        startAt: v.range[0].toISOString(),
        endAt: v.range[1] ? v.range[1].toISOString() : null,
        location: v.location || null,
        attendeeUserIds: v.attendeeUserIds || [],
        agenda: agenda.filter((a) => a.title?.trim()),
      };
      const saved = editing ? await updateMeeting(editing.id, payload) : await createMeeting(payload);
      message.success(editing ? '수정되었습니다.' : '회의를 생성했습니다.');
      onSaved(saved);
      onClose();
    } catch (err) {
      if (err?.errorFields) return; // form validation
      message.error(err.response?.data?.error || '저장 실패');
    } finally { setSaving(false); }
  };

  return (
    <Modal title={editing ? '회의 수정' : '새 회의'} open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} width={640} okText="저장">
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력하세요' }]}>
          <Input placeholder="예) 주간 팀 정례회의" maxLength={200} />
        </Form.Item>
        <Form.Item name="range" label="일시" rules={[{ required: true, message: '일시를 선택하세요' }]}>
          <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="location" label="장소">
          <Input placeholder="예) 3층 회의실 / 온라인" />
        </Form.Item>
        <Form.Item name="attendeeUserIds" label="참석자">
          <Select mode="multiple" placeholder="참석자 선택 (주최자 자동 포함)" optionFilterProp="label"
            options={users.map((u) => ({ value: u.id, label: u.displayName }))} />
        </Form.Item>
        <Divider style={{ margin: '8px 0' }}>안건</Divider>
        {agenda.map((a, i) => (
          <Space key={i} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Input placeholder={`안건 ${i + 1}`} value={a.title} style={{ width: 360 }}
              onChange={(e) => setAgenda((g) => g.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <Input placeholder="분" type="number" value={a.durationMin} style={{ width: 70 }}
              onChange={(e) => setAgenda((g) => g.map((x, j) => (j === i ? { ...x, durationMin: e.target.value } : x)))} />
            <a onClick={() => setAgenda((g) => g.filter((_, j) => j !== i))}>삭제</a>
          </Space>
        ))}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAgenda((g) => [...g, { title: '', durationMin: '' }])} block>안건 추가</Button>
      </Form>
    </Modal>
  );
}

export default function MeetingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const user = useAuthStore((s) => s.user);

  const [filter, setFilter] = useState('mine');
  const [meetings, setMeetings] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [users, setUsers] = useState([]);

  const [meeting, setMeeting] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);

  const [minutesEdit, setMinutesEdit] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [aiContent, setAiContent] = useState('');
  const [aiAssignee, setAiAssignee] = useState(null);
  const [aiDue, setAiDue] = useState(null);

  useEffect(() => { getUsers().then(setUsers).catch(() => {}); }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try { setMeetings(await getMeetings(filter)); }
    catch { message.error('회의 목록을 불러오지 못했습니다.'); }
    finally { setListLoading(false); }
  }, [filter]);
  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setMeeting(null); return; }
    setDetailLoading(true);
    setMinutesEdit(false);
    try { setMeeting(await getMeeting(id)); }
    catch (err) { message.error(err.response?.data?.error || '회의를 불러오지 못했습니다.'); setMeeting(null); }
    finally { setDetailLoading(false); }
  }, []);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const openMeeting = (id) => setSearchParams({ id: String(id) });
  const canEdit = meeting && (user?.role === 'admin' || meeting.organizerId === user?.id);
  const myAtt = meeting?.attendees?.find((a) => a.userId === user?.id);

  const refresh = async () => { await Promise.all([loadList(), loadDetail(selectedId)]); };

  const handleSaved = (saved) => { loadList(); if (saved?.id) { if (String(saved.id) === selectedId) setMeeting(saved); else openMeeting(saved.id); } };

  const handleDelete = async () => {
    await deleteMeeting(meeting.id);
    setSearchParams({}); setMeeting(null); loadList();
    message.success('삭제되었습니다.');
  };

  const doRsvp = async (rsvp) => { await rsvpMeeting(meeting.id, rsvp); await refresh(); };

  const saveMinutes = async () => {
    const updated = await updateMeeting(meeting.id, { minutes: minutesDraft });
    setMeeting(updated); setMinutesEdit(false); message.success('회의록을 저장했습니다.');
  };
  const setStatus = async (status) => { const u = await updateMeeting(meeting.id, { status }); setMeeting(u); loadList(); };

  const submitDecision = async () => {
    if (!decisionText.trim()) return;
    await addDecision(meeting.id, decisionText.trim()); setDecisionText(''); loadDetail(meeting.id);
  };
  const submitActionItem = async () => {
    if (!aiContent.trim()) return;
    await addActionItem(meeting.id, { content: aiContent.trim(), assigneeId: aiAssignee, dueDate: aiDue ? aiDue.format('YYYY-MM-DD') : null });
    setAiContent(''); setAiAssignee(null); setAiDue(null); loadDetail(meeting.id);
  };
  const toggleActionDone = async (it) => { await updateActionItem(meeting.id, it.id, { status: it.status === 'done' ? 'open' : 'done' }); loadDetail(meeting.id); };
  const convertToTask = async (it) => {
    try { const r = await actionItemToTask(meeting.id, it.id); message.success(r.message); loadDetail(meeting.id); }
    catch (err) { message.error(err.response?.data?.error || '전환 실패'); }
  };

  const sec = { fontWeight: 700, fontSize: 13, margin: '18px 0 8px', color: 'var(--fd-text-secondary)' };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 96px)', border: '1px solid var(--fd-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--fd-surface)' }}>
      {/* 좌: 목록 */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--fd-border)', display: 'flex', flexDirection: 'column', background: 'var(--fd-surface-sunken)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--fd-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}><TeamOutlined style={{ marginRight: 6 }} />회의</span>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setEditingMeeting(null); setModalOpen(true); }}>새 회의</Button>
        </div>
        <div style={{ padding: 8 }}>
          <Segmented block size="small" value={filter} onChange={setFilter}
            options={[{ label: '내 회의', value: 'mine' }, { label: '예정', value: 'upcoming' }, { label: '지난', value: 'past' }]} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {listLoading ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
            : meetings.length === 0 ? <Empty description="회의가 없습니다" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 24 }} />
            : <List
                dataSource={meetings}
                renderItem={(m) => (
                  <div onClick={() => openMeeting(m.id)}
                    style={{ padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                      background: String(m.id) === selectedId ? 'var(--fd-primary-bg, #e6f4ff)' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</span>
                      <Tag color={STATUS[m.status]?.color} style={{ margin: 0 }}>{STATUS[m.status]?.label}</Tag>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fd-text-secondary)', marginTop: 3 }}>
                      <ClockCircleOutlined /> {dayjs(m.startAt).format('MM-DD(ddd) HH:mm')}
                      {m._count?.actionItems > 0 && <span style={{ marginLeft: 8 }}>✅ {m._count.actionItems}</span>}
                    </div>
                  </div>
                )}
              />}
        </div>
      </div>

      {/* 우: 상세 */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {!selectedId ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="회의를 선택하거나 새로 만드세요" /></div>
          : detailLoading ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
          : !meeting ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="회의를 찾을 수 없습니다" /></div>
          : (
            <div style={{ padding: 24, maxWidth: 900 }}>
              {/* 헤더 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Typography.Title level={4} style={{ margin: 0 }}>{meeting.title}</Typography.Title>
                    <Tag color={STATUS[meeting.status]?.color}>{STATUS[meeting.status]?.label}</Tag>
                  </div>
                  <div style={{ color: 'var(--fd-text-secondary)', marginTop: 6, fontSize: 13 }}>
                    <ClockCircleOutlined /> {dayjs(meeting.startAt).format('YYYY-MM-DD(ddd) HH:mm')}
                    {meeting.endAt && ` ~ ${dayjs(meeting.endAt).format('HH:mm')}`}
                    {meeting.location && <span style={{ marginLeft: 12 }}><EnvironmentOutlined /> {meeting.location}</span>}
                    <span style={{ marginLeft: 12 }}>주최: {meeting.organizer?.displayName}</span>
                  </div>
                </div>
                {canEdit && (
                  <Space>
                    <Select size="small" value={meeting.status} style={{ width: 96 }} onChange={setStatus}
                      options={Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingMeeting(meeting); setModalOpen(true); }} />
                    <Popconfirm title="회의를 삭제할까요?" okType="danger" onConfirm={handleDelete}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                  </Space>
                )}
              </div>

              {/* RSVP */}
              {myAtt && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--fd-surface-sunken)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13 }}>내 참석 응답:</span>
                  <Space.Compact>
                    <Button size="small" type={myAtt.rsvp === 'accepted' ? 'primary' : 'default'} icon={<CheckOutlined />} onClick={() => doRsvp('accepted')}>참석</Button>
                    <Button size="small" type={myAtt.rsvp === 'declined' ? 'primary' : 'default'} danger={myAtt.rsvp === 'declined'} icon={<CloseOutlined />} onClick={() => doRsvp('declined')}>불참</Button>
                    <Button size="small" type={myAtt.rsvp === 'attended' ? 'primary' : 'default'} onClick={() => doRsvp('attended')}>참석함</Button>
                  </Space.Compact>
                </div>
              )}

              {/* 참석자 */}
              <div style={sec}>참석자 ({meeting.attendees.length})</div>
              <Space wrap>
                {meeting.attendees.map((a) => (
                  <Tag key={a.id} color={RSVP[a.rsvp]?.color} style={{ padding: '2px 8px' }}>
                    {a.user?.displayName || a.extName}{a.role === 'organizer' && ' 👑'} · {RSVP[a.rsvp]?.label}
                  </Tag>
                ))}
              </Space>

              {/* 안건 */}
              {meeting.agenda.length > 0 && (
                <>
                  <div style={sec}>안건</div>
                  <List size="small" bordered dataSource={meeting.agenda}
                    renderItem={(a, i) => <List.Item>{i + 1}. {a.title}{a.durationMin ? <span style={{ color: 'var(--fd-text-secondary)', marginLeft: 8 }}>({a.durationMin}분)</span> : null}</List.Item>} />
                </>
              )}

              {/* 회의록 */}
              <div style={{ ...sec, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>회의록</span>
                {canEdit && !minutesEdit && <Button size="small" icon={<EditOutlined />} onClick={() => { setMinutesDraft(meeting.minutes || ''); setMinutesEdit(true); }}>편집</Button>}
                {minutesEdit && <Space><Button size="small" onClick={() => setMinutesEdit(false)}>취소</Button><Button size="small" type="primary" icon={<SaveOutlined />} onClick={saveMinutes}>저장</Button></Space>}
              </div>
              {minutesEdit
                ? <RichEditor defaultValue={minutesDraft} onChange={setMinutesDraft} minHeight={240} placeholder="회의록을 작성하세요…" />
                : (meeting.minutes || '').trim()
                  ? <div className="wiki-content" dangerouslySetInnerHTML={{ __html: meeting.minutes }} />
                  : <Typography.Text type="secondary">회의록이 없습니다.</Typography.Text>}

              {/* 결정사항 */}
              <div style={sec}>결정사항</div>
              <List size="small" dataSource={meeting.decisions} locale={{ emptyText: '결정사항이 없습니다.' }}
                renderItem={(d) => (
                  <List.Item actions={canEdit ? [<a key="d" onClick={async () => { await deleteDecision(meeting.id, d.id); loadDetail(meeting.id); }}>삭제</a>] : []}>
                    ✔ {d.content}
                  </List.Item>
                )} />
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Input value={decisionText} onChange={(e) => setDecisionText(e.target.value)} placeholder="결정사항 입력…" onPressEnter={submitDecision} />
                  <Button type="primary" icon={<SendOutlined />} onClick={submitDecision} />
                </div>
              )}

              {/* 액션아이템 */}
              <div style={sec}>액션 아이템</div>
              <List size="small" dataSource={meeting.actionItems} locale={{ emptyText: '액션 아이템이 없습니다.' }}
                renderItem={(it) => (
                  <List.Item
                    actions={[
                      it.taskId
                        ? <Tag key="t" color="blue">업무 #{it.taskId}</Tag>
                        : (canEdit ? <Tooltip key="c" title="업무로 전환"><a onClick={() => convertToTask(it)}><ExportOutlined /> 업무화</a></Tooltip> : null),
                      canEdit ? <a key="d" onClick={async () => { await deleteActionItem(meeting.id, it.id); loadDetail(meeting.id); }}>삭제</a> : null,
                    ].filter(Boolean)}
                  >
                    <Checkbox checked={it.status === 'done'} disabled={!canEdit} onChange={() => toggleActionDone(it)} style={{ marginRight: 8 }} />
                    <span style={{ textDecoration: it.status === 'done' ? 'line-through' : 'none', flex: 1 }}>
                      {it.content}
                      {it.assignee && <Tag style={{ marginLeft: 8 }}>{it.assignee.displayName}</Tag>}
                      {it.dueDate && <span style={{ color: 'var(--fd-text-secondary)', fontSize: 12, marginLeft: 4 }}>~{dayjs(it.dueDate).format('MM-DD')}</span>}
                    </span>
                  </List.Item>
                )} />
              {canEdit && (
                <Space.Compact style={{ display: 'flex', marginTop: 8 }}>
                  <Input value={aiContent} onChange={(e) => setAiContent(e.target.value)} placeholder="할 일 입력…" onPressEnter={submitActionItem} style={{ flex: 1 }} />
                  <Select value={aiAssignee} onChange={setAiAssignee} placeholder="담당자" allowClear style={{ width: 130 }} optionFilterProp="label"
                    options={users.map((u) => ({ value: u.id, label: u.displayName }))} />
                  <DatePicker value={aiDue} onChange={setAiDue} placeholder="기한" />
                  <Button type="primary" icon={<PlusOutlined />} onClick={submitActionItem} />
                </Space.Compact>
              )}
            </div>
          )}
      </div>

      <MeetingModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} users={users} editing={editingMeeting} />

      <style>{`
        .wiki-content { font-size: 14px; line-height: 1.8; color: var(--fd-text-primary); word-break: break-word; }
        .wiki-content h1 { font-size: 22px; font-weight: 700; margin: 16px 0 8px; }
        .wiki-content h2 { font-size: 19px; font-weight: 700; margin: 14px 0 8px; }
        .wiki-content h3 { font-size: 16px; font-weight: 600; margin: 12px 0 6px; }
        .wiki-content p { margin: 0 0 8px; }
        .wiki-content ul, .wiki-content ol { padding-left: 22px; margin: 6px 0; }
        .wiki-content a { color: #1677ff; text-decoration: underline; }
        .wiki-content table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        .wiki-content table td, .wiki-content table th { border: 1px solid #d1d5db; padding: 6px 10px; }
        .wiki-content table th { background: #f8fafc; font-weight: 600; }
      `}</style>
    </div>
  );
}
