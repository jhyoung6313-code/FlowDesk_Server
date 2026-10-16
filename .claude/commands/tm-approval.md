# tm-approval — 전자결재 (F-52)

결재양식종류 → 결재양식 → 결재문서 → 결재선의 4계층 워크플로 시스템.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 문서함/상세/작성 페이지 | `frontend/src/pages/Approval/{index,DocumentDetail,DocumentForm}.jsx` |
| 양식·양식종류 관리(Admin) | `frontend/src/pages/Admin/ApprovalAdmin.jsx` |
| Approval API 함수 | `frontend/src/api/approval.js` |
| 문서 컨트롤러 | `backend/src/controllers/approvalController.js` |
| 양식 컨트롤러 | `backend/src/controllers/approvalTemplateController.js` |
| 양식종류 컨트롤러 | `backend/src/controllers/approvalFormTypeController.js` |
| 결재선 해석 서비스 | `backend/src/services/approvalLine.js` |
| 결재자 그룹 컨트롤러 | `backend/src/controllers/approvalApproverGroupController.js` |
| 결재선 공용 편집기(관리자) | `frontend/src/pages/Admin/ApprovalLineEditor.jsx` |
| 결재선 유틸(그룹화·압축) | `frontend/src/utils/approvalLine.js` |
| 자동위임 설정 UI | `frontend/src/pages/Profile/sections.jsx` (`ApprovalAutoDelegateSection`) |
| 알림/이메일/다이제스트 | `backend/src/services/notificationService.js`, `emailService.js` |
| 라우트 | `backend/src/routes/approvals.js` (마운트 `/`) |
| 스키마 | `backend/prisma/schema.prisma` (ApprovalFormType/Template/Document/Step/Attachment/Comment/ApproverGroup, ApprovalDocSeq) |

## 개념 구조

```
ApprovalFormType (양식종류, 트리)     예: 인사 > 휴가
   └─ ApprovalTemplate (양식)         입력필드(fieldsJson) + 기본결재선(lineJson) + 문서코드(code)
        └─ ApprovalDocument (문서)    상태·문서번호·진행단계
             └─ ApprovalStep (결재선) 순번·결재자·상태·서명 스냅샷
```

## F-52 상세

### 결재양식종류 (ApprovalFormType)
- 아이콘·색상·정렬·계층(parentId) 분류. 관리자 CRUD·순서변경
- API: `GET/POST /api/approval-types`, `PUT /api/approval-types/reorder`, `PUT/DELETE /api/approval-types/:id`

### 결재양식 (ApprovalTemplate)
- 동적 입력필드 정의(`fieldsJson`), 기본 결재선(`lineJson`), 문서번호 코드(`code`, 기본 `DOC`)
- 결재선 자동 해석: `services/approvalLine.js`가 lineJson을 실제 결재자로 치환
- API: `GET /api/approval-templates(/:id)`, `POST/PUT/DELETE /api/approval-templates(/:id)`, `GET/POST /api/approval-templates/:id/resolve-line`

### 결재문서 (ApprovalDocument)
- 상태: `draft` → `pending`(상신) → `approved`/`rejected`/`cancelled`
- `currentStep`/`totalSteps` 진행 추적, 소프트 삭제(`delYn`)
- 자동 문서번호(`docNo`): `ApprovalDocSeq`가 **양식코드+연도별** 시퀀스 채번
- 첨부(ApprovalAttachment — 문서 전체 또는 `commentId`로 특정 의견에 연결), 댓글/의견(ApprovalComment)
- `fieldsJsonSnap`: **상신 시점**의 양식 필드 구조를 고정 저장 — 이후 관리자가 템플릿 필드를 바꿔도 이미 제출된 문서는 당시 모습 그대로 표시(상세화면은 이 스냅샷을 우선, 없으면 템플릿 실시간 조회로 폴백)
- `groupPolicyJson`: 병렬결재 차수별 완료조건 — `{"<stepOrder>":{"mode":"all"|"any"|"quorum","n"?}}`, 미지정 차수는 `all`(전원 동의, 기존 동작과 동일)
- `rejectReasonCategory`: 반려 사유 분류(단가초과/서류미비/중복신청/정책위반/내용오류/기타) — 자유 텍스트 코멘트와 별개로 통계 집계용

### 결재선 (ApprovalStep)
- 순번(stepOrder)·결재자(approverId)·유형(approval/agreement/delegation/reference)·상태(pending/approved/rejected/skipped)
- 결재 시 **결재자 직위(User.position)·서명이미지(signImagePath)·서명 IP·대결(actingType) 스냅샷** 저장. `actingType`은 `resolveActingType()`가 결정 — `delegate()`/`applyAutoDelegation()`이 미리 남긴 `'위임'`/`'휴가 자동위임'` 마커가 있으면 최종 승인/반려 시에도 `'본인'`으로 덮어쓰지 않고 보존(위임 이력 추적용)
- 상신 후에도 `POST /:id/steps`(참조는 언제나, 승인/합의/전결은 아직 지나지 않은 미래 차수에만)로 추가, `DELETE /:id/steps/:stepId`로 제거 가능(`approvalController.applyAutoDelegation`과 연동) — 추가/제거는 `ApprovalDocumentHistory`(`TaskHistory`와 동일 모양)에 원자적으로 기록되어 상세화면 결재 라인 하단에 타임라인으로 노출

### 결재자 그룹 (ApprovalApproverGroup)
- 재사용 가능한 사용자 묶음("구매팀 전체" 등). `memberIds Int[]`. 결재선(`lineJson`)에 `{stepOrder,type,group:groupId}`로 삽입하면 상신 시점에 현재 멤버 전원으로 확장(같은 차수=병렬) — `services/approvalLine.js`의 `resolvePresetLine`이 처리
- API: `GET /api/approval-approver-groups`(전원 열람), `POST/PUT/DELETE /api/approval-approver-groups(/:id)`(admin)
- 관리 UI: `admin/approval` → "결재자 그룹" 탭

### 병렬결재 완료조건 & 휴가 자동위임
- 완료조건: DocumentForm의 결재선 편집기에서 병렬 그룹마다 전원 동의/임의 1인/과반수(n) 선택 — `approvalController.approve()`가 `groupPolicyJson`을 읽어 그룹 완료 여부 판정, 충족 시 나머지 pending 단계는 `skipped` 처리. 그룹 구성(병합/분리/추가/삭제/역할변경)이 바뀌면 프론트가 완료조건을 안전한 기본값으로 리셋(반대로 순서만 바꾸는 이동은 조건을 함께 유지)
- 휴가 자동위임: 결재자가 F-55 일정에 `type='vacation'`으로 등록된 기간에 새로 차례가 되면, 본인(`내 프로필` → "결재 자동위임")이 사전 지정한 대상에게 자동으로 넘김(`applyAutoDelegation`). 설정: `GET/PUT /api/settings/approval-auto-delegate`

### 워크플로 API
- 문서: `GET /api/approvals/pending-count`, `GET /api/approvals/tree`(결재종류 트리+건수), `GET /api/approvals/stats?from=&to=`(admin, 양식별·결재자별·반려사유별 현황 + 기간 필터), `GET /api/approvals/reject-categories`, `GET/POST /api/approvals`(`templateId`/`formTypeId` 필터), `GET/PUT/DELETE /api/approvals/:id`
- 액션: `POST /api/approvals/:id/{submit,approve,reject,cancel,resubmit,resume}`
  - `submit` 상신 · `approve` 승인 · `reject` 반려(`category` 선택) · `cancel` 취소 · `resubmit` 재상신 · `resume` 반려 후 재개
- 상신 후 결재자 추가/제거: `POST /api/approvals/:id/steps`, `DELETE /api/approvals/:id/steps/:stepId`
- 자유 양식(제목+본문만, 관리자가 양식 없이도 즉시 상신): `GET /api/approval-templates/freeform`(최초 호출 시 1회 자동 생성)
- 첨부: `POST /api/approvals/:id/attachments`(`commentId` 선택 — 의견에 연결), `GET .../attachments/:aid/download`, `DELETE .../attachments/:aid`
- 댓글: `GET/POST /api/approvals/:id/comments`(`@표시이름` 멘션 시 알림+이메일), `PUT/DELETE /api/approvals/:id/comments/:cid`
- 결재선 프리셋: `GET/PUT /api/settings/approval-lines`(개인) / `.../approval-lines/shared`(팀 공유, 전원 추가·사용 가능)

## 알림/이메일
- 결재 요청·지연 리마인더(`approval_requested`)·멘션(`mention`)은 인앱(SSE) + 이메일(`sendGenericEmail`, username을 이메일로 사용) 동시 발송
- 매일 08:50 "오늘의 결재 요약" 일일 다이제스트(`checkApprovalDailyDigest`), 09:05 지연·정체 리마인더(기한초과 시 기안자에게도 별도 알림)
- 이메일만 개인별로 끌 수 있음(`services/emailPreference.js`, `GET/PUT /api/settings/email-opt-out`) — 인앱 알림은 이 설정과 무관하게 항상 발송

## 화면 경로
- `/approvals` 문서함(결재종류 트리 + "빠른 결재"/"결재 요청") · `/approvals/:id` 상세(결재선 변경이력 타임라인 포함) · `admin/approval` 양식·결재자그룹·결재현황(기간필터) 관리 · `내 프로필` 자동위임·이메일 수신 설정
