# tm-screens — 화면 목록 및 라우트

프론트 라우트는 `frontend/src/App.jsx`가 단일 진실 원천. 아래는 요약 인덱스.

## 일반 사용자 화면 (`/` 레이아웃 하위)

| 경로 | 페이지 | 기능(Skill) |
|------|--------|------|
| `/` | Dashboard | 대시보드 (F-16, [tm-views]) |
| `/tasks` | Tasks | 업무 목록/칸반/캘린더 (F-02~F-07, [tm-core]) |
| `/calendar` | Calendar | 캘린더 (F-08) |
| `/gantt` | Gantt | 간트 (F-09) |
| `/kanban` | → `/tasks?view=kanban` | 칸반 (F-12) |
| `/memos` | Memos | 개인 메모지 (F-47) |
| `/notifications` | Notifications | 알림 (F-10, [tm-automation]) |
| `/workload` | Workload | 워크로드 밸런싱 (F-51) |
| `/profile` | Profile | 프로필·비밀번호·화면잠금 (F-15, [tm-auth]) |
| `/wbs`, `/wbs/:projectId` | WbsWorkspace | WBS (F-13·14, [tm-wbs]) |
| `/ledger` | Ledger | 가계부 (F-45, [tm-ledger]) |
| `/chat` | Chat | 채팅 (F-38·39, [tm-chat]) |
| `/boards`, `/boards/:id` | BoardWorkspace | 보드 (F-34·35, [tm-board]) |
| `/playbooks(/*)` | Playbook | 플레이북 정의 (F-36, [tm-playbook]) |
| `/runs`, `/runs/:id` | PlaybookRun | 런 실행 (F-37) |
| `/bbs` | BBS | 게시판 (F-53, [tm-bbs]) |
| `/approvals(/*)` | Approval | 전자결재 (F-52, [tm-approval]) |
| `/mail` | Mail | 사내 메일 (F-54, [tm-mail]) |
| `/chat-popup` | ChatPopup | 채팅/메일 팝업 |

## 관리자 화면 (`admin/*`, PrivateRoute adminOnly)

| 경로 | 페이지 |
|------|--------|
| `admin` | AdminConsole |
| `admin/system` | SystemSettings |
| `admin/users` | Users (F-22) |
| `admin/departments` | Departments (F-40) |
| `admin/recurring-tasks` | RecurringTasks (F-24) |
| `admin/tags` | Tags (F-29) |
| `admin/milestones` | Milestones (F-21) |
| `admin/email-settings` | EmailSettings (F-25) |
| `admin/templates` | Templates (F-41) |
| `admin/backup` | Backup (F-44) |
| `admin/activity-log` | ActivityLog (F-42) |
| `admin/audit-log` | AuditLog (F-48) |
| `admin/approval` | ApprovalAdmin (F-52) |
| `pii-audit` | PiiBlockLog (F-56, 권한 `PII_AUDIT`) |
| `/wiki` | Wiki (F-59, 스페이스·문서 트리+에디터) — [tm-wiki] |
| `/meetings` | Meetings (F-61, 목록+상세) — [tm-meeting] |
| `/okr` | Okr (F-60, 주기·목표·KR) — [tm-okr] |
| `/login` | Login (F-01·11) |

> AI 어시스턴트(F-58, [tm-ai])는 전용 화면 없이 업무관리(S-03)·대시보드(S-02)·회의(F-61) 화면에 버튼/모달로 임베드.
