import { useEffect, useState, useMemo } from 'react';
import { Modal, Form, Input, Select, DatePicker, Switch, TimePicker, message } from 'antd';
import dayjs from 'dayjs';
import { getUsers } from '../../api/users';
import useScheduleStore from '../../store/scheduleStore';
import { TYPE_ORDER, typeMeta } from './scheduleMeta';

const { RangePicker } = DatePicker;

/* 자원 연결이 의미 있는 유형 */
const ROOM_TYPES = ['meeting'];
const VEHICLE_TYPES = ['field_work', 'business_trip', 'vehicle'];

export default function ScheduleForm({ open, event, defaultDate, onClose }) {
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState('vacation');
  const [allDay, setAllDay] = useState(true);

  const resources = useScheduleStore((s) => s.resources);
  const fetchResources = useScheduleStore((s) => s.fetchResources);
  const createEvent = useScheduleStore((s) => s.createEvent);
  const updateEvent = useScheduleStore((s) => s.updateEvent);

  const isEdit = !!event;

  useEffect(() => {
    if (!open) return;
    getUsers().then(setUsers).catch(() => {});
    if (!resources.length) fetchResources().catch(() => {});
  }, [open]); // eslint-disable-line

  useEffect(() => {
    if (!open) return;
    if (event) {
      setType(event.type);
      setAllDay(event.allDay);
      form.setFieldsValue({
        type: event.type,
        title: event.title,
        assigneeIds: (event.assignees || []).map((a) => a.id),
        range: [dayjs(event.startDate), dayjs(event.endDate)],
        allDay: event.allDay,
        time: event.startTime && event.endTime
          ? [dayjs(event.startTime, 'HH:mm'), dayjs(event.endTime, 'HH:mm')] : null,
        location: event.location,
        resourceId: event.resourceId || undefined,
        memo: event.memo,
      });
    } else {
      const base = defaultDate ? dayjs(defaultDate) : dayjs();
      setType('vacation');
      setAllDay(true);
      form.setFieldsValue({
        type: 'vacation', title: undefined, assigneeIds: [],
        range: [base, base], allDay: true, time: null,
        location: undefined, resourceId: undefined, memo: undefined,
      });
    }
  }, [open, event, defaultDate]); // eslint-disable-line

  const resourceKind = useMemo(() => {
    if (ROOM_TYPES.includes(type)) return 'room';
    if (VEHICLE_TYPES.includes(type)) return 'vehicle';
    return null;
  }, [type]);

  const resourceOptions = useMemo(
    () => resources.filter((r) => r.kind === resourceKind).map((r) => ({ value: r.id, label: `${r.name}${r.description ? ` · ${r.description}` : ''}` })),
    [resources, resourceKind],
  );

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const [start, end] = v.range || [];
      const payload = {
        type: v.type,
        title: v.title || null,
        startDate: start.format('YYYY-MM-DD'),
        endDate: (end || start).format('YYYY-MM-DD'),
        allDay: v.allDay !== false,
        startTime: v.allDay === false && v.time ? v.time[0].format('HH:mm') : null,
        endTime: v.allDay === false && v.time ? v.time[1].format('HH:mm') : null,
        location: v.location || null,
        resourceId: resourceKind ? (v.resourceId || null) : null,
        memo: v.memo || null,
        assigneeIds: v.assigneeIds || [],
      };
      if (isEdit) {
        await updateEvent(event.id, payload);
        message.success('일정이 수정되었습니다.');
      } else {
        await createEvent(payload);
        message.success('일정이 등록되었습니다.');
      }
      onClose?.(true);
    } catch (e) {
      if (e?.errorFields) return; // 폼 검증 실패
      message.error(e?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? '일정 수정' : '일정 등록'}
      onCancel={() => onClose?.(false)}
      onOk={handleOk}
      confirmLoading={saving}
      okText={isEdit ? '수정' : '등록'}
      cancelText="취소"
      destroyOnClose
      width={460}
    >
      <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 8 }}>
        <Form.Item name="type" label="유형" rules={[{ required: true }]}>
          <TypeChips value={type} onChange={(v) => { setType(v); form.setFieldValue('type', v); }} />
        </Form.Item>

        <Form.Item
          name="assigneeIds"
          label="대상자 (타인 다중 지정 가능)"
          rules={[{ required: true, message: '대상자를 1명 이상 선택하세요.' }]}
        >
          <Select
            mode="multiple"
            placeholder="이름 검색…"
            optionFilterProp="label"
            options={users.map((u) => ({ value: u.id, label: u.displayName }))}
            maxTagCount="responsive"
          />
        </Form.Item>

        <Form.Item name="title" label="제목 (선택)">
          <Input placeholder="예: 여름 정기 휴가 / 주간 정기회의" maxLength={200} />
        </Form.Item>

        <Form.Item name="range" label="기간" rules={[{ required: true, message: '기간을 선택하세요.' }]}>
          <RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" allowClear={false} />
        </Form.Item>

        <Form.Item label="종일" name="allDay" valuePropName="checked" style={{ marginBottom: allDay ? undefined : 8 }}>
          <Switch checkedChildren="종일" unCheckedChildren="시간" onChange={setAllDay} />
        </Form.Item>

        {!allDay && (
          <Form.Item name="time" label="시간" rules={[{ required: true, message: '시간을 선택하세요.' }]}>
            <TimePicker.RangePicker style={{ width: '100%' }} format="HH:mm" minuteStep={10} />
          </Form.Item>
        )}

        {resourceKind && (
          <Form.Item name="resourceId" label={resourceKind === 'room' ? '회의실 연결 (선택)' : '차량 연결 (선택)'}>
            <Select
              allowClear
              placeholder={resourceKind === 'room' ? '회의실 선택' : '차량 선택'}
              options={resourceOptions}
              notFoundContent="등록된 자원이 없습니다"
            />
          </Form.Item>
        )}

        <Form.Item name="location" label="장소 (선택)">
          <Input placeholder="예: 고객사, 3층 라운지" maxLength={200} />
        </Form.Item>

        <Form.Item name="memo" label="메모 (선택)" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={2} maxLength={500} placeholder="추가 설명" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* 유형 선택 칩 */
function TypeChips({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {TYPE_ORDER.map((t) => {
        const m = typeMeta(t);
        const on = value === t;
        return (
          <span
            key={t}
            onClick={() => onChange(t)}
            style={{
              fontSize: 12.5, fontWeight: on ? 700 : 500, padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${on ? m.color : '#CBD5E1'}`,
              background: on ? m.bg : 'transparent',
              color: on ? m.color : '#64748B',
            }}
          >
            {m.icon} {m.label}
          </span>
        );
      })}
    </div>
  );
}
