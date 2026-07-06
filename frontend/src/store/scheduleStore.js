import { create } from 'zustand';
import * as api from '../api/schedule';

/* 일정·자원 공유 상태 (대시보드 위젯 · 월간 모달이 공유) */
const useScheduleStore = create((set, get) => ({
  events: [],
  resources: [],
  loading: false,
  range: { start: null, end: null },

  /* 지정한 날짜 구간의 일정을 로드 (구간이 바뀌면 교체) */
  fetchRange: async (start, end) => {
    set({ loading: true });
    try {
      const events = await api.getScheduleEvents({ start, end });
      set({ events, range: { start, end } });
      return events;
    } finally {
      set({ loading: false });
    }
  },

  /* 현재 구간을 다시 로드 */
  refresh: async () => {
    const { start, end } = get().range;
    if (start && end) return get().fetchRange(start, end);
  },

  fetchResources: async () => {
    const resources = await api.getScheduleResources();
    set({ resources });
    return resources;
  },

  createEvent: async (payload) => {
    const created = await api.createScheduleEvent(payload);
    await get().refresh();
    return created;
  },

  updateEvent: async (id, payload) => {
    const updated = await api.updateScheduleEvent(id, payload);
    await get().refresh();
    return updated;
  },

  removeEvent: async (id) => {
    await api.deleteScheduleEvent(id);
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
  },
}));

export default useScheduleStore;
