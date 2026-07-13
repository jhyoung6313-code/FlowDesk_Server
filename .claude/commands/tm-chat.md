# tm-chat — 채팅 시스템 (F-38, F-39)

DM/그룹/공개/비공개 채팅방 + 스레드·리액션·핀·전달. 보드/플레이북 연동 전용방.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 채팅 페이지 | `frontend/src/pages/Chat/` |
| Chat API 함수 | `frontend/src/api/chat.js` |
| 컨트롤러 | `backend/src/controllers/chatController.js` |
| 라우트 | `backend/src/routes/chat.js` |
| 연동방 서비스 | `backend/src/services/linkedRoomService.js` |
| 소켓 | `backend/src/socket.js` |

## F-38 채팅방
- DM(direct)/그룹(group)/공개(public)/비공개(private)
- 멤버 초대/제거, 즐겨찾기, 뮤트, Socket.IO 실시간
- **전역 안읽음 카운트(사이드바)**: 방별 `lastReadAt` 집계, 미방문 상태에서도 소켓 연결 시 배지·실시간 누적(본인 발신 제외)
- **보드/플레이북 연동 전용방**: 보드/런 업데이트가 행위자 명의 시스템 메시지로 수신(linkedRoomService)
- API: `GET/POST /api/chat/rooms`, `DELETE /api/chat/rooms/:id`

## F-39 메시지 기능
- 텍스트/파일 전송, 메시지 수정·삭제(소프트)
- 스레드 답글(parentId), 이모지 리액션, 메시지 저장, 핀 고정, 전달(forwarding)
- **[확장] 예약 메시지(ScheduledChatMessage)**: 지정 시각 자동 발송
- 내부 링크(`/boards/...`, `/runs/...`)는 SPA 네비게이션(전체 새로고침 없음)
- API: `GET/POST /api/chat/rooms/:id/messages`

> 스키마: ChatRoom, ChatRoomMember, ChatMessage(parentId 스레드), ChatMessageReaction, ChatSavedMessage, ChatPinnedMessage, ScheduledChatMessage
