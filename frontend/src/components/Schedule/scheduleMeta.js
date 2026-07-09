/* 일정 유형 메타 — 색/아이콘/라벨 (라이트·다크 공용, 색은 의미색이라 고정) */
export const SCHEDULE_TYPES = {
  vacation:      { label: '휴가',   icon: '🌴', color: '#DC2626', bg: '#FEE2E2', dark: 'rgba(239,68,68,.18)' },
  half_day:      { label: '반차',   icon: '🌗', color: '#C2410C', bg: '#FFF7ED', dark: 'rgba(249,115,22,.18)' },
  meeting:       { label: '회의',   icon: '📋', color: '#3B82F6', bg: '#EFF6FF', dark: 'rgba(59,130,246,.18)' },
  field_work:    { label: '외근',   icon: '🚗', color: '#7C3AED', bg: '#F5F3FF', dark: 'rgba(124,58,237,.18)' },
  business_trip: { label: '출장',   icon: '🚙', color: '#7C3AED', bg: '#F5F3FF', dark: 'rgba(124,58,237,.18)' },
  remote:        { label: '재택',   icon: '🏠', color: '#059669', bg: '#F0FDF4', dark: 'rgba(5,150,105,.18)' },
  vehicle:       { label: '차량',   icon: '🚐', color: '#D97706', bg: '#FFFBEB', dark: 'rgba(217,119,6,.18)' },
  etc:           { label: '기타',   icon: '📌', color: '#475569', bg: '#F1F5F9', dark: 'rgba(148,163,184,.18)' },
};

/* 등록 폼/필터에 노출할 순서 */
export const TYPE_ORDER = ['vacation', 'half_day', 'meeting', 'field_work', 'business_trip', 'remote', 'vehicle', 'etc'];

export const typeMeta = (t) => SCHEDULE_TYPES[t] || SCHEDULE_TYPES.etc;

/* 해당 날짜(dayjs)에 걸치는 일정만 추려 정렬 — 날짜 단위 판정 */
export function eventsOnDate(events, d) {
  const day = d.format('YYYY-MM-DD');
  return (events || [])
    .filter((ev) => {
      const s = (ev.startDate || '').slice(0, 10);
      const e = (ev.endDate || ev.startDate || '').slice(0, 10);
      return s <= day && day <= e;
    })
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}

/* 해당 날짜가 일정의 시작일인지 (기간 일정의 첫 칸 판정) */
export function isEventStart(ev, d) {
  return (ev.startDate || '').slice(0, 10) === d.format('YYYY-MM-DD');
}

/* 해당 날짜가 일정의 종료일인지 (기간 일정의 마지막 칸 판정) */
export function isEventEnd(ev, d) {
  return (ev.endDate || ev.startDate || '').slice(0, 10) === d.format('YYYY-MM-DD');
}

/* 기간 일정 막대를 칸 경계까지 이어붙이기 위한 마진/모서리 계산
 * pad = 셀 좌우 패딩(px). 이어지는 쪽은 음수 마진으로 경계(+1px border)를 덮는다. */
export function spanGeometry(ev, d, pad, radius = 5) {
  const start = isEventStart(ev, d);
  const end = isEventEnd(ev, d);
  const dow = d.day();
  const connectsLeft = !start && dow !== 0;   // 주 시작(일)에서는 좌측 연결 끊음
  const connectsRight = !end && dow !== 6;     // 주 끝(토)에서는 우측 연결 끊음
  const showLabel = start || dow === 0;        // 시작일 또는 주 시작이면 라벨 표시
  return {
    start, end, showLabel,
    marginLeft: connectsLeft ? -(pad + 1) : 0,
    marginRight: connectsRight ? -(pad + 1) : 0,
    borderTopLeftRadius: connectsLeft ? 0 : radius,
    borderBottomLeftRadius: connectsLeft ? 0 : radius,
    borderTopRightRadius: connectsRight ? 0 : radius,
    borderBottomRightRadius: connectsRight ? 0 : radius,
  };
}

/* 칩 라벨: "[유형]담당자" 형태 — 누가 어떤 업무를 하는지 표시 (예: [기타]admin) */
export function eventShortLabel(ev) {
  const m = typeMeta(ev.type);
  const names = (ev.assignees || []).map((a) => a.displayName).filter(Boolean);
  const who = names.length ? names.join(', ') : (ev.title || '');
  return `[${m.label}]${who}`;
}
