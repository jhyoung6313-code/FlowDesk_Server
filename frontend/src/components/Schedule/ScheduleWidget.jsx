import { useEffect, useMemo, useState } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import useScheduleStore from '../../store/scheduleStore';
import useHolidayStore from '../../store/holidayStore';
import { typeMeta, eventsOnDate, eventShortLabel, spanGeometry } from './scheduleMeta';
import { getHoliday } from './holidays';
import ScheduleForm from './ScheduleForm';
import ScheduleDetail from './ScheduleDetail';
import ScheduleMonthModal from './ScheduleMonthModal';

/* 대시보드 주간 일정·자원 위젯 — 하루 한 칸에 등록된 일정 전부 표시 */
export default function ScheduleWidget({ isDark, D }) {
  const events = useScheduleStore((s) => s.events);
  const fetchRange = useScheduleStore((s) => s.fetchRange);
  const fetchResources = useScheduleStore((s) => s.fetchResources);
  const holidayMap = useHolidayStore((s) => s.map);
  const fetchHolidays = useHolidayStore((s) => s.fetch);

  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formDate, setFormDate] = useState(null);
  const [detail, setDetail] = useState(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const [monthDate, setMonthDate] = useState(null);

  // 주간 구간 로드
  useEffect(() => {
    const start = weekStart.format('YYYY-MM-DD');
    const end = weekStart.add(6, 'day').format('YYYY-MM-DD');
    fetchRange(start, end).catch(() => {});
    fetchResources().catch(() => {});
    fetchHolidays().catch(() => {});
  }, [weekStart]); // eslint-disable-line

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);
  const today = dayjs();
  const dow = ['일', '월', '화', '수', '목', '금', '토'];

  const openCreate = (date) => { setEditing(null); setFormDate(date || today.format('YYYY-MM-DD')); setFormOpen(true); };
  const openMonth = (date) => { setMonthDate(date || today.format('YYYY-MM-DD')); setMonthOpen(true); };

  const cardBg = D?.cardBg || (isDark ? '#2b313d' : '#fff');
  const border = D?.border || (isDark ? 'rgba(255,255,255,.1)' : '#E8ECF4');
  const text1 = D?.text1 || (isDark ? '#e8e8ee' : '#0F172A');
  const text2 = D?.text2 || (isDark ? '#94a3b8' : '#94A3B8');
  const todayBg = isDark ? 'rgba(249,115,22,.1)' : '#FFFBF5';
  const hoverBg = isDark ? 'rgba(255,255,255,.04)' : '#F1F5F9';

  const navBtn = {
    height: 26, minWidth: 26, padding: '0 8px', border: `1px solid ${border}`, borderRadius: 7,
    background: cardBg, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: text2,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  };

  return (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderBottom: `1px solid ${border}` }}>
        <div style={{ width: 24, height: 24, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF', color: '#3B82F6' }}>📅</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: text1 }}>이번 주 일정 · 자원</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
          <span style={navBtn} onClick={() => setWeekStart((w) => w.subtract(1, 'week'))}><LeftOutlined style={{ fontSize: 10 }} /></span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: text1, padding: '0 2px' }}>
            {weekStart.format('MM.DD')} ~ {weekStart.add(6, 'day').format('MM.DD')}
          </span>
          <span style={navBtn} onClick={() => setWeekStart((w) => w.add(1, 'week'))}><RightOutlined style={{ fontSize: 10 }} /></span>
          <span style={navBtn} onClick={() => setWeekStart(dayjs().startOf('week'))}>오늘</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6', cursor: 'pointer' }} onClick={() => openMonth()}>📆 월간 전체보기 →</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#3B82F6', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', marginLeft: 10 }} onClick={() => openCreate()}>+ 등록</span>
      </div>

      {/* 7일 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {days.map((d, i) => {
          const isToday = d.isSame(today, 'day');
          const holiday = getHoliday(d, holidayMap);
          const dowColor = (holiday || d.day() === 0) ? '#DC2626' : d.day() === 6 ? '#3B82F6' : text2;
          return (
            <div key={`h${i}`} style={{
              padding: '3px 6px', textAlign: 'center', borderBottom: `1px solid ${border}`,
              borderLeft: i === 0 ? 'none' : `1px solid ${border}`,
              background: isToday ? todayBg : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
              <span style={{
                fontSize: 12.5, fontWeight: 700, color: holiday ? '#DC2626' : text1,
                ...(isToday ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 19, height: 19, padding: '0 4px', background: '#F97316', color: '#fff', borderRadius: 10 } : {}),
              }}>{d.date()}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: dowColor }}>({dow[d.day()]})</span>
            </div>
          );
        })}

        {days.map((d, i) => {
          const isToday = d.isSame(today, 'day');
          const dayEvents = eventsOnDate(events, d);
          const holiday = getHoliday(d, holidayMap);
          return (
            <div key={`c${i}`}
              onClick={() => openCreate(d.format('YYYY-MM-DD'))}
              style={{
                minHeight: 92, borderLeft: i === 0 ? 'none' : `1px solid ${border}`,
                padding: '5px 6px 6px', display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer',
                background: isToday ? todayBg : 'transparent',
              }}
              onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = hoverBg; }}
              onMouseLeave={(e) => { if (!isToday) e.currentTarget.style.background = 'transparent'; }}
            >
              {holiday && (
                <span title={holiday} style={{
                  fontSize: 10, fontWeight: 700, color: '#DC2626', lineHeight: 1.25,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>🇰🇷 {holiday}</span>
              )}
              {dayEvents.slice(0, 3).map((ev) => {
                const m = typeMeta(ev.type);
                const g = spanGeometry(ev, d, 6);
                return (
                  <span key={ev.id}
                    onClick={(e) => { e.stopPropagation(); setDetail(ev); }}
                    title={eventShortLabel(ev)}
                    style={{
                      fontSize: 10.5, fontWeight: 600, lineHeight: 1.3,
                      padding: g.showLabel ? '3px 7px' : '3px 4px',
                      marginLeft: g.marginLeft, marginRight: g.marginRight,
                      borderTopLeftRadius: g.borderTopLeftRadius, borderBottomLeftRadius: g.borderBottomLeftRadius,
                      borderTopRightRadius: g.borderTopRightRadius, borderBottomRightRadius: g.borderBottomRightRadius,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      borderLeft: g.start ? `3px solid ${m.color}` : 'none',
                      background: isDark ? m.dark : m.bg, color: isDark ? '#e8e8ee' : m.color, cursor: 'pointer',
                      minHeight: 18, boxSizing: 'border-box',
                      position: 'relative', zIndex: g.showLabel ? 1 : 0,
                    }}
                  >{g.showLabel ? eventShortLabel(ev) : ' '}</span>
                );
              })}
              {dayEvents.length > 3 && (
                <span style={{ fontSize: 10, color: text2, fontWeight: 600, paddingLeft: 3 }}
                  onClick={(e) => { e.stopPropagation(); openMonth(d.format('YYYY-MM-DD')); }}>
                  +{dayEvents.length - 3}개 더
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 모달들 */}
      <ScheduleForm
        open={formOpen}
        event={editing}
        defaultDate={formDate}
        onClose={() => { setFormOpen(false); setEditing(null); }}
      />
      <ScheduleDetail
        open={!!detail}
        event={detail}
        onClose={() => setDetail(null)}
        onEdit={(ev) => { setDetail(null); setEditing(ev); setFormDate(null); setFormOpen(true); }}
      />
      <ScheduleMonthModal
        open={monthOpen}
        initialDate={monthDate}
        isDark={isDark}
        onClose={() => { setMonthOpen(false); /* 주간 구간 복원 */ setWeekStart((w) => w); fetchRange(weekStart.format('YYYY-MM-DD'), weekStart.add(6, 'day').format('YYYY-MM-DD')); }}
        onPickEvent={(ev) => setDetail(ev)}
        onAddOnDate={(date) => { setEditing(null); setFormDate(date); setFormOpen(true); }}
      />
    </div>
  );
}
