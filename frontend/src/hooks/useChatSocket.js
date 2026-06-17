import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useChatStore from '../store/chatStore';
import useAuthStore from '../store/authStore';
import useNotificationStore from '../store/notificationStore';
import useUnreadStore from '../store/unreadStore';
import { getRooms } from '../api/chat';
import { getBoardUnreadCount } from '../api/boards';
import { getRunUnreadCount } from '../api/playbook';

function getRoomLabel(msg) {
  const rooms = useChatStore.getState().rooms;
  const room = rooms.find((r) => r.id === msg.roomId);
  if (!room) return msg.room?.type === 'direct' ? 'DM' : '채팅';
  if (room.type === 'direct') return 'DM';
  return room.name || '채팅';
}

// Vite dev 환경에서는 백엔드 직접 연결, 프로덕션(Docker/nginx)은 nginx 경유
const SOCKET_URL = import.meta.env.DEV
  ? 'http://localhost:4000'
  : window.location.origin;

export default function useChatSocket(token) {
  const socketRef = useRef(null);
  const {
    addMessage, addThreadReply, updateMessage,
    deleteMessage, updateReaction, updateReplyCount,
    setUserTyping, clearUserTyping,
    setOnlineUsers, setUserOnline, setUserOffline,
  } = useChatStore.getState();

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    // 최신 store 액션 항상 가져오기
    const get = () => useChatStore.getState();

    socket.on('room-created', (room) => {
      get().upsertRoom(room);
      socket.emit('join-room', room.id);
    });

    socket.on('new-message', (msg) => {
      if (!msg.parentId) {
        get().addMessage(msg);
        const me = useAuthStore.getState().user;
        const { isOpen, activeRoomId } = get();
        const isViewingRoom = isOpen && activeRoomId === msg.roomId;
        if (me && msg.sender?.id !== me.id && !isViewingRoom) {
          const roomLabel = getRoomLabel(msg);
          const preview = (msg.content || '').replace(/<[^>]*>/g, '').slice(0, 80)
            || (msg.fileName ? `📎 ${msg.fileName}` : '새 메시지');
          useNotificationStore.getState().addTransientToast({
            type: 'chat',
            title: `[${roomLabel}] ${msg.sender?.displayName || '알 수 없음'}`,
            message: preview,
            path: '/chat',
          });
        }
      }
    });

    socket.on('thread-message', (msg) => {
      get().addThreadReply(msg);
    });

    socket.on('message-reply-count', ({ messageId, roomId, count }) => {
      get().updateReplyCount(messageId, roomId, count);
    });

    socket.on('message-edited', (msg) => {
      get().updateMessage(msg);
    });

    socket.on('message-deleted', ({ messageId, roomId }) => {
      get().deleteMessage(messageId, roomId);
    });

    socket.on('message-reaction', ({ messageId, reactions }) => {
      const { messages } = get();
      // 어느 방의 메시지인지 찾기
      const roomId = Object.keys(messages).find((rid) =>
        (messages[rid] || []).some((m) => m.id === messageId)
      );
      if (roomId) get().updateReaction(messageId, Number(roomId), reactions);
    });

    socket.on('mention', ({ from, content }) => {
      useNotificationStore.getState().addTransientToast({
        type: 'mention',
        title: `${from}님이 언급했습니다`,
        message: (content || '').replace(/<[^>]*>/g, '').slice(0, 80),
        path: '/chat',
      });
    });

    // ── 타이핑 인디케이터 ──────────────────────────────────
    const typingTimers = {};

    socket.on('typing', ({ roomId, userId, displayName }) => {
      const me = useAuthStore.getState().user;
      if (me && userId === me.id) return;
      get().setUserTyping(roomId, userId, displayName);

      // 3초 후 자동 제거
      clearTimeout(typingTimers[`${roomId}:${userId}`]);
      typingTimers[`${roomId}:${userId}`] = setTimeout(() => {
        get().clearUserTyping(roomId, userId);
      }, 3000);
    });

    socket.on('stop-typing', ({ roomId, userId }) => {
      clearTimeout(typingTimers[`${roomId}:${userId}`]);
      get().clearUserTyping(roomId, userId);
    });

    // ── 온라인 상태 ────────────────────────────────────────
    socket.on('online-users', (userIds) => {
      get().setOnlineUsers(userIds);
    });

    socket.on('user-online', (userId) => {
      get().setUserOnline(userId);
    });

    socket.on('user-offline', (userId) => {
      get().setUserOffline(userId);
    });

    // 카드 생성/수정/댓글은 연결된 채팅방 메시지로 알림이 가므로(토스트 중복 방지)
    // 여기서는 사이드바 보드 안읽음 배지만 누적한다.
    socket.on('board-card-created', ({ boardId, actorId }) => {
      const me = useAuthStore.getState().user;
      if (!me || actorId === me.id) return;
      useUnreadStore.getState().incBoard(boardId);
    });

    socket.on('board-comment-added', ({ boardId, actorId }) => {
      const me = useAuthStore.getState().user;
      if (!me || actorId === me.id) return;
      useUnreadStore.getState().incBoard(boardId);
    });

    // ── Playbook/Run 활동 (전역 broadcast) — 사이드바 안읽음 누적 ──
    socket.on('playbook-activity', ({ actorId }) => {
      const me = useAuthStore.getState().user;
      if (!me || actorId === me.id) return;
      useUnreadStore.getState().incPlaybook();
    });

    socket.on('board-created', ({ boardId, boardTitle, actorId, actorName }) => {
      const me = useAuthStore.getState().user;
      if (!me || actorId === me.id) return;
      useNotificationStore.getState().addTransientToast({
        type: 'board',
        title: `${actorName}`,
        message: `새 보드 "${boardTitle}"가 생성되었습니다.`,
        path: `/boards/${boardId}`,
      });
    });

    socket.on('board-updated', ({ boardId, boardTitle, actorId, actorName }) => {
      const me = useAuthStore.getState().user;
      if (!me || actorId === me.id) return;
      useNotificationStore.getState().addTransientToast({
        type: 'board',
        title: `[${boardTitle}] ${actorName}`,
        message: '보드 정보가 수정되었습니다.',
        path: `/boards/${boardId}`,
      });
    });

    socket.on('board-attachment-added', ({ boardId, cardId, cardTitle, boardTitle, actorId, actorName, fileName }) => {
      const me = useAuthStore.getState().user;
      if (!me || actorId === me.id) return;
      useNotificationStore.getState().addTransientToast({
        type: 'board',
        title: `[${boardTitle}] ${actorName}`,
        message: `"${cardTitle}"에 파일 첨부: ${fileName}`,
        path: `/boards/${boardId}?card=${cardId}`,
      });
    });

    // ── 읽음 확인 ────────────────────────────────────────────
    socket.on('user-read', ({ roomId, userId, lastReadAt }) => {
      get().upsertMemberReadAt(roomId, userId, lastReadAt);
    });

    // ── 공지 업데이트 ──────────────────────────────────────────
    socket.on('announcement-updated', ({ roomId, announcement }) => {
      get().upsertRoom({ id: roomId, announcement });
    });

    // ── 메시지 전송 오류 ──────────────────────────────────────
    socket.on('message-error', ({ error }) => {
      useNotificationStore.getState().addTransientToast({
        type: 'error',
        title: '메시지 전송 실패',
        message: error || '메시지를 전송하지 못했습니다.',
      });
    });

    // ── 소켓 연결 오류 ────────────────────────────────────────
    socket.on('connect_error', (err) => {
      console.error('[Chat] 소켓 연결 오류:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Chat] 소켓 연결 끊김:', reason);
    });

    // Socket.IO v4: reconnect 이벤트는 socket.io(Manager)에만 발생하므로
    // connect 이벤트를 사용해야 초기 연결 + 재연결 모두 처리됨
    // 채팅 페이지 방문 전에도 사이드바 안읽음 배지가 뜨도록, 연결 시 방 목록을
    // 직접 로드해 store(totalUnread)를 채우고 각 방에 join하여 실시간 갱신을 받는다.
    socket.on('connect', async () => {
      try {
        const data = await getRooms();
        get().setRooms(data);
        data.forEach((r) => socket.emit('join-room', r.id));
      } catch {
        // 로드 실패 시 기존 store에 있는 방이라도 join
        get().rooms.forEach((r) => socket.emit('join-room', r.id));
      }
      // 보드 / Playbook 안읽음 카운트도 함께 동기화 (새로고침·재연결 후 배지 복원)
      getBoardUnreadCount()
        .then((d) => useUnreadStore.getState().setBoardUnreadMap(d.boards))
        .catch(() => {});
      getRunUnreadCount()
        .then((d) => useUnreadStore.getState().setPlaybookUnread(d.total))
        .catch(() => {});
    });

    return () => {
      Object.values(typingTimers).forEach(clearTimeout);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return socketRef;
}
