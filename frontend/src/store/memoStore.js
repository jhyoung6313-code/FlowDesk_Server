import { create } from 'zustand';
import * as memoApi from '../api/memos';

// 모든 메모 표면(메모지 페이지·헤더 위젯·대시보드)이 공유하는 단일 상태
const useMemoStore = create((set, get) => ({
  memos: [],
  loaded: false,
  loading: false,

  // 최초 1회 로드 (force=true 면 강제 새로고침)
  fetch: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true });
    try {
      const list = await memoApi.getMemos();
      set({ memos: list, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  create: async (payload) => {
    const created = await memoApi.createMemo(payload);
    set((s) => ({ memos: [...s.memos, created] }));
    return created;
  },

  // 낙관적 업데이트 + 실패 시 롤백
  update: async (id, patch) => {
    const prev = get().memos;
    set({ memos: prev.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
    try {
      const updated = await memoApi.updateMemo(id, patch);
      set((s) => ({ memos: s.memos.map((m) => (m.id === id ? updated : m)) }));
      return updated;
    } catch (e) {
      set({ memos: prev });
      throw e;
    }
  },

  remove: async (id) => {
    const prev = get().memos;
    set({ memos: prev.filter((m) => m.id !== id) });
    try {
      await memoApi.deleteMemo(id);
    } catch (e) {
      set({ memos: prev });
      throw e;
    }
  },

  // 드래그 중 위치 — 화면만 갱신(서버 저장은 드래그 종료 시 update 로)
  setPosLocal: (id, posX, posY) =>
    set((s) => ({ memos: s.memos.map((m) => (m.id === id ? { ...m, posX, posY } : m)) })),
}));

export default useMemoStore;
