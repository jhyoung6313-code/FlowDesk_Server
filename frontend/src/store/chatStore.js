import { create } from 'zustand';
import useAuthStore from './authStore';

const useChatStore = create((set, get) => ({
  isOpen: false,
  rooms: [],
  activeRoomId: null,
  messages: {},        // { roomId: ChatMessage[] }
  threadData: null,    // { parent, replies } — 현재 열린 스레드
  savedMessages: [],
  totalUnread: 0,

  // 타이핑 상태: { [roomId]: { [userId]: { displayName, timestamp } } }
  typingUsers: {},
  // 온라인 사용자 ID 집합
  onlineUserIds: new Set(),

  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

  setRooms: (rooms) => {
    const total = rooms.reduce((acc, r) => acc + (r.unread || 0), 0);
    set({ rooms, totalUnread: total });
  },

  upsertRoom: (room) => {
    set((s) => {
      // undefined 값은 기존 데이터를 덮어쓰지 않도록 필터링
      const patch = Object.fromEntries(Object.entries(room).filter(([, v]) => v !== undefined));
      const exists = s.rooms.find((r) => r.id === room.id);
      const rooms = exists
        ? s.rooms.map((r) => (r.id === room.id ? { ...r, ...patch } : r))
        : [{ isFavorite: false, isMuted: false, unread: 0, lastMessage: null, ...room }, ...s.rooms];
      const total = rooms.reduce((acc, r) => acc + (r.unread || 0), 0);
      return { rooms, totalUnread: total };
    });
  },

  setActiveRoom: (roomId) => {
    set({ activeRoomId: roomId, threadData: null });
    if (roomId !== null) {
      set((s) => {
        const rooms = s.rooms.map((r) =>
          r.id === roomId ? { ...r, unread: 0 } : r
        );
        const total = rooms.reduce((acc, r) => acc + (r.unread || 0), 0);
        return { rooms, totalUnread: total };
      });
    }
  },

  setMessages: (roomId, messages) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: messages } })),

  prependMessages: (roomId, older) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: [...older, ...(s.messages[roomId] || [])],
      },
    })),

  addMessage: (message) => {
    const { activeRoomId, isOpen } = get();
    // 내가 보낸 메시지(보드/런 시스템 메시지 포함)는 나에게 안읽음으로 세지 않는다.
    const myId = useAuthStore.getState().user?.id;
    const isOwn = myId != null && (message.senderId === myId || message.sender?.id === myId);
    set((s) => {
      const prev = s.messages[message.roomId] || [];
      if (prev.some((m) => m.id === message.id)) return {};
      const messages = { ...s.messages, [message.roomId]: [...prev, message] };

      const rooms = s.rooms.map((r) => {
        if (r.id !== message.roomId) return r;
        // 채팅 페이지가 실제로 열려있고(isOpen) 그 방을 보고 있을 때만 '읽음'으로 간주.
        // activeRoomId는 페이지를 떠나도 남아있어, isOpen 없이 판정하면 안읽음이 누락된다.
        const isActive = isOwn || (isOpen && activeRoomId === message.roomId);
        return {
          ...r,
          lastMessage: message,
          unread: isActive ? 0 : (r.unread || 0) + 1,
          updatedAt: message.createdAt,
        };
      });
      const total = rooms.reduce((acc, r) => acc + (r.unread || 0), 0);
      return { messages, rooms, totalUnread: total };
    });
  },

  updateMessage: (message) => {
    set((s) => {
      const prev = s.messages[message.roomId] || [];
      const messages = {
        ...s.messages,
        [message.roomId]: prev.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
      };
      // 스레드 패널이 열려있으면 거기도 업데이트
      let threadData = s.threadData;
      if (threadData) {
        if (threadData.parent?.id === message.id) {
          threadData = { ...threadData, parent: { ...threadData.parent, ...message } };
        }
        threadData = {
          ...threadData,
          replies: threadData.replies.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
        };
      }
      return { messages, threadData };
    });
  },

  deleteMessage: (messageId, roomId) => {
    set((s) => {
      const prev = s.messages[roomId] || [];
      const messages = {
        ...s.messages,
        [roomId]: prev.map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, content: '' } : m
        ),
      };
      let threadData = s.threadData;
      if (threadData) {
        threadData = {
          ...threadData,
          replies: threadData.replies.map((m) =>
            m.id === messageId ? { ...m, isDeleted: true, content: '' } : m
          ),
        };
      }
      return { messages, threadData };
    });
  },

  updateReaction: (messageId, roomId, reactions) => {
    set((s) => {
      const updateMsgs = (msgs) =>
        msgs.map((m) => (m.id === messageId ? { ...m, reactions } : m));

      const messages = {
        ...s.messages,
        [roomId]: updateMsgs(s.messages[roomId] || []),
      };

      let threadData = s.threadData;
      if (threadData) {
        threadData = {
          ...threadData,
          parent: threadData.parent?.id === messageId
            ? { ...threadData.parent, reactions }
            : threadData.parent,
          replies: updateMsgs(threadData.replies),
        };
      }
      return { messages, threadData };
    });
  },

  updateReplyCount: (messageId, roomId, count) => {
    set((s) => {
      const messages = {
        ...s.messages,
        [roomId]: (s.messages[roomId] || []).map((m) =>
          m.id === messageId ? { ...m, _count: { ...m._count, replies: count } } : m
        ),
      };
      return { messages };
    });
  },

  // 스레드 패널
  setThreadData: (data) => set({ threadData: data }),
  closeThread: () => set({ threadData: null }),

  addThreadReply: (message) => {
    set((s) => {
      if (!s.threadData || s.threadData.parent?.id !== message.parentId) return {};
      const alreadyExists = s.threadData.replies.some((r) => r.id === message.id);
      if (alreadyExists) return {};
      return {
        threadData: {
          ...s.threadData,
          replies: [...s.threadData.replies, message],
        },
      };
    });
  },

  setSavedMessages: (savedMessages) => set({ savedMessages }),

  // 타이핑 상태 업데이트
  setUserTyping: (roomId, userId, displayName) => {
    set((s) => ({
      typingUsers: {
        ...s.typingUsers,
        [roomId]: {
          ...(s.typingUsers[roomId] || {}),
          [userId]: { displayName, timestamp: Date.now() },
        },
      },
    }));
  },

  clearUserTyping: (roomId, userId) => {
    set((s) => {
      const room = { ...(s.typingUsers[roomId] || {}) };
      delete room[userId];
      return { typingUsers: { ...s.typingUsers, [roomId]: room } };
    });
  },

  // 온라인 상태
  setOnlineUsers: (userIds) => set({ onlineUserIds: new Set(userIds) }),
  setUserOnline: (userId) =>
    set((s) => ({ onlineUserIds: new Set([...s.onlineUserIds, userId]) })),
  setUserOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds);
      next.delete(userId);
      return { onlineUserIds: next };
    }),

  removeRoom: (roomId) =>
    set((s) => {
      const rooms = s.rooms.filter((r) => r.id !== roomId);
      const total = rooms.reduce((acc, r) => acc + (r.unread || 0), 0);
      return {
        rooms,
        totalUnread: total,
        activeRoomId: s.activeRoomId === roomId ? null : s.activeRoomId,
        threadData: s.activeRoomId === roomId ? null : s.threadData,
      };
    }),

  toggleFavoriteRoom: (roomId, isFavorite) =>
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, isFavorite } : r)),
    })),

  // 읽음 확인: { [roomId]: { [userId]: lastReadAt } }
  memberReadAt: {},
  upsertMemberReadAt: (roomId, userId, lastReadAt) =>
    set((s) => ({
      memberReadAt: {
        ...s.memberReadAt,
        [roomId]: { ...(s.memberReadAt[roomId] || {}), [userId]: lastReadAt },
      },
    })),
}));

export default useChatStore;
