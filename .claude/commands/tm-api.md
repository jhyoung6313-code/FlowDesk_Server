# tm-api — REST API 인덱스

단일 진실 원천: `backend/src/routes/index.js`(마운트) + 각 `routes/*.js`. 도메인별 인덱스.

## 마운트 (routes/index.js)
| prefix | 파일 |
|--------|------|
| `/api/auth` | auth.js |
| `/api/users` | users.js |
| `/api/departments`, `/api/teams` | departments.js, teams.js |
| `/api/tasks` | tasks.js |
| `/api/notifications` | notifications.js |
| `/api/calendar-notes` | calendarNotes.js |
| `/api/schedules`, `/api/holidays` | schedules.js, holidays.js |
| `/api/memos` | memos.js |
| `/api/wbs` | wbs.js |
| `/api/recurring-tasks`, `/api/templates`, `/api/milestones`, `/api/tags` | 각 라우트 |
| `/api/settings`, `/api/time-entries` | settings.js, timeTracking.js |
| `/api/admin` | backup.js + admin.js |
| `/api/ledger`, `/api/chat` | ledger.js, chat.js |
| `/api/board-categories`, `/api/boards` | boardCategories.js, boards.js |
| `/api/playbooks`, `/api/runs` | playbooks.js, runs.js |
| `/api/pii-blocks` | piiBlocks.js (권한 PII_AUDIT) |
| `/` (내부 경로) | bbs.js, approvals.js |
| `/api/mail` | mail.js |
| `/api/search` | searchController.search (F-49) |
| `/api/webhooks/trigger/:token` | webhookController (인증 불필요) |

## 주요 엔드포인트 (도메인별)
- **인증**: `POST /api/auth/login`, `/otp/*`, `/reset-password/*`, `PUT /api/auth/idle-timeout`, `POST /api/auth/verify-password`, `POST /api/auth/logout` — [tm-auth]
- **업무**: `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`, `PATCH /api/tasks/:id/status`, `POST /api/tasks/bulk`, `/calendar`, `/gantt`, `/export` — [tm-core]
- **협업**: `/api/tasks/:id/{comments,history,attachments}`, `/api/time-entries` — [tm-collab]
- **전자결재**: `/api/approval-types`, `/api/approval-templates`, `/api/approvals/*` — [tm-approval]
- **게시판**: `/api/bbs-categories`, `/api/bbs/*` — [tm-bbs]
- **메일**: `/api/mail/*` — [tm-mail]
- **일정/공휴일**: `/api/schedules(/resources)`, `/api/holidays` — [tm-schedule]
- **보드**: `/api/boards/*`, `/api/board-categories/*` — [tm-board]
- **플레이북**: `/api/playbooks/*`, `/api/runs/*` — [tm-playbook]
- **채팅**: `/api/chat/rooms/*` — [tm-chat]
- **가계부**: `/api/ledger/{entries,categories,budgets,recurrings}` — [tm-ledger]
- **관리자**: `/api/admin/{activity-log,audit-log,backup/*}` — [tm-system]·[tm-auth]
- **PII 감사**: `GET /api/pii-blocks` — [tm-security]
- **AI 어시스턴트**: `/api/ai/{status,tasks/generate,summary}` — [tm-ai]
- **위키**: `/api/wiki/{spaces,docs}/*` — [tm-wiki]
- **회의**: `/api/meetings/*` (rsvp·ai-summary·decisions·action-items·to-task) — [tm-meeting]
- **OKR**: `/api/okr/{cycles,tree,objectives,key-results}/*` — [tm-okr]

## 응답 규약
- 에러(4xx/5xx): `{ error: '...' }` / 성공 메시지: `{ message }`
- 컨트롤러는 `next(err)` 패턴
