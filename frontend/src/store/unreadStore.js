import { create } from 'zustand';

// 보드 / Playbook 안읽음 카운트 (채팅 totalUnread와 동일한 역할)
const useUnreadStore = create((set, get) => ({
  boardUnread: 0,          // 전체 보드 안읽음 합계 (사이드바 메뉴 배지용)
  boardUnreadMap: {},      // 보드별 안읽음 { [boardId]: count } (보드 트리 배지용)
  playbookUnread: 0,

  // 현재 보고 있는 대상 — 이 대상의 새 활동은 안읽음으로 누적하지 않는다.
  boardViewingId: null,   // 열람 중인 보드 id (없으면 null)
  playbookViewing: false, // Playbook/Run 목록 화면을 보는 중인지

  // 서버 집계( GET /boards/unread-count: { total, boards } )로 전체 동기화
  setBoardUnreadMap: (boards = {}) => {
    const map = { ...boards };
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    set({ boardUnreadMap: map, boardUnread: total });
  },
  setPlaybookUnread: (n) => set({ playbookUnread: Math.max(0, n) }),

  incBoard: (boardId) => {
    // 지금 그 보드를 보고 있으면 누적하지 않음
    if (get().boardViewingId === boardId) return;
    set((s) => {
      const cur = s.boardUnreadMap[boardId] || 0;
      return {
        boardUnreadMap: { ...s.boardUnreadMap, [boardId]: cur + 1 },
        boardUnread: s.boardUnread + 1,
      };
    });
  },
  incPlaybook: () => {
    if (get().playbookViewing) return;
    set((s) => ({ playbookUnread: s.playbookUnread + 1 }));
  },

  // 특정 보드 읽음 처리 — 서버 재집계 전에 배지를 즉시 제거(낙관적 반영)
  clearBoardUnread: (boardId) => set((s) => {
    const removed = s.boardUnreadMap[boardId] || 0;
    if (!removed) return {};
    const { [boardId]: _omit, ...rest } = s.boardUnreadMap;
    return { boardUnreadMap: rest, boardUnread: Math.max(0, s.boardUnread - removed) };
  }),

  setBoardViewing: (boardId) => set({ boardViewingId: boardId }),
  setPlaybookViewing: (viewing) => set({ playbookViewing: viewing }),
}));

export default useUnreadStore;
