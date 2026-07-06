import { create } from 'zustand';
import dayjs from 'dayjs';
import * as api from '../api/holiday';

/* DB 등록 공휴일(임시·대체 등) — 내장 기본값(holidays.js)을 덮어쓰는 커스텀 맵 */
const useHolidayStore = create((set, get) => ({
  list: [],                 // 원본 레코드 [{id,date,name,type}]
  map: {},                  // { 'YYYY-MM-DD': '이름' } — getHoliday에 전달
  loaded: false,
  loading: false,

  fetch: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true });
    try {
      const list = await api.getHolidays();
      set({ list, map: toMap(list), loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  add: async (payload) => {
    await api.createHoliday(payload);
    const list = await api.getHolidays();
    set({ list, map: toMap(list) });
  },

  remove: async (id) => {
    await api.deleteHoliday(id);
    const list = get().list.filter((h) => h.id !== id);
    set({ list, map: toMap(list) });
  },
}));

function toMap(list) {
  const m = {};
  for (const h of list) m[dayjs(h.date).format('YYYY-MM-DD')] = h.name;
  return m;
}

export default useHolidayStore;
