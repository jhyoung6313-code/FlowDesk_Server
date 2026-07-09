# 전자결재 개편 설계안 v2

> 상용 그룹웨어(더존/다우오피스/네이버웍스 등) 전자결재 대비 격차를 좁히기 위한 개편.
> 소규모 팀(2~10명, 로컬 전용) 규모에 맞춰 "표준 관행 + 과하지 않은 선"으로 설계.

## 적용 범위 (확정)

1. 결재선 역할 확장 — 승인/합의/참조/전결(대결), 병렬 결재
2. 참조/공람(열람) 지정
3. 부분 반려 & 재상신 (반려된 단계부터 재개)
4. 문서번호 자동 채번
5. 조직도 기반 결재선 프리셋

부가 확정 사항:
- **문서번호 형식**: `{양식코드}-{연도}-{4자리 일련번호}` (예: `EXP-2026-0001`), 양식별·연도별 리셋, 상신 시점 채번, 반려/재상신 시 번호 유지
- **서명**: 텍스트(직급·이름·시각) 기본 + 사용자별 서명/도장 이미지 등록 시 이미지 표시, 승인 시점 **스냅샷** 저장

---

## A. 결재선 역할 모델

`ApprovalStep`을 "순차 승인자 목록"에서 "역할이 있는 결재 참여자"로 확장.

| type | 의미 | 문서 진행 영향 | 반려권 |
|------|------|:---:|:---:|
| `approval` | 승인(결재) | 순서대로 진행 | O |
| `agreement` | 합의/협조 | 진행하되 전원 합의 필요 | O |
| `reference` | 참조/공람(열람) | 진행에 영향 없음, 통보만 | X |
| `delegation` | 전결/대결 | 지정 단계에서 최종 확정 | O |

### 병렬 처리
`stepOrder`를 **그룹(차수) 번호**로 재해석.
- 같은 `stepOrder` = 병렬(동시 결재), 다른 `stepOrder` = 순차.
- 같은 그룹의 `approval`/`agreement`가 **모두 승인**해야 다음 그룹으로 진행.
- 그룹 내 **한 명이라도 반려**하면 문서 반려.

---

## B. 스키마 변경

```prisma
enum ApprovalStepStatus {
  pending
  approved
  rejected
  skipped        // 전결로 건너뛴 단계
}

model ApprovalStep {
  // 기존: id, documentId, stepOrder, approverId, comment, actionAt
  type              String   @default("approval")   // approval/agreement/reference/delegation
  status            ApprovalStepStatus @default(pending)
  approverNameSnap  String?  @map("approver_name_snap")  @db.VarChar(100)
  approverTitleSnap String?  @map("approver_title_snap") @db.VarChar(100)
  signImagePath     String?  @map("sign_image_path")     @db.VarChar(255)
  signedIp          String?  @map("signed_ip")           @db.VarChar(45)
  actingType        String?  @map("acting_type")         @db.VarChar(10)  // 본인/대결/전결
  // stepOrder = 그룹(차수). @@unique([documentId, stepOrder]) 제거 (병렬 전제)
}

model ApprovalDocument {
  docNo         String?  @map("doc_no") @db.VarChar(30)   // 상신 시 채번, 불변
  rejectedStep  Int?     @map("rejected_step")            // 부분 반려 지점
}

model ApprovalDocSeq {
  formCode String @map("form_code") @db.VarChar(10)
  year     Int
  seq      Int    @default(0)
  @@id([formCode, year])
  @@map("approval_doc_seq")
}

model ApprovalTemplate {
  code String @default("DOC") @db.VarChar(10)   // 채번용 양식코드
  // lineJson: 역할·병렬 포함 프리셋 결재선 정의
}

model User {
  signImagePath String? @map("sign_image_path") @db.VarChar(255)
}
```

---

## C. 진행 로직 (approve / reject)

현재 그룹(currentStep) 단위로 판정.

- **approve**: 내 step → approved + 서명 스냅샷 기록. 같은 그룹의 `approval`/`agreement` 전부 완료 시 `currentStep=다음 그룹`, 다음 그룹 결재자 알림. `reference`는 판정 제외.
- **전결(delegation)**: 승인 시 상위 잔여 `approval`을 `skipped` 처리 후 문서 `approved`.
- **reject (부분 반려)**: `rejectedStep=반려된 그룹` 저장. 재상신 시 전체 초기화가 아니라 `rejectedStep`부터 재개(이전 승인 유지).
- **참조자**: 상신 시 즉시 알림, 상태 `reference` 고정.

## D. 문서번호 채번

- 형식 `{template.code}-{YYYY}-{0001}`
- `submit` 트랜잭션 내 `ApprovalDocSeq.upsert`로 원자적 증가 → `docNo` 확정·불변
- draft엔 번호 없음, 반려/재상신 시 기존 `docNo` 유지

## E. 조직도 기반 결재선 프리셋

- `ApprovalTemplate.lineJson`에 역할·병렬 구조 프리셋 저장
- 프리셋 항목: 고정 사용자 지정 또는 동적 규칙(`{by:'position',value:'팀장'}`, `{by:'department_head'}`)
- 기안 화면 로드 시 기안자의 department/team 기준으로 실제 사용자 해석(resolve), 수정 가능
- 프리셋 없으면 기존처럼 수동 지정 폴백

## F. API 변경

| 변경 | 내용 |
|------|------|
| `POST/PUT /approvals` | steps에 `type` 수용, 병렬(동일 stepOrder) 허용 |
| `POST /approvals/:id/submit` | 채번, 참조자 알림 |
| `POST /approvals/:id/approve` | 그룹 완료 판정·전결·서명 스냅샷 |
| `POST /approvals/:id/reject` | `rejectedStep` 기록 |
| `POST /approvals/:id/resubmit` | `rejectedStep`부터 재개 |
| `GET /approvals?tab=reference` | 참조 문서함 탭 |
| `POST /users/me/signature` | 서명 이미지 업로드 (신규) |
| `GET /approval-templates/:id/resolve-line` | 프리셋 결재선 해석 (신규) |

## G. 프론트 변경

- **DocumentForm**: 결재선 편집기(역할 선택·병렬 묶기·프리셋 로드)
- **DocumentDetail**: 결재 라인 UI를 `Steps`→결재란 그리드로 교체(병렬·역할 뱃지·서명 이미지·전결/대결 라벨·docNo 표시)
- **index(목록)**: 참조 탭
- **프로필/사용자관리**: 서명 이미지 등록

## H. 마이그레이션 & 단계

- 기존 문서: `type=approval`, `docNo=NULL`(과거분 미채번 허용)
- `@@unique` 제거는 데이터 손실 없음
- **Phase 1**: 스키마 + 채번 + 서명 — ✅ 완료
- **Phase 2**: 역할(승인/합의/참조/전결) + 병렬 + 참조함 — ✅ 완료
- **Phase 3**: 부분 반려(재상신 시 rejectedStep부터 재개) + 조직도 결재선 프리셋 — ✅ 완료

## 구현 메모 (Phase 1·2)

- `stepOrder` = 그룹(차수). 같은 값 = 병렬. `reference`는 `stepOrder=0`(진행 제외).
- `approve`는 현재 그룹의 승인/합의가 전부 끝나야 다음 그룹으로 진행. `delegation`(전결)은 이후 단계를 `skipped` 처리 후 즉시 최종 승인.
- `reject`는 `rejectedStep`에 반려 그룹을 기록(Phase 3에서 부분 재상신에 사용). 현재 `resubmit`은 전체 초기화(Phase 3에서 변경 예정).
- 문서번호: `submit` 시 `ApprovalDocSeq` upsert로 원자 채번, `code`는 `ApprovalTemplate.code`(관리자 지정, 영대문자·숫자 2~10자).
- 서명: 승인/반려 시 이름·직급·서명이미지·IP를 `ApprovalStep`에 스냅샷.
- 부분 반려: `POST /approvals/:id/resume` — `rejectedStep` 이상 단계만 초기화, 이전 승인 보존, 해당 그룹부터 재개. (2차 이상 반려 시에만 노출, 1차 반려는 `resubmit` 전체 재기안)
- 프리셋 해석: `GET/POST /approval-templates/:id/resolve-line` — `lineJson` 항목이 `{approverId}`(고정) 또는 `{rule:{by:'position',value,scope:team|department|all}}`(직급 규칙). 기안자의 부서/팀 기준으로 실제 사용자 해석, 미해석 항목은 `unresolved`로 반환. 직급/직책은 사용자 프로필 또는 관리자 사용자관리에서 설정.

## 기능별 자동 결재라인 (조건부 결재선)

용도별 결재선(양식별 프리셋) 위에 **조건부 자동 결재자**를 얹는다. 감사여부·금액 등 폼 값에 따라 결재자가 자동 추가된다.

- 프리셋 `lineJson` 항목에 선택적 `condition: { field, op, value }` 추가. `op`: `truthy/eq/ne/gt/gte/lt/lte/contains`.
- 해석/평가 로직은 `backend/src/services/approvalLine.js`의 `resolvePresetLine`(공유) — 조건 없는 항목은 `base`, 조건 통과 항목은 `conditional`로 분리 반환.
- **상신 시 서버가 formData로 조건을 평가**해 통과한 `conditional` 결재자를 자동 주입(기안자가 뺄 수 없음 → 감사 통제 보장). 주입 후 첫 그룹/총 그룹 재계산.
- 관리자 양식 편집기: 프리셋 각 행에 "조건" 토글 → 필드·연산자·값 지정.
- 기안 화면: 편집 가능한 기본 결재선과 별개로 **"상신 시 자동 추가될 결재자"** 를 폼 입력에 따라 실시간 미리보기(주황 박스).
- 예: `감사여부 == 예 → 감사팀장 결재 추가`, `금액 > 100만 → 임원 결재 추가`.
