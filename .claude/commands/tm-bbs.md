# tm-bbs — 게시판(BBS) (F-53)

카테고리 기반 공지/공문 게시판. 공문 전용 필드(발신기관·시행일·수신부서)와 대시보드 노출을 지원.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 게시판 페이지 | `frontend/src/pages/BBS/{index,PostDetail,PostFormDrawer}.jsx` |
| BBS API 함수 | `frontend/src/api/bbs.js` |
| 게시글 컨트롤러 | `backend/src/controllers/bbsPostController.js` |
| 카테고리 컨트롤러 | `backend/src/controllers/bbsCategoryController.js` |
| 라우트 | `backend/src/routes/bbs.js` (마운트 `/`) |
| 스키마 | `backend/prisma/schema.prisma` (BbsCategory, UserDashboardBbsCategory, BbsPost, BbsComment, BbsAttachment) |

## F-53 상세

### 카테고리 (BbsCategory)
- 아이콘·색상·계층(parentId)·정렬
- 쓰기권한(`writeRole`, 기본 `all`), 대시보드 노출(`showOnDashboard`)
- API: `GET/POST /api/bbs-categories`, `PUT /api/bbs-categories/reorder`, `PUT/DELETE /api/bbs-categories/:id`

### 대시보드 위젯 연동
- 사용자별로 대시보드에 표시할 카테고리 선택 → `UserDashboardBbsCategory`
- API: `GET/PUT /api/bbs-categories/dashboard`

### 게시글 (BbsPost)
- 제목·내용(Text)
- **공문 필드**: 발신기관(`senderOrg`), 공문 시행일(`officialDueDate`), 수신부서(`recipientDepts[]`)
- 상단고정(`isPinned`), 조회수(`viewCount`), 소프트 삭제(`delYn`)
- API: `GET/POST /api/bbs`, `GET/PUT/DELETE /api/bbs/:id`, `PUT /api/bbs/:id/pin`

### 댓글 (BbsComment)
- 대댓글(parentId 트리), 소프트 삭제, 첨부 가능
- API: `GET/POST /api/bbs/:id/comments`, `PUT/DELETE /api/bbs/:id/comments/:cid`

### 첨부 (BbsAttachment)
- 게시글·댓글 첨부(commentId로 분리), multer 저장, 원본 파일명 보존
- API: `POST /api/bbs/:id/attachments`, `GET /api/bbs/:id/attachments/:aid/download`, `DELETE /api/bbs/:id/attachments/:aid`

## 화면 경로
- `/bbs` 게시판 (카테고리 관리 포함)
