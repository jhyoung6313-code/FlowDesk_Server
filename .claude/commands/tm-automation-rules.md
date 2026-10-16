# tm-automation-rules — 범용 자동화 규칙 엔진 (F-62)

전역 이벤트(업무·결재·게시판·OKR·회의 등)가 발생하면 조건을 평가해 액션(알림·이메일·채팅·아웃바운드 웹훅·업무 자동생성)을 실행. M365 Power Automate 경량판.
설계 원칙: 기존 모델 무손상 순수 추가(additive) / `emit()`은 fire-and-forget으로 호출자에 예외 전파 없음 / 기존 서비스(notificationService/emailService/linkedRoomService) 재사용.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 엔진(조건평가·액션실행·emit/fire) | `backend/src/services/automationService.js` |
| 컨트롤러(CRUD·테스트실행) | `backend/src/controllers/automationController.js` |
| 라우트 | `backend/src/routes/automations.js` |
| 프론트 API | `frontend/src/api/automation.js` |
| 화면 | `frontend/src/pages/Admin/Automations.jsx` |
| 스키마 | `AutomationRule`, `AutomationLog` |

## 개념 구조
규칙(AutomationRule: 이벤트·조건 JSON·액션 JSON·활성여부) → `emit(event, ctx)`가 매칭 규칙을 병렬로 평가 → 조건 통과 시 액션들을 병렬 실행 → 실행 로그(AutomationLog) 적재 + `runCount`/`lastRunAt`/`lastError` 갱신.

- **이벤트 카탈로그**: `task.created`/`task.status_changed`(taskController에서 발화) · `approval.approved`/`approval.rejected`(approvalController.approve/reject) · `bbs.post_created`(bbsPostController.create) · `okr.at_risk`(okrController.updateObjective, 상태가 새로 at_risk로 바뀔 때만) · `meeting.finished`(meetingController.update, 상태가 새로 done으로 바뀔 때만).
- **조건 연산자**: `eq/ne/in/nin/contains/gt/lt/changed_to/is_empty/not_empty`, AND 결합.
- **액션**: `notify`(알림+SSE) · `email`(sendGenericEmail) · `chat`(linkedRoomService) · `webhook`(fetch, 8초 타임아웃) · `create_task`. 설정값에 `{{field}}` 템플릿 치환.
- **테스트 실행**(`POST /api/automations/:id/test`): `emit(event, ctx, { onlyRuleId: rule.id })`로 **해당 규칙만** 평가/실행 — 같은 이벤트를 쓰는 다른 활성 규칙은 건드리지 않는다(이전에는 같은 이벤트의 모든 활성 규칙이 함께 실행되던 버그가 있었음).

## API (마운트 `/api/automations`, 인증 필요 · 쓰기는 관리자)

| 구분 | 엔드포인트 |
|------|-----------|
| 카탈로그 | `GET /api/automations/catalog` |
| CRUD | `GET/POST /api/automations`, `GET/PUT/DELETE /api/automations/:id` |
| 테스트 실행 | `POST /api/automations/:id/test` |

## 화면
`/admin/automations`(관리자 전용) — 규칙 목록·조건/액션 동적 빌더·테스트 실행·실행 로그 드로어.

## 새 이벤트를 추가할 때
1. `automationService.js`의 `EVENT_CATALOG`에 항목 추가.
2. 실제 발생 지점 컨트롤러에 `automation.fire('이벤트명', { ...EVENT_CATALOG의 fields에 맞는 값, link, actorId })` 호출 추가.
   **카탈로그에만 추가하고 fire() 호출을 빠뜨리면 "저장은 되지만 영원히 실행되지 않는 규칙"이 생긴다** — 반드시 둘 다 함께 반영할 것(과거 리뷰에서 실제로 발생했던 결함, `CODE_REVIEW_VERIFY.sql` §3/§H1로 회귀 여부 확인 가능).

## 미구현(후속 확장 후보)
스케줄 트리거(cron), 인바운드 웹훅 통합, `AutomationRule` 삭제 시 소프트 삭제 전환(현재 하드 삭제 — `AutomationLog` 고아 레코드 발생 가능, `CODE_REVIEW_VERIFY.sql` §12로 확인).
