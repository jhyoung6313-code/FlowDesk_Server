import { create } from 'zustand';
import { getNotifications, readNotification, readAllNotifications } from '../api/notifications';

const SESSION_KEY = 'notification_shown_ids';

function loadSeenIds() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]));
  } catch {}
}

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  toasts: [],
  _seenIds: loadSeenIds(),

  fetch: async () => {
    const notifications = await getNotifications();
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    const { _seenIds } = get();
    const newToasts = notifications.filter((n) => !n.isRead && !_seenIds.has(n.id));

    if (newToasts.length > 0) {
      const newSeenIds = new Set(_seenIds);
      newToasts.forEach((n) => newSeenIds.add(n.id));
      saveSeenIds(newSeenIds);
      set((state) => ({
        notifications,
        unreadCount,
        _seenIds: newSeenIds,
        toasts: [
          ...state.toasts,
          ...newToasts.map((n) => ({ ...n, _toastId: `toast-${n.id}-${Date.now()}` })),
        ],
      }));
    } else {
      set({ notifications, unreadCount });
    }
  },

  // SSE로 수신한 단일 알림 추가
  addSSENotification: (notification) => {
    const { _seenIds } = get();
    if (_seenIds.has(notification.id)) return;
    const newSeenIds = new Set(_seenIds);
    newSeenIds.add(notification.id);
    saveSeenIds(newSeenIds);
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
      _seenIds: newSeenIds,
      toasts: [
        ...state.toasts,
        { ...notification, _toastId: `toast-${notification.id}-${Date.now()}` },
      ],
    }));
  },

  // 로그인 시 호출 — sessionStorage 초기화하여 다음 fetch에서 팝업 재표시
  resetSeenIds: () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    set({ _seenIds: new Set() });
  },

  // DB 미등록 일시 토스트 (채팅·보드 알림용)
  addTransientToast: ({ type, title, message, path }) => {
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          type,
          title,
          message,
          path,
          _toastId: `toast-transient-${Date.now()}-${Math.random()}`,
        },
      ],
    }));
  },

  dismissToast: (toastId) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t._toastId !== toastId),
    }));
  },

  markRead: async (id) => {
    await readNotification(id);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await readAllNotifications();
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
  },
}));

export default useNotificationStore;
