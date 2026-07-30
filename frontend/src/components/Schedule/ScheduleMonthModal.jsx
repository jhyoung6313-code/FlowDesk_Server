import { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import useScheduleStore from '../../store/scheduleStore';
import useHolidayStore from '../../store/holidayStore';
import useAuthStore from '../../store/authStore';
import { TYPE_ORDER, typeMeta, eventsOnDate, eventShortLabel, spanGeometry } from './scheduleMeta';
import { getHoliday } from './holidays';
import HolidayManager from './HolidayManager';

/* 1개월 캘린더 모달 — 날짜 칸마다 그 날 일정 전부 표시 */
export default function ScheduleMonthModal({ open, initialDate, isDark, onClose, onPickEvent, onAddOnDate }) {
  const [cursor, setCursor] = useState(dayjs());
  const [filter, setFilter] = useState('all');
  const [holidayMgr, setHolidayMgr] = useState(false);
  const events = useScheduleStore((s) => s.events);
  const fetchRange = useScheduleStore((s) => s.fetchRange);
  const holidayMap = useHolidayStore((s) => s.map);
  const fetchHolidays = useHolidayStore((s) => s.fetch);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  useEffect(() => { if (open) setCursor(initialDate ? dayjs(initialDate) : dayjs()); }, [open, initialDate]);

  // 보이는 달의 6주 구간을 로드
  useEffect(() => {
    if (!open) return;
    const gridStart = cursor.startOf('month').startOf('week');
    const gridEnd = gridStart.add(41, 'day');
    fetchRange(gridStart.format('YYYY-MM-DD'), gridEnd.format('YYYY-MM-DD')).catch(() => {});
    fetchHolidays().catch(() => {});
  }, [open, cursor]); // eslint-disable-line

  const days = useMemo(() => {
    const start = cursor.startOf('month').startOf('week');
    return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));
  }, [cursor]);

  const shown = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const today = dayjs();

  const T = isDark
    ? { bg: '#1e222c', border: 'rgba(255,255,255,.1)', text1: '#e8e8ee', text2: '#94a3b8', out: '#181b24', hover: 'rgba(255,255,255,.04)', todayBg: 'rgba(249,115,22,.12)' }
    : { bg: '#fff', border: '#E8ECF4', text1: '#0F172A', text2: '#94A3B8', out: '#FBFCFE', hover: '#F1F5F9', todayBg: '#FFF7ED' };

  const dow = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1000} destroyOnClose
      styles={{ body: { padding: 0 }, content: isDark ? { background: T.bg } : undefined }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>{cursor.format('YYYY년 M월')}</span>
        <Button size="small" icon={<LeftOutlined />} onClick={() => setCursor((c) => c.subtract(1, 'month'))} />
        <Button size="small" icon={<RightOutlined />} onClick={() => setCursor((c) => c.add(1, 'month'))} />
        <Button size="small" onClick={() => setCursor(dayjs())}>오늘</Button>
        <div style={{ flex: 1 }} />
        {isAdmin && <Button size="small" onClick={() => setHolidayMgr(true)}>🇰🇷 공휴일 관리</Button>}
        <Button type="primary" size="small" onClick={() => onAddOnDate?.(cursor.format('YYYY-MM-DD'))}>+ 등록</Button>
      </div>

      {/* 유형 필터 */}
      <div style={{ display: 'flex', gap: 7, padding: '10px 20px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
        <FilterChip on={filter === 'all'} onClick={() => setFilter('all')} label="전체" T={T} />
        {TYPE_ORDER.filter((t) => t !== 'etc').map((t) => {
          const m = typeMeta(t);
          return <FilterChip key={t} on={filter === t} onClick={() => setFilter(t)} label={m.label} dot={m.color} T={T} />;
        })}
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {dow.map((d, i) => (
          <div key={d} style={{
            padding: 8, textAlign: 'center', fontSize: 13, fontWeight: 700,
            color: i === 0 ? '#DC2626' : i === 6 ? '#3B82F6' : T.text2,
            borderBottom: `1px solid ${T.border}`,
          }}>{d}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {days.map((d) => {
          const outMonth = d.month() !== cursor.month();
          const isToday = d.isSame(today, 'day');
          const dayEvents = eventsOnDate(shown, d);
          const holiday = getHoliday(d, holidayMap);
          return (
            <div key={d.format('YYYY-MM-DD')}
              onClick={() => onAddOnDate?.(d.format('YYYY-MM-DD'))}
              style={{
                minHeight: 108, borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
                padding: '5px 5px 4px', display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer',
                background: outMonth ? T.out : isToday ? T.todayBg : 'transparent',
              }}
              onMouseEnter={(e) => { if (!isToday && !outMonth) e.currentTarget.style.background = T.hover; }}
              onMouseLeave={(e) => { if (!isToday && !outMonth) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1, minWidth: 0 }}>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: outMonth ? (isDark ? '#475569' : '#CBD5E1') : (holiday || d.day() === 0) ? '#DC2626' : d.day() === 6 ? '#3B82F6' : T.text1,
                  ...(isToday ? { display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', background: '#F97316', color: '#fff', borderRadius: '50%' } : {}),
                }}>{d.date()}</span>
                {holiday && !outMonth && (
                  <span title={holiday} style={{
                    fontSize: 13, fontWeight: 700, color: '#DC2626',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{holiday}</span>
                )}
              </div>
              {dayEvents.slice(0, 3).map((ev) => <Pill key={ev.id} ev={ev} day={d} onClick={onPickEvent} />)}
              {dayEvents.length > 3 && <span style={{ fontSize: 13, color: T.text2, fontWeight: 600, paddingLeft: 3 }}>+{dayEvents.length - 3}</span>}
            </div>
          );
        })}
      </div>

      <HolidayManager open={holidayMgr} onClose={() => setHolidayMgr(false)} />
    </Modal>
  );
}

function Pill({ ev, day, onClick }) {
  const m = typeMeta(ev.type);
  const g = spanGeometry(ev, day, 5);
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick?.(ev); }}
      title={eventShortLabel(ev)}
      style={{
        fontSize: 13, fontWeight: 600, lineHeight: 1.3,
        padding: g.showLabel ? '2px 6px' : '2px 4px',
        marginLeft: g.marginLeft, marginRight: g.marginRight,
        borderTopLeftRadius: g.borderTopLeftRadius, borderBottomLeftRadius: g.borderBottomLeftRadius,
        borderTopRightRadius: g.borderTopRightRadius, borderBottomRightRadius: g.borderBottomRightRadius,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        borderLeft: g.start ? `3px solid ${m.color}` : 'none',
        background: m.bg, color: m.color, cursor: 'pointer',
        minHeight: 17, boxSizing: 'border-box',
        position: 'relative', zIndex: g.showLabel ? 1 : 0,
      }}
    >{g.showLabel ? eventShortLabel(ev) : ' '}</span>
  );
}

function FilterChip({ on, onClick, label, dot, T }) {
  return (
    <span onClick={onClick} style={{
      fontSize: 13, fontWeight: 600, padding: '4px 11px', borderRadius: 20, cursor: 'pointer',
      border: `1px solid ${on ? '#0F172A' : T.border}`,
      background: on ? '#0F172A' : 'transparent', color: on ? '#fff' : T.text2,
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {dot && <span style={{ width: 9, height: 9, borderRadius: 3, background: dot }} />}
      {label}
    </span>
  );
}
