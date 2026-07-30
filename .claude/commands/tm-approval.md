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
| 라우트 | `backend/src/routes/approvals.js` (마운트 `/`) |
| 스키마 | `backend/prisma/schema.prisma` (ApprovalFormType/Template/Document/Step/Attachment/Comment, ApprovalDocSeq) |

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
- 첨부(ApprovalAttachment), 댓글/의견(ApprovalComment)

### 결재선 (ApprovalStep)
- 순번(stepOrder)·결재자(approverId)·유형(approval)·상태(pending/approved/rejected/skipped)
- 결재 시 **결재자 직위(User.position)·서명이미지(signImagePath)·서명 IP·대결(actingType) 스냅샷** 저장

### 워크플로 API
- 문서: `GET /api/approvals/pending-count`, `GET /api/approvals/tree`(결재종류 트리+건수), `GET/POST /api/approvals`(`templateId`/`formTypeId` 필터), `GET/PUT/DELETE /api/approvals/:id`
- 액션: `POST /api/approvals/:id/{submit,approve,reject,cancel,resubmit,resume}`
  - `submit` 상신 · `approve` 승인 · `reject` 반려 · `cancel` 취소 · `resubmit` 재상신 · `resume` 반려 후 재개
- 첨부: `POST /api/approvals/:id/attachments`, `GET .../attachments/:aid/download`, `DELETE .../attachments/:aid`
- 댓글: `GET/POST /api/approvals/:id/comments`, `PUT/DELETE /api/approvals/:id/comments/:cid`

## 화면 경로
- `/approvals` 문서함 · `/approvals/new` 작성 · `/approvals/:id` 상세 · `/approvals/:id/edit` 수정 · `admin/approval` 양식 관리
