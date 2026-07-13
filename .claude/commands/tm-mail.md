# tm-mail — 사내 메일 (F-54)

내부 사용자 간 메일함. 수신자별 상태(읽음/별표/폴더)를 개별 관리하며 스레드·라벨·첨부를 지원.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 메일 페이지 | `frontend/src/pages/Mail/{index,MailDetail,ComposeModal,LabelManager}.jsx` |
| 팝업 | `frontend/src/pages/ChatPopup` |
| Mail API 함수 | `frontend/src/api/mail.js` |
| 컨트롤러 | `backend/src/controllers/mailController.js` |
| 라우트 | `backend/src/routes/mail.js` (마운트 `/mail`) |
| 스키마 | `backend/prisma/schema.prisma` (InternalMail, InternalMailRecipient, InternalMailLabel, InternalMailLabelLink, InternalMailComment, InternalMailAttachment) |

## F-54 상세

### 메일 (InternalMail)
- 제목(subject)·본문(body), 임시보관(`isDraft`), 중요도(`priority`: normal/urgent)
- 답장·전달 원본(`parentId`·`forwardedFrom`), 대화 스레드 루트(`threadId`)

### 수신자 (InternalMailRecipient) — 상태는 수신자별로 개별
- 수신유형(`type`: to/cc/bcc), 읽음(`isRead`/`readAt`), 별표(`isStarred`)
- 폴더(`folder`: inbox/trash), 소프트 삭제(`deletedAt`)

### 라벨 (InternalMailLabel)
- 사용자별 색상 라벨 + 메일 연결(InternalMailLabelLink, `@@unique([labelId, mailId])`)

### API (마운트 `/api/mail`)
- 목록/CRUD: `GET /api/mail`, `POST /api/mail`(임시저장/작성), `GET/PUT/DELETE /api/mail/:id`
- 상태: `GET /api/mail/unread-count`, `DELETE /api/mail/trash`(휴지통 비우기), `POST /api/mail/bulk`(일괄)
- 전송: `POST /api/mail/:id/{send,reply,forward}`, `PATCH /api/mail/:id/{star,read}`, `PUT /api/mail/:id/labels`
- 라벨: `GET/POST /api/mail/labels`, `PUT/DELETE /api/mail/labels/:id`
- 첨부: `POST /api/mail/:id/attachments`, `GET /api/mail/:id/attachments/:aid/download`, `DELETE /api/mail/:id/attachments/:aid`
- 코멘트: `GET/POST /api/mail/:id/comments`, `DELETE /api/mail/:id/comments/:cid`

## 화면 경로
- `/mail` 메일함 · `/chat-popup` 팝업
