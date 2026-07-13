# tm-board — 보드(Board) 시스템 (F-34, F-35)

독립 칸반 보드 워크스페이스(3분할 셸). 카테고리·저장뷰·커스텀 속성·자동화·카드.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 보드 워크스페이스 | `frontend/src/pages/Board/` (BoardWorkspace) |
| 보드 API 함수 | `frontend/src/api/boards.js`, `frontend/src/api/boardCategories.js` |
| 보드 컨트롤러 | `backend/src/controllers/boardController.js` |
| 카테고리 컨트롤러 | `backend/src/controllers/boardCategoryController.js` |
| 라우트 | `backend/src/routes/boards.js`, `boardCategories.js` |
| 채팅 연동 서비스 | `backend/src/services/linkedRoomService.js` ([tm-chat]) |

## F-34 보드 관리
- 3분할 워크스페이스(`/boards`, `/boards/:id` 동일 셸): 좌측 카테고리·보드 트리 + 우측 내용
- 보드: 아이콘·배경색·설명, 멤버 초대·역할(admin/member)
- **커스텀 속성(BoardProperty)**: 텍스트/숫자/날짜/선택/체크박스
- **자동화(BoardAutomation)**: 트리거 → 액션
- 기본 뷰: 칸반/타임라인/테이블/갤러리/캘린더
- **카테고리(BoardCategory)**: 공용/개인 범위 + 폴더 중첩(parentId). 삭제 시 소속 보드 미분류로
- **저장 뷰(BoardView)**: 이름 붙은 뷰(타입+필터+정렬+검색+컬럼) 탭 저장·전환, 기본뷰(isDefault)
- **안읽음 배지**: `BoardMember.lastReadAt` 기준 새 카드·댓글 집계(본인 제외)
- **채팅방 자동 연동**: 카드 생성/수정/삭제·댓글 시 보드명 그룹채팅방(`boards.linked_room_id`)에 알림
- API: `GET/POST /api/boards`, `PUT/DELETE /api/boards/:id`, `PATCH /api/boards/reorder`
  - 카테고리: `GET/POST /api/board-categories`, `PUT/DELETE /api/board-categories/:id`, `PATCH /api/board-categories/reorder`
  - 저장뷰: `GET/POST /api/boards/:id/views`, `PUT/DELETE /api/boards/:id/views/:viewId`, `PATCH /api/boards/:id/views/reorder`
  - 안읽음: `GET /api/boards/unread-count`, `POST /api/boards/:id/read`

## F-35 보드 카드
- CRUD(제목·설명·담당자·마감일·우선순위·진행률·커버 이미지/색상)
- 체크리스트·첨부·댓글, 카드 의존관계(blocks/depends-on)
- 기존 업무(Task) 연결(linkedTaskId)
- **담당자 자동 연동**: 카드에 담당자 지정 시 Task 자동 생성·연결, 제목·상태·우선순위·기한·담당자 지속 동기화(담당자 제거/카드 삭제 시 Task 유지)
- API: `GET/POST /api/boards/:id/cards`, `PUT/DELETE /api/boards/cards/:cardId`

> board_cards.status/priority는 Task enum 미사용, String 저장(커스텀 상태 지원).
