# tm-wiki — 협업 위키/문서 (F-59)

팀 지식베이스·회의록·매뉴얼을 **스페이스 → 문서(계층 트리)** 구조로 작성·공유.
개인 메모지([tm-views] F-47)와 달리 팀 공유·버전·댓글을 갖춘다.
문서 본문은 [tm-mail]/[tm-bbs]와 동일한 `RichEditor`(TipTap) HTML로 저장.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 컨트롤러 | `backend/src/controllers/wikiController.js` |
| 라우트 | `backend/src/routes/wiki.js` |
| 프론트 API | `frontend/src/api/wiki.js` |
| 화면(트리+에디터) | `frontend/src/pages/Wiki/index.jsx` |
| 리치 에디터(공용) | `frontend/src/components/RichEditor.jsx` |
| 스키마 | `WikiSpace`, `WikiDoc`, `WikiDocVersion`, `WikiDocComment` |

## 개념 구조
스페이스(WikiSpace) → 문서(WikiDoc, `parentId` 자기참조 트리) → 버전(WikiDocVersion) / 댓글(WikiDocComment)

- **스페이스**: 이름·아이콘·색상, 공개범위 `public`(전원)/`private`(작성자·관리자)
- **문서**: 제목·본문(HTML)·즐겨찾기·정렬. 소프트 삭제(`delYn`, 하위 문서 동반 삭제). 수정 권한은 접근 가능한 스페이스의 팀원
- **버전 이력**: 본문 변경 시 직전 상태 자동 스냅샷(최근 50건). 복원 시 현재본도 버전으로 보존 후 복원
- **댓글**: 문서별 댓글, 소프트 삭제, 작성자·관리자만 삭제

## 접근 제어(MVP)
스페이스 공개범위 기준 — `public`은 전원, `private`은 작성자·관리자. `wikiController.canAccessSpace`.

## API (마운트 `/api/wiki`, 인증 필요)

| 구분 | 엔드포인트 |
|------|-----------|
| 스페이스 | `GET/POST /api/wiki/spaces`, `PUT/DELETE /api/wiki/spaces/:id` |
| 문서 | `POST /api/wiki/docs`, `GET/PUT/DELETE /api/wiki/docs/:id` |
| 버전 | `GET /api/wiki/docs/:id/versions`, `POST /api/wiki/docs/:id/versions/:vid/restore` |
| 댓글 | `GET/POST /api/wiki/docs/:id/comments`, `DELETE /api/wiki/docs/comments/:cid` |

## 화면
`/wiki` — 좌측 스페이스·문서 트리 사이드바 + 우측 문서 뷰/편집(제목·RichEditor·댓글) + 변경 이력 드로어.
사이드바 '위키' 메뉴(협업 그룹, `ReadOutlined`). 문서 선택은 `?doc=<id>` 쿼리로 딥링크.

## 미구현(후속 확장 후보)
부서/팀 단위 세밀 권한, 블록 단위 인라인 코멘트, 실시간 공동 편집, 문서 간 `[[링크]]`·전역검색 색인.
기획: `docs/제안기능_기획서.md` F-59
