import { useEffect, useState } from 'react';
import { Modal, DatePicker, Input, Select, Button, Popconfirm, message, Empty } from 'antd';
import dayjs from 'dayjs';
import useHolidayStore from '../../store/holidayStore';

const TYPE_LABEL = { temporary: '임시공휴일', substitute: '대체공휴일', legal: '법정공휴일', etc: '기타' };

/* 공휴일(임시·대체 등) 등록/삭제 — 내장 기본값을 덮어씀. 관리자 전용 */
export default function HolidayManager({ open, onClose }) {
  const list = useHolidayStore((s) => s.list);
  const fetch = useHolidayStore((s) => s.fetch);
  const add = useHolidayStore((s) => s.add);
  const remove = useHolidayStore((s) => s.remove);

  const [date, setDate] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('temporary');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) fetch(true).catch(() => {}); }, [open]); // eslint-disable-line

  const handleAdd = async () => {
    if (!date) return message.warning('날짜를 선택하세요.');
    if (!name.trim()) return message.warning('공휴일명을 입력하세요.');
    setSaving(true);
    try {
      await add({ date: date.format('YYYY-MM-DD'), name: name.trim(), type });
      message.success('공휴일이 등록되었습니다.');
      setDate(null); setName(''); setType('temporary');
    } catch (e) {
      message.error(e?.response?.data?.error || '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await remove(id);
      message.success('삭제되었습니다.');
    } catch (e) {
      message.error(e?.response?.data?.error || '삭제에 실패했습니다.');
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={460} title="🇰🇷 공휴일 관리" destroyOnClose>
      <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12, lineHeight: 1.5 }}>
        임시공휴일·대체공휴일 등 추가 지정분을 등록하세요. 같은 날짜에 등록하면 내장 기본값을 덮어씁니다.
      </div>

      {/* 등록 폼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <DatePicker value={date} onChange={setDate} format="YYYY-MM-DD" placeholder="날짜" style={{ width: 140 }} />
        <Select value={type} onChange={setType} style={{ width: 120 }}
          options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="공휴일명" maxLength={100} onPressEnter={handleAdd} />
      </div>
      <Button type="primary" block onClick={handleAdd} loading={saving} style={{ marginBottom: 16 }}>+ 등록 / 덮어쓰기</Button>

      {/* 등록 목록 */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>등록된 공휴일</div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {list.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 공휴일이 없습니다" />
        ) : list.map((h) => (
          <div key={h.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
            borderBottom: '1px solid #F1F5F9',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', width: 92 }}>{dayjs(h.date).format('YYYY-MM-DD')}</span>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: '#FEE2E2', color: '#DC2626' }}>{TYPE_LABEL[h.type] || h.type}</span>
            <span style={{ flex: 1, fontSize: 13, color: '#0F172A' }}>{h.name}</span>
            <Popconfirm title="삭제할까요?" okText="삭제" cancelText="취소" onConfirm={() => handleDelete(h.id)} okButtonProps={{ danger: true }}>
              <Button size="small" danger type="text">삭제</Button>
            </Popconfirm>
          </div>
        ))}
      </div>
    </Modal>
  );
}
