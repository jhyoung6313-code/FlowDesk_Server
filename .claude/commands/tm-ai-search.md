# tm-ai-search — AI 질의응답(RAG) · 채팅/스레드 요약 (F-63)

자연어 질문을 사내 데이터(업무·위키·회의록·게시판·보드카드·내 메모)에서 검색해 Claude가 근거를 인용하며 답변(RAG-lite). 별도 임베딩/벡터DB 없이 키워드 검색으로 컨텍스트를 모아 LLM에 전달.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 컨텍스트 수집(검색·게이트) | `backend/src/services/ragService.js` |
| 답변 생성(Claude 호출) | `backend/src/services/aiService.js` (answerFromContext·summarizeChat) |
| 컨트롤러 | `backend/src/controllers/aiController.js` |
| 라우트 | `backend/src/routes/ai.js` |
| 프론트 API | `frontend/src/api/ai.js` |
| 화면 | `frontend/src/components/ai/AiAsk.jsx` (대시보드 헤더 진입) |

## 개념 구조
`gatherContexts({ userId, question, isAdmin })`가 업무·메모·보드카드·위키·회의·게시판 6개 소스에서 키워드 매칭 스니펫을 모음 → `aiService.answerFromContext`가 "제공된 컨텍스트만 근거로, 없으면 모른다"는 프롬프트로 답변 생성 + `[번호]` 인용.

- **환각 방지**: 근거 0건이면 LLM 호출 없이 "관련 정보를 찾지 못했습니다" 반환.
- **접근제어(가장 중요 — 회귀 위험 지점)**: `gatherContexts`는 각 도메인의 컨트롤러 게이트와 **동일한 규칙**을 자체적으로 다시 구현해서 걸어야 한다.
  - 메모: 본인 작성만.
  - 위키: 공개 스페이스 OR 본인작성 **AND** [tm-sensitivity]의 confidential 게이트(비관리자는 본인작성 아니면 제외).
  - 게시판: [tm-sensitivity]의 confidential 게이트(`bbsPostController`/`searchController`와 동일한 `{ OR: [{ NOT: confidential }, { createdBy }] }`).
  - 보드카드: 보드 멤버십(`board.members.some({ userId })`), 관리자는 예외.
  - 회의: 주최자/참석자만.
  - **주의**: 이 파일은 신규 소스를 추가할 때마다 게이트를 깜빡하기 가장 쉬운 지점이다(과거 리뷰에서 bbs/wiki/board 게이트가 통째로 빠져 기밀 콘텐츠가 AI 답변에 그대로 노출된 사고가 있었음, `CODE_REVIEW_VERIFY.sql` §2로 회귀 확인). 새 소스 추가 시 반드시 해당 도메인 컨트롤러의 실제 where절을 그대로 복사해 올 것.
- **PII·감사**: 요청 본문은 전역 `piiGuard`([tm-security])가 사전 스캔.
- **채팅 요약**: 본인이 속한 방의 최근 200개 메시지를 핵심요약·주요논의·후속할일로 요약.

## API (마운트 `/api/ai`, 인증 필요)

| 구분 | 엔드포인트 |
|------|-----------|
| 질의응답 | `POST /api/ai/ask` — `{ question }` → `{ answer, sources: [{ n, source, title, path }] }` |
| 채팅 요약 | `POST /api/ai/chat-summary` — `{ roomId }` → `{ summary }` |
| 설정 여부 | `GET /api/ai/status` |

## 화면
대시보드 업무 보드 헤더 "AI에게 질문" 버튼 → 질의응답 모달. AI 키 미설정 시 버튼 자동 숨김.

## 미구현(후속 확장 후보)
진짜 벡터 임베딩(pgvector/Voyage), 결재/메일 초안 보조, 채팅 페이지 요약 버튼 연결, 전문검색(tsvector) 색인.
