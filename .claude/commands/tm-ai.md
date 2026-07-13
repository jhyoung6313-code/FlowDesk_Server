# tm-ai — AI 어시스턴트 (F-58)

Anthropic Claude API를 백엔드에서 호출해 축적 데이터를 활용하는 AI 기능.
**업무 자동 생성 · 주간 요약 · 회의록 요약**. API 키는 `backend/.env`(`ANTHROPIC_API_KEY`) 전용 —
클라이언트 미노출(백엔드 프록시). 키 미설정 시 자동 비활성화(프론트 버튼 숨김).

## 관련 파일

| 구분 | 경로 |
|------|------|
| AI 서비스(Anthropic SDK 래퍼) | `backend/src/services/aiService.js` |
| AI 컨트롤러 | `backend/src/controllers/aiController.js` |
| AI 라우트 | `backend/src/routes/ai.js` |
| 프론트 API | `frontend/src/api/ai.js` |
| 업무 생성 모달 | `frontend/src/components/ai/AiTaskGenerator.jsx` |
| 주간 요약(버튼+모달) | `frontend/src/components/ai/AiWeeklySummary.jsx` |
| 마크다운 경량 렌더러(공용) | `frontend/src/components/ai/MarkdownLite.jsx` |
| 스키마 | `AiUsageLog` (ai_usage_logs) |
| 환경변수 | `ANTHROPIC_API_KEY`, `AI_MODEL`(기본 `claude-opus-4-8`) |

## 기능

### 업무 자동 생성 (task_gen)
- 자연어 요청 → 실행 가능한 업무 초안 배열(제목·설명·우선순위·기한·담당자 후보)
- 구조화 출력(`output_config.format` json_schema), 어댑티브 씽킹
- 담당자는 이름 **정확 일치**로 후보만 제시(자동 배정 금지) — 사용자가 검토·수정 후 [tm-core] 업무 생성 API로 등록
- 진입: 업무 관리(S-03) 헤더 "AI 업무 생성" 버튼

### 주간 요약 (weekly_summary)
- 최근 7일 갱신·마감 업무 집계 → 마크다운 리포트(핵심요약·완료·진행중·지연·제언)
- 스코프 `me`(본인) / `all`(관리자 전용, 팀 전체)
- 진입: 대시보드(S-02) 업무 보드 헤더 "AI 주간 요약" 버튼

### 회의록 요약 (meeting_summary) — [tm-meeting] 연계
- 회의의 안건·회의록·결정사항·액션아이템 → 요약(마크다운)
- `aiService.summarizeMeeting`, `POST /api/meetings/:id/ai-summary`로 호출되어 `meetings.summary`에 저장
- 진입: 회의 상세의 "AI 요약" 버튼

## API (마운트 `/api/ai`, 인증 필요)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/ai/status` | AI 설정 여부·모델 (`{enabled, model}`) — 프론트 버튼 노출 제어 |
| POST | `/api/ai/tasks/generate` | `{prompt}` → `{tasks:[...]}` |
| POST | `/api/ai/summary` | `{scope, from?, to?}` → `{summary, stats, period}` |

> 회의록 요약 엔드포인트는 [tm-meeting]의 `POST /api/meetings/:id/ai-summary`.

## 보안 · 운영

- **PII 보호([tm-security] F-56 연계)**: AI 요청 본문은 전역 `piiGuard` 미들웨어가 사전 스캔·차단
- **감사로그([tm-auth] F-48 연계)**: 모든 호출을 `AUDIT_ACTION.AI_REQUEST`로 적재
- **사용량**: `AiUsageLog`에 모델·토큰수·성공여부 집계 적재 (프롬프트 원문 미저장)
- **모델**: `claude-opus-4-8` 기본, `.env`의 `AI_MODEL`로 조정. 프론트 axios는 AI 호출에 90초 타임아웃 사용

## 미구현(후속 확장 후보)
채팅 요약, 시맨틱 검색(Ctrl+K [tm-*] 확장), 결재·메일 초안 보조. 기획: `docs/제안기능_기획서.md` F-58
