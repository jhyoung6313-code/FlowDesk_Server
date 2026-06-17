/**
 * 한국 법정공휴일 유틸리티
 * - 고정 공휴일 + 음력 기반 공휴일(2020~2030 사전 계산) + 대체공휴일 포함
 * - 대체공휴일 규정: 2021년 이후 확대, 2023년 이후 토요일도 적용
 */

// ── 음력 기반 공휴일 (2020~2030 양력 날짜 사전 계산) ────────────────────────
// 설날: 음력 1/1 (전날·당일·다음날 3일 연휴)
// 석가탄신일: 음력 4/8
// 추석: 음력 8/15 (전날·당일·다음날 3일 연휴)
const LUNAR_HOLIDAYS = [
  // 2020
  { date: '2020-01-24', name: '설날 연휴' },
  { date: '2020-01-25', name: '설날' },
  { date: '2020-01-26', name: '설날 연휴' },
  { date: '2020-01-27', name: '설날 대체공휴일' }, // 01-26(일) 대체
  { date: '2020-04-30', name: '부처님오신날' },
  { date: '2020-09-30', name: '추석 연휴' },
  { date: '2020-10-01', name: '추석' },
  { date: '2020-10-02', name: '추석 연휴' },

  // 2021
  { date: '2021-02-11', name: '설날 연휴' },
  { date: '2021-02-12', name: '설날' },
  { date: '2021-02-13', name: '설날 연휴' },
  { date: '2021-05-19', name: '부처님오신날' },
  { date: '2021-09-20', name: '추석 연휴' },
  { date: '2021-09-21', name: '추석' },
  { date: '2021-09-22', name: '추석 연휴' },

  // 2022
  { date: '2022-01-31', name: '설날 연휴' },
  { date: '2022-02-01', name: '설날' },
  { date: '2022-02-02', name: '설날 연휴' },
  { date: '2022-05-08', name: '부처님오신날' },
  { date: '2022-05-09', name: '부처님오신날 대체공휴일' }, // 05-08(일) 대체
  { date: '2022-09-09', name: '추석 연휴' },
  { date: '2022-09-10', name: '추석' },
  { date: '2022-09-11', name: '추석 연휴' },
  { date: '2022-09-12', name: '추석 대체공휴일' }, // 09-11(일) 대체

  // 2023
  { date: '2023-01-21', name: '설날 연휴' },
  { date: '2023-01-22', name: '설날' },
  { date: '2023-01-23', name: '설날 연휴' },
  { date: '2023-01-24', name: '설날 대체공휴일' }, // 01-21(토)+01-22(일) 대체
  { date: '2023-05-27', name: '부처님오신날' },
  { date: '2023-05-29', name: '부처님오신날 대체공휴일' }, // 05-27(토) 대체
  { date: '2023-09-28', name: '추석 연휴' },
  { date: '2023-09-29', name: '추석' },
  { date: '2023-09-30', name: '추석 연휴' },
  { date: '2023-10-02', name: '추석 대체공휴일' }, // 09-30(토) 대체

  // 2024
  { date: '2024-02-09', name: '설날 연휴' },
  { date: '2024-02-10', name: '설날' },
  { date: '2024-02-11', name: '설날 연휴' },
  { date: '2024-02-12', name: '설날 대체공휴일' }, // 02-10(토)+02-11(일) 대체
  { date: '2024-05-15', name: '부처님오신날' },
  { date: '2024-09-16', name: '추석 연휴' },
  { date: '2024-09-17', name: '추석' },
  { date: '2024-09-18', name: '추석 연휴' },

  // 2025
  { date: '2025-01-28', name: '설날 연휴' },
  { date: '2025-01-29', name: '설날' },
  { date: '2025-01-30', name: '설날 연휴' },
  { date: '2025-05-05', name: '부처님오신날' }, // 어린이날과 같은 날
  { date: '2025-05-06', name: '어린이날·부처님오신날 대체공휴일' },
  { date: '2025-10-05', name: '추석 연휴' },
  { date: '2025-10-06', name: '추석' },
  { date: '2025-10-07', name: '추석 연휴' },
  { date: '2025-10-08', name: '추석 대체공휴일' }, // 10-05(일) 대체

  // 2026
  { date: '2026-02-16', name: '설날 연휴' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날 연휴' },
  { date: '2026-05-24', name: '부처님오신날' },
  { date: '2026-05-25', name: '부처님오신날 대체공휴일' }, // 05-24(일) 대체
  { date: '2026-09-24', name: '추석 연휴' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석 연휴' },
  { date: '2026-09-28', name: '추석 대체공휴일' }, // 09-26(토) 대체

  // 2027
  { date: '2027-02-05', name: '설날 연휴' },
  { date: '2027-02-06', name: '설날' },
  { date: '2027-02-07', name: '설날 연휴' },
  { date: '2027-02-09', name: '설날 대체공휴일' }, // 02-06(토)+02-07(일) 대체
  { date: '2027-05-13', name: '부처님오신날' },
  { date: '2027-09-14', name: '추석 연휴' },
  { date: '2027-09-15', name: '추석' },
  { date: '2027-09-16', name: '추석 연휴' },

  // 2028
  { date: '2028-01-25', name: '설날 연휴' },
  { date: '2028-01-26', name: '설날' },
  { date: '2028-01-27', name: '설날 연휴' },
  { date: '2028-05-01', name: '부처님오신날' },
  { date: '2028-10-02', name: '추석 연휴' },
  { date: '2028-10-03', name: '추석' }, // 개천절과 같은 날
  { date: '2028-10-04', name: '추석 연휴' },

  // 2029
  { date: '2029-02-12', name: '설날 연휴' },
  { date: '2029-02-13', name: '설날' },
  { date: '2029-02-14', name: '설날 연휴' },
  { date: '2029-05-20', name: '부처님오신날' },
  { date: '2029-05-21', name: '부처님오신날 대체공휴일' }, // 05-20(일) 대체
  { date: '2029-09-21', name: '추석 연휴' },
  { date: '2029-09-22', name: '추석' },
  { date: '2029-09-23', name: '추석 연휴' },
  { date: '2029-09-24', name: '추석 대체공휴일' }, // 09-22(토) 대체

  // 2030
  { date: '2030-02-02', name: '설날 연휴' },
  { date: '2030-02-03', name: '설날' },
  { date: '2030-02-04', name: '설날 연휴' },
  { date: '2030-02-05', name: '설날 대체공휴일' }, // 02-02(토)+02-03(일) 대체
  { date: '2030-05-09', name: '부처님오신날' },
  { date: '2030-09-11', name: '추석 연휴' },
  { date: '2030-09-12', name: '추석' },
  { date: '2030-09-13', name: '추석 연휴' },
];

// ── 고정 공휴일 (매년 동일, 대체공휴일 포함 계산) ───────────────────────────
const FIXED_HOLIDAYS = [
  { month: 1,  day: 1,  name: '신정 (새해 첫날)' },
  { month: 3,  day: 1,  name: '삼일절' },
  { month: 5,  day: 5,  name: '어린이날' },
  { month: 6,  day: 6,  name: '현충일' },
  { month: 8,  day: 15, name: '광복절' },
  { month: 10, day: 3,  name: '개천절' },
  { month: 10, day: 9,  name: '한글날' },
  { month: 12, day: 25, name: '성탄절' },
];

// 대체공휴일 적용 대상 (2021년 이후)
const SUBSTITUTE_ELIGIBLE_FROM_2021 = [3, 1, 8, 15, 10, 3, 10, 9, 6, 6, 12, 25, 1, 1];
// 실제 객체로 관리
const SUBSTITUTE_ELIGIBLE = [
  { month: 1,  day: 1  }, // 신정
  { month: 3,  day: 1  }, // 삼일절
  { month: 5,  day: 5  }, // 어린이날
  { month: 6,  day: 6  }, // 현충일
  { month: 8,  day: 15 }, // 광복절
  { month: 10, day: 3  }, // 개천절
  { month: 10, day: 9  }, // 한글날
  { month: 12, day: 25 }, // 성탄절
];

/**
 * 특정 연도의 고정 공휴일 + 대체공휴일 목록을 반환
 * @param {number} year
 * @returns {{ date: string, name: string }[]}
 */
function getFixedHolidaysForYear(year) {
  const result = [];

  for (const { month, day, name } of FIXED_HOLIDAYS) {
    const d = new Date(year, month - 1, day);
    const dateStr = formatDate(d);
    result.push({ date: dateStr, name });

    // 대체공휴일 계산 (2021년 이후)
    if (year >= 2021) {
      const dow = d.getDay(); // 0=일, 6=토
      const isEligible = SUBSTITUTE_ELIGIBLE.some(e => e.month === month && e.day === day);

      if (isEligible) {
        // 일요일인 경우: 2021년 이후 모두 적용
        if (dow === 0) {
          const sub = findNextWeekday(new Date(year, month - 1, day + 1), result.map(r => r.date));
          result.push({ date: formatDate(sub), name: `${name} 대체공휴일` });
        }
        // 토요일인 경우: 2023년 이후 적용
        if (dow === 6 && year >= 2023) {
          const sub = findNextWeekday(new Date(year, month - 1, day + 1), result.map(r => r.date));
          result.push({ date: formatDate(sub), name: `${name} 대체공휴일` });
        }
      }
    }
  }

  return result;
}

/**
 * 다음 평일(월~금)이면서 이미 공휴일이 아닌 날을 찾음
 */
function findNextWeekday(startDate, existingDates) {
  const d = new Date(startDate);
  while (true) {
    const dow = d.getDay();
    const str = formatDate(d);
    if (dow !== 0 && dow !== 6 && !existingDates.includes(str)) {
      return d;
    }
    d.setDate(d.getDate() + 1);
  }
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── 내부 캐시: 연도별 공휴일 맵 ─────────────────────────────────────────────
const cache = {};

/**
 * 특정 연도의 모든 공휴일 맵 반환
 * @param {number} year
 * @returns {Map<string, string>} dateStr → 공휴일명
 */
export function getHolidayMap(year) {
  if (cache[year]) return cache[year];

  const map = new Map();

  // 고정 공휴일
  for (const h of getFixedHolidaysForYear(year)) {
    if (!map.has(h.date)) map.set(h.date, h.name);
  }

  // 음력 기반 공휴일 (사전 계산 데이터)
  for (const h of LUNAR_HOLIDAYS) {
    if (h.date.startsWith(String(year))) {
      if (!map.has(h.date)) map.set(h.date, h.name);
    }
  }

  cache[year] = map;
  return map;
}

/**
 * 주어진 날짜가 공휴일인지 확인하고 공휴일명 반환 (없으면 null)
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string|null}
 */
export function getHolidayName(dateStr) {
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  const map = getHolidayMap(year);
  return map.get(dateStr) || null;
}

/**
 * 주어진 날짜가 공휴일(법정공휴일)인지 여부
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {boolean}
 */
export function isHoliday(dateStr) {
  return getHolidayName(dateStr) !== null;
}

/**
 * 주어진 날짜가 영업일(평일+공휴일 아닌 날)인지 여부
 * 토/일 또는 공휴일이면 false
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {boolean}
 */
export function isWorkday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !isHoliday(dateStr);
}

/**
 * FullCalendar용 dayCellClassNames 헬퍼
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string[]}
 */
export function getDayCellClassNames(dateStr) {
  const classes = [];
  const d = new Date(dateStr);
  const dow = d.getDay();
  if (isHoliday(dateStr)) {
    classes.push('fc-day-kr-holiday');
  } else if (dow === 0) {
    classes.push('fc-day-kr-sunday');
  } else if (dow === 6) {
    classes.push('fc-day-kr-saturday');
  }
  return classes;
}
