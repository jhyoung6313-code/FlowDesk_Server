# tm-documents — 통합 문서함 (F-68)

여러 도메인(업무·보드·게시판·결재·메일)에 흩어진 기존 첨부 파일을 한 곳에서 검색. M365 SharePoint 라이브러리 경량판. polymorphic 마이그레이션 없이 기존 첨부 테이블만 읽기 전용 집계(무의존·무마이그레이션·additive).

## 관련 파일

| 구분 | 경로 |
|------|------|
| 컨트롤러 | `backend/src/controllers/documentController.js` |
| 라우트 | `backend/src/routes/documents.js` |
| 프론트 API | `frontend/src/api/documents.js` |
| 화면 | `frontend/src/pages/Documents/index.jsx` |

## 집계 대상
`task_attachments`·`board_card_attachments`·`bbs_attachments`·`approval_attachments`·`internal_mail_attachments`(공통 필드 originalName·mimeType·size·uploadedBy·createdAt + 부모 FK)를 정규화 병합.

## 접근제어(도메인별 존중 — 소스 추가 시 반드시 각 도메인 규칙을 그대로 가져올 것)
- **메일**: 개인정보라 **관리자도 예외 없이** 발신자/수신자만.
- **결재**: 기안자/결재자만(관리자는 전체) — `backend/src/services/approvalAccess.js`의 `approvalVisibilityWhere(uid)`를 [tm-approval]/전역검색과 **공유**한다.
- **게시판**: [tm-sensitivity]의 confidential 게이트 적용(비관리자는 기밀 제외).
- **보드**: 보드 멤버십(`card.board.members.some({ userId })`, 관리자는 예외) — 과거 리뷰에서 이 필터가 통째로 빠져 비멤버에게 보드 카드 첨부파일이 노출된 적이 있었다(`GET /api/documents?source=board`).
- **업무**: 팀 공개(기존 전역검색 신뢰모델과 동일, 별도 필터 없음).

## 기능
파일명 검색(디바운스), 출처별 필터(세그먼트+카운트), 원본 위치로 이동 링크, 파일유형 아이콘·크기·올린이(아바타는 `utils/colors.js`의 `getAvatarColor(uploaderId, uploaderColor)` 사용 — 이름 해시 기반 별도 팔레트를 재구현하지 말 것, 메일/보드/채팅과 색이 어긋난다)·등록일.

## API (인증 필요)
`GET /api/documents?q=&source=&limit=` → `{ total, counts, items: [{ source, fileName, mimeType, size, uploaderName, uploaderId, uploaderColor, createdAt, contextTitle, contextPath }] }`

## 화면
`/documents` — 사이드바 '협업' 그룹 '문서함'.

## 미구현(후속 확장 후보)
직접 다운로드(현재 원본 위치 이동), 전문검색(파일 본문 tsvector/pg_bigm), 위키 첨부·WBS 산출물 포함, 태그·즐겨찾기.
