// 회의 빈시간 찾기(Scheduling Assistant, F-65) — 순수 계산 로직.
// M365 Outlook의 "일정 도우미" 대응. 참석자들의 바쁜 구간(회의·일정)을 빼고 공통 가용 슬롯을 계산한다.
// 시간은 "자정 기준 분(minute of day)" 정수로 다룬다(타임존 단순화, 로컬 시간 기준).

// 'HH:mm' → 분. 유효하지 않으면 fallback.
function toMin(hhmm, fallback = null) {
  if (typeof hhmm !== 'string') return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return fallback;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h < 0 || h > 24 || mi < 0 || mi > 59) return fallback;
  return h * 60 + mi;
}

// 분 → 'HH:mm'
function toHHMM(min) {
  const clamped = Math.max(0, Math.min(1440, Math.round(min)));
  const h = Math.floor(clamped / 60); const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 바쁜 구간 병합: [{start,end}] → 정렬·겹침 병합(닿는 구간도 병합)
function mergeIntervals(intervals) {
  const valid = (intervals || [])
    .filter((iv) => iv && Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start)
    .map((iv) => ({ start: Math.max(0, iv.start), end: Math.min(1440, iv.end) }))
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const iv of valid) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }
  return merged;
}

// 하루의 가용 슬롯 계산.
// workStart/workEnd: 분. busy: [{start,end}] 분. durationMin: 슬롯 길이. stepMin: 시작 간격.
// 반환: [{ startMin, endMin }] — durationMin 이상 확보되는 슬롯을 stepMin 간격으로.
function freeSlotsForDay({ workStart, workEnd, busy, durationMin = 60, stepMin = 30, maxSlots = 12 }) {
  const ws = Number.isFinite(workStart) ? workStart : 540; // 09:00
  const we = Number.isFinite(workEnd) ? workEnd : 1080;     // 18:00
  const dur = Math.max(5, durationMin);
  const step = Math.max(5, stepMin);
  if (we - ws < dur) return [];

  const merged = mergeIntervals(busy);
  // 근무시간 내 자유 구간(gap) 도출
  const gaps = [];
  let cursor = ws;
  for (const iv of merged) {
    if (iv.end <= ws || iv.start >= we) continue; // 근무시간 밖
    const s = Math.max(ws, iv.start);
    if (s > cursor) gaps.push({ start: cursor, end: s });
    cursor = Math.max(cursor, Math.min(we, iv.end));
  }
  if (cursor < we) gaps.push({ start: cursor, end: we });

  // 각 gap에서 durationMin 슬롯을 step 간격으로 추출
  const slots = [];
  for (const g of gaps) {
    for (let start = g.start; start + dur <= g.end; start += step) {
      slots.push({ startMin: start, endMin: start + dur });
      if (slots.length >= maxSlots) return slots;
    }
  }
  return slots;
}

module.exports = { toMin, toHHMM, mergeIntervals, freeSlotsForDay };
