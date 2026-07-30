import { useState } from 'react';
import { Modal, DatePicker, InputNumber, Button, Space, Tag, Typography, Spin, Empty, message, Alert } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { findFreeSlots } from '../../api/schedule';

// 회의 빈시간 찾기(Scheduling Assistant) — 참석자들의 공통 가용 슬롯 제안.
// props: open, onClose, attendeeIds:[number], onPick({date,start,end})
export default function FreeSlotFinder({ open, onClose, attendeeIds = [], onPick }) {
  const [range, setRange] = useState([dayjs(), dayjs().add(4, 'day')]);
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { days: [{date, slots:[{start,end}]}] }

  const search = async () => {
    if (!attendeeIds.length) { message.warning('참석자를 먼저 선택하세요.'); return; }
    setLoading(true); setResult(null);
    try {
      const data = await findFreeSlots({
        attendeeIds,
        from: range[0].format('YYYY-MM-DD'),
        to: range[1].format('YYYY-MM-DD'),
        durationMin: duration,
        workStart: '09:00', workEnd: '18:00', stepMin: 30,
      });
      setResult(data);
    } catch (err) {
      message.error(err.response?.data?.error || '빈 시간 검색에 실패했습니다.');
    } finally { setLoading(false); }
  };

  const pick = (date, slot) => {
    onPick?.({ date, start: slot.start, end: slot.end });
    onClose?.();
  };

  const totalSlots = (result?.days || []).reduce((n, d) => n + d.slots.length, 0);

  return (
    <Modal title={<span><SearchOutlined /> 빈 시간 찾기 (참석자 {attendeeIds.length}명)</span>}
      open={open} onCancel={onClose} footer={<Button onClick={onClose}>닫기</Button>} width={620}>
      <Alert type="info" banner
        message="근무시간 09:00–18:00 기준으로 참석자들의 회의·일정(휴가·외근·출장 등)을 뺀 공통 가용 시간을 제안합니다."
        style={{ marginBottom: 12 }} />
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v)} allowClear={false} />
        <Space size={4}>
          <Typography.Text>소요</Typography.Text>
          <InputNumber min={15} max={480} step={15} value={duration} onChange={(v) => setDuration(v || 60)} addonAfter="분" style={{ width: 120 }} />
        </Space>
        <Button type="primary" icon={<SearchOutlined />} onClick={search} loading={loading}>검색</Button>
      </Space>

      {loading && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}
      {!loading && result && totalSlots === 0 && <Empty description="선택한 기간에 공통 가용 시간이 없습니다." />}
      {!loading && result && totalSlots > 0 && (
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {result.days.filter((d) => d.slots.length).map((d) => (
            <div key={d.date} style={{ marginBottom: 12 }}>
              <Typography.Text strong>{dayjs(d.date).format('MM/DD (ddd)')}</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Space size={[6, 6]} wrap>
                  {d.slots.map((s, i) => (
                    <Tag key={i} color="blue" style={{ cursor: 'pointer', padding: '2px 10px' }} onClick={() => pick(d.date, s)}>
                      {s.start}–{s.end}
                    </Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
