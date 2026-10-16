# tm-collab-edit — 위키 실시간 공동편집 (F-69)

위키 문서를 여러 명이 동시에 편집(CRDT 기반 자동 머지 + 협업 커서). M365 Word 온라인 공동작업 대응. 기존 편집 경로 회귀를 막기 위해 공유 RichEditor는 무변경, 별도 `CollaborativeEditor` opt-in 컴포넌트로 격리.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 서버(y-websocket 임베드 + 권한검증) | `backend/src/collabServer.js` |
| 진입점 연결 | `backend/src/app.js` (`setupCollab`) |
| 에디터 컴포넌트 | `frontend/src/components/CollaborativeEditor.jsx` |
| 연동 화면 | `frontend/src/pages/Wiki/index.jsx` (opt-in 토글) |

## 기술
TipTap v3 Collaboration + CollaborationCaret + `@tiptap/y-tiptap`, Yjs(CRDT), y-websocket. 서버는 `ws` + `y-websocket`(`setupWSConnection`)을 기존 http 서버에 `/collab` path로 임베드(Socket.IO(채팅)와 포트 공유, upgrade 핸들러는 path로 분리 — `/collab` 이외는 절대 건드리지 않음).

## 인증·권한(회귀 위험이 가장 큰 지점)
- **JWT 검증**: ws 핸드셰이크 쿼리의 토큰을 `jwt.verify`로 확인 — 여기까지는 "로그인한 사용자인가"만 확인.
- **문서 단위 권한**(`canJoinRoom(docName, user)`): 방 이름이 `wiki-doc-<id>`/`meeting-<id>` 형태일 때 실제 문서를 조회해 REST API와 동일한 규칙으로 재검증한다.
  - wiki-doc: [tm-sensitivity]의 `canAccessSpace`(비공개 스페이스)·`canSeeSensitive`(기밀 게이트)와 **동일 조건**을 collabServer.js 안에서 다시 구현.
  - meeting: organizer이거나 attendees에 포함된 경우만.
  - **이 검증이 없으면** REST에서 403인 문서라도 room 이름(`wiki-doc-<id>`, 순차 정수라 추측 가능)만 알면 자신의 유효한 JWT로 직접 연결해 전체 문서를 읽고 쓸 수 있다 — 과거 리뷰에서 실제로 발견된 Critical 취약점(수정 완료, `CODE_REVIEW_m365-gap-features.md` 1절 참조). **방 접두사를 새로 추가할 때마다 `canJoinRoom`에 해당 분기를 반드시 추가할 것.**
- 그 외 path의 upgrade는 절대 건드리지 않아 Socket.IO와 안전 공존.

## 영속화
서버는 인메모리 릴레이(DB 저장은 클라이언트가 편집 종료·저장 시 HTML로 수행, 기존 `wiki_docs.content` + 버전이력([tm-wiki])과 호환). 최초 접속 시 Yjs 문서가 비어있으면 DB 본문으로 시드(중복 방지 가드).
`setPersistence({ bindState, writeState })`를 no-op으로라도 등록해둬야 y-websocket의 "마지막 연결 종료 시 문서를 메모리에서 퇴출" 로직이 동작한다 — 등록하지 않으면 열어본 모든 문서의 Y.Doc이 프로세스 종료까지 메모리에 영구 누적된다.

## UX
위키 편집 헤더 "공동편집" 토글 → 실시간 모드 진입. 접속자 아바타(커스텀 아바타 색 반영, `utils/colors.js`의 `getAvatarColor`)·연결상태 배지·협업 커서(이름·색상) 표시.

## 프론트 구현 주의사항
`Y.Doc`/`WebsocketProvider` 생성은 생성자가 즉시 소켓을 여는 부수효과가 있어 `useMemo`로 만들면 React StrictMode(개발 모드)의 이중 렌더에서 소켓이 2개 열리고 하나가 누수된다. `clientRef`(useRef) 가드로 같은 커밋 내 재생성을 막고, 정리(destroy)는 별도 `useEffect`의 cleanup에 위임한다(`CollaborativeEditor.jsx` 참조).

## 배포 주의
운영(nginx) 환경은 `/collab` WebSocket을 백엔드로 프록시하도록 설정 필요(`/socket.io`와 동일 패턴, Upgrade/Connection 헤더 전달).

## 미구현(후속 확장 후보)
회의록([tm-meeting]) 연동(방 접두사 `meeting-` 이미 허용, `canJoinRoom`도 구현됨 — 프론트 연동만 남음), 서버측 영속화(y-leveldb)로 무손실 지속, 편집 잠금·리비전 병합 알림.
