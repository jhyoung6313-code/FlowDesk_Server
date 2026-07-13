# tm-collab — 협업 기능 (F-17, F-23, F-31, F-46)

업무 댓글·히스토리·타임트래킹·첨부파일.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 댓글 컨트롤러 | `backend/src/controllers/commentController.js` |
| 히스토리 컨트롤러 | `backend/src/controllers/historyController.js` |
| 타임트래킹 컨트롤러 | `backend/src/controllers/timeTrackingController.js` |
| 첨부 컨트롤러 | `backend/src/controllers/attachmentController.js` |
| 타임트래킹 라우트 | `backend/src/routes/timeTracking.js` |
| 댓글 API 함수 | `frontend/src/api/comments.js` |
| 리사이즈 드로어 | `frontend/src/components/common/ResizableDrawer` |

## 기능 상세

### F-17 댓글 (진행사항)
- 위치: 업무 **수정 폼**(TaskForm) 하단(취소/저장 위). 기존 업무 수정 시에만 노출
- 댓글 CRUD + **파일 첨부**(최대 20MB, `commentId` 기준 별도 관리)
- @멘션 지원([F-50] mentionService)
- API: `GET/POST /api/tasks/:id/comments`, `PUT/DELETE /api/tasks/comments/:commentId`, `POST /api/tasks/:id/comments/:commentId/attachment`
- 참고: 상세보기(👁) 드로어에는 댓글/첨부/캘린더이동 탭 없음

### F-23 히스토리 (변경 이력)
- 업무 생성·수정·삭제 시 자동 기록(필드명·이전값·신규값·변경자·시각)
- API: `GET /api/tasks/:id/history`

### F-31 타임 트래킹
- 실제 작업 시간(시작·종료·메모), 총계 집계
- API: `GET/POST /api/time-entries`, `PUT/DELETE /api/time-entries/:id`

### F-46 첨부파일
- 업무당 다중 첨부(multer, 원본 파일명 보존, 다운로드)
- API: `GET/POST /api/tasks/:id/attachments`, `DELETE /api/attachments/:id`
