# tm-db — DB 스키마 인덱스

단일 진실 원천: `backend/prisma/schema.prisma`. 아래는 도메인별 모델 인덱스(전체 목록은 스키마 파일 참조).

## 조직·인증
- `User`(role, permissions[], sessionNonce, position, signImagePath, idleTimeoutMin, department_id, team_id)
- `Department`, `Team`(부서 종속) — 구 parts 대체
- `AuditLog`(접속기록/보안 감사, append-only), `PasswordHistory`, `PiiBlockLog`(마스킹본만)

## 업무
- `Task`(del_yn 소프트삭제), `TaskAssignee`, `TaskExtraAssignee`, `TaskDependency`
- `TaskComment`, `TaskAttachment`, `TaskHistory`, `TaskTag`, `Tag`
- `TimeEntry`, `Notification`(task_id NOT NULL), `RecurringTask`(assignee_ids_json), `TaskTemplate`(assignee_ids_json)
- `Milestone`, `CalendarNote`, `Memo`

## 일정·공휴일 (F-55)
- `ScheduleResource`(room/vehicle), `ScheduleEvent`, `ScheduleEventAssignee`, `Holiday`

## WBS (F-13·14)
- `WbsProject`, `WbsProjectMember`(users 비참조), `WbsTask`(parentId 트리), `WbsIssue`

## 가계부 (F-45)
- `LedgerCategory`, `LedgerEntry`, `LedgerBudget`, `LedgerRecurring`

## 채팅 (F-38·39)
- `ChatRoom`, `ChatRoomMember`, `ChatMessage`(parentId 스레드), `ChatMessageReaction`, `ChatSavedMessage`, `ChatPinnedMessage`, `ScheduledChatMessage`

## 보드 (F-34·35)
- `Board`, `BoardCategory`, `BoardView`, `BoardMember`, `BoardProperty`, `BoardCard`, `BoardPropertyValue`, `BoardCardAssignee`, `BoardCardLink`, `BoardCardComment`, `BoardCardAttachment`, `BoardCardChecklist`, `BoardCardDependency`, `BoardAutomation`

## 플레이북 (F-36·37)
- `Playbook`, `PlaybookPhase`, `PlaybookStep`, `PlaybookRun`, `RunStep`, `RunParticipant`, `RunUpdate`, `RunTimeline`, `RunStepChecklist`, `PlaybookReadState`, `PlaybookVersion`, `PlaybookWebhook`, `PlaybookSchedule`

## 게시판 (F-53)
- `BbsCategory`, `UserDashboardBbsCategory`, `BbsPost`(공문 필드), `BbsComment`, `BbsAttachment`

## 전자결재 (F-52)
- `ApprovalFormType`(트리), `ApprovalTemplate`, `ApprovalDocument`, `ApprovalDocSeq`(채번), `ApprovalStep`, `ApprovalAttachment`, `ApprovalComment`
- enum `ApprovalStatus`(draft/pending/approved/rejected/cancelled), `ApprovalStepStatus`(pending/approved/rejected/skipped)

## 사내 메일 (F-54)
- `InternalMail`, `InternalMailRecipient`(수신자별 상태), `InternalMailLabel`, `InternalMailLabelLink`, `InternalMailComment`, `InternalMailAttachment`

## AI 어시스턴트 (F-58) — [tm-ai]
- `AiUsageLog`(ai_usage_logs, 사용량/비용 append-only, 프롬프트 원문 미저장)

## 협업 위키/문서 (F-59) — [tm-wiki]
- `WikiSpace`, `WikiDoc`(계층 트리 parentId), `WikiDocVersion`(버전), `WikiDocComment`

## 회의 관리 (F-61) — [tm-meeting]
- `Meeting`(회의록 HTML·요약), `MeetingAgenda`, `MeetingAttendee`(RSVP), `MeetingDecision`, `MeetingActionItem`(taskId 업무 연결)

## OKR/목표 관리 (F-60) — [tm-okr]
- `OkrCycle`, `Objective`(범위·진척), `KeyResult`(측정유형·autoProgress), `KeyResultLink`(업무 연결), `KeyResultCheckin`

## 기타
- `AppSetting`(key-value)

## 관례
- 소프트 삭제: `del_yn` Char(1) → Prisma `delYn`
- PrismaClient 싱글턴: `backend/src/lib/prisma`
