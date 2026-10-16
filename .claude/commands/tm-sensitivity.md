# tm-sensitivity — 민감도 라벨 · 기밀 접근 게이트 (F-67)

문서·게시글에 민감도 라벨(public 공개 / internal 사내한 / confidential 기밀)을 부여. M365 Purview 민감도 라벨 경량판. 기존 접근제어를 재작성하지 않는 순수 추가(additive) 설계 — `sensitivity` 컬럼 기본값 `public`으로 기존 동작 무변경.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 위키 게이트 | `backend/src/controllers/wikiController.js` (`canAccessSpace`/`canSeeSensitive`) |
| 게시판 게이트 | `backend/src/controllers/bbsPostController.js` |
| 화면(라벨 배지/선택) | `frontend/src/components/common/SensitivityTag.jsx`, `pages/Wiki/index.jsx`, `pages/BBS/PostFormDrawer.jsx`·`PostDetail.jsx` |
| 스키마 | `WikiDoc.sensitivity`, `BbsPost.sensitivity` (둘 다 `@default("public")`) |

## 적용 대상
위키 문서(WikiDoc), 게시글(BbsPost)에 `sensitivity` 필드.

## 기밀 게이트 규칙
`confidential` 항목은 **작성자·관리자만** 열람. 각 도메인이 독립적으로(공유 헬퍼 없이) 아래 규칙을 구현하고 있음 — **이 규칙과 정확히 같은 조건**을 다른 도메인에서도 쓰고 있으므로, 하나를 바꾸면 전부 함께 바꿔야 한다:

- 위키: `canAccessSpace`(비공개 스페이스 게이트) + `canSeeSensitive`(기밀 게이트) — `loadAccessibleDoc`에서 둘 다 검사. `listSpaces`의 문서 트리에서도 기밀 제외.
- 게시판: 상세(`get`)에서 403 + 목록(`list`) where에 `{ OR: [{ NOT: { sensitivity: 'confidential' } }, { createdBy: uid }] }` 필터(관리자는 전체).
- **이 규칙을 재사용/재구현하는 다른 소비처**: `searchController.js`(전역검색), `documentController.js`(통합 문서함), `ragService.js`(AI 질의응답, [tm-ai-search]) — 신규 소비처를 추가할 때마다 이 필터를 빠뜨리기 쉽다. 과거 리뷰에서 `ragService.js`가 이 게이트를 완전히 빠뜨려 기밀 콘텐츠가 AI 답변에 노출된 사고가 있었다(`CODE_REVIEW_VERIFY.sql` §2로 회귀 확인 가능).
- **`/collab` 웹소켓(F-69, [tm-collab-edit])도 이 게이트를 통과해야 한다** — REST API에서 403인 위키 문서는 실시간 공동편집 접속도 거부해야 하며, `backend/src/collabServer.js`의 `canJoinRoom()`이 이 규칙을 다시 구현하고 있다.

## API
기존 위키/게시판 create·update에 `sensitivity` 필드 수용(위키 `POST/PUT /api/wiki/docs`, 게시판 `POST/PUT /api/bbs`).

## 화면
게시글 작성 폼·위키 문서 편집 헤더에 민감도 Select, 상세/헤더에 배지(🔒 기밀 / 🏢 사내한).

## 미구현(후속 확장 후보)
전면 부서/팀 스코프 RBAC(현재는 라벨 게이트만), 결재/보드/업무로 라벨 확대, 라벨별 다운로드·복사 제어, DLP([tm-security]) 연계. sensitivity 게이트 로직을 공유 헬퍼(`sensitivityGate.js` 등)로 통합하는 것도 후속 과제(현재 5곳 이상 개별 구현 — `CODE_REVIEW_m365-gap-features.md` 부록 A 참조).
