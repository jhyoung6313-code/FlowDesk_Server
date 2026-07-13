# tm-wbs — WBS 프로젝트 관리 (F-13, F-14)

WBS(Work Breakdown Structure) 프로젝트 관리 + 이슈사항 관리 + 산출물 파일 + Excel 가져오기/내보내기/샘플 양식.

## 관련 파일

| 구분 | 경로 |
|------|------|
| WBS 페이지 (툴바·헤더) | `frontend/src/pages/WBS/index.jsx` |
| 워크스페이스(탭 레이아웃) | `frontend/src/pages/WBS/WbsWorkspace.jsx` |
| WBS 시트(작업 트리) | `frontend/src/pages/WBS/WbsSheet.jsx` |
| 이슈 시트 | `frontend/src/pages/WBS/IssueSheet.jsx` |
| 간트 뷰 | `frontend/src/pages/WBS/GanttView.jsx` |
| 진척 요약 카드 | `frontend/src/pages/WBS/WbsSummaryCards.jsx` |
| WBS API 함수 | `frontend/src/api/wbs.js` |
| WBS 컨트롤러 | `backend/src/controllers/wbsController.js` |
| WBS 라우트 | `backend/src/routes/wbs.js` |
| DB 스키마 | `backend/prisma/schema.prisma` (`WbsProject`/`WbsProjectMember`/`WbsTask`/`WbsIssue`) |

---

## F-13. WBS 시트

- **화면**: S-11 WBS
- 다중 프로젝트 관리 (생성·수정·삭제 — 관리자 전용)
- 계층형 작업 트리 (레벨 0~4, 드래그앤드롭 순서·계층 변경)
- 컬럼: 작업명, 산출물명, 시작일, 종료일, 계획진척률(%), 실적진척률(%), 메모
- 산출물 파일 첨부 (업로드/다운로드/삭제, 최대 50MB, `uploads/wbs-deliverables`)
- 간트 차트 뷰 연동, 기준선(스냅샷) 저장·비교, PDF 보고서 출력
- **API**:
  - `GET/POST /api/wbs/projects`, `GET/PUT/DELETE /api/wbs/projects/:id`
  - `GET/POST /api/wbs/projects/:id/tasks`, `PUT/DELETE /api/wbs/tasks/:taskId`
  - `PATCH /api/wbs/projects/:id/tasks/reorder` — 순서·계층 일괄 변경
  - `POST/GET/DELETE /api/wbs/tasks/:taskId/deliverable` — 산출물 파일

---

## F-14. WBS 이슈사항

- **화면**: S-11 WBS > 이슈 탭
- 프로젝트별 이슈 등록·수정·삭제 (구분, 이슈내용, 발생일, 목표해결일, 진척률, 완료예정일, 상태, 비고)
- 이슈 상태: 오픈(open)/진행중(in_progress)/완료(closed)/보류(hold)
- 등록자(User) 참조 및 표시
- **API**: `GET/POST /api/wbs/projects/:id/issues`, `PUT/DELETE /api/wbs/issues/:issueId`

---

## Excel 내보내기 / 가져오기 / 샘플 양식

### 내보내기
- `GET /api/wbs/projects/:id/tasks/export` — WBS 작업
- `GET /api/wbs/projects/:id/issues/export` — 이슈사항
- 컨트롤러: `exportTasksExcel`, `exportIssuesExcel` (xlsx/SheetJS, 한글 파일명 `filename*=UTF-8''`)

### 가져오기 (기존 데이터 덮어쓰기, 관리자 전용)
- `POST /api/wbs/projects/:id/tasks/import` — `importTasksExcel`
  - **표준 WBS 포맷**: 헤더에 `레벨`/`작업명`/`산출물명`/`시작일`/`종료일`/`계획진척률`/`실적진척률`/`메모` (영문 Level/Name/… 도 인식)
  - **실무 WBS 포맷**: 작업명이 A~G열 계층 위치로 레벨 표현, 산출물=H열, 시작=J, 종료=K, 계획=L, 실적=M열
  - 시트명이 `v숫자` 패턴이면 우선 선택, 없으면 첫 시트
  - 진척률 0~1 소수 입력 시 백분율로 자동 환산, 0~100 클램프
  - `$transaction`으로 기존 항목 `deleteMany` 후 `parentStack` 기반으로 계층 재구성
- `POST /api/wbs/projects/:id/issues/import` — `importIssuesExcel`
  - 헤더: `구분`/`이슈내용`/`발생일`/`목표해결일`/`진척률(%)`/`완료예정일`/`상태`/`비고`
  - `이슈내용` 필수, 상태 한글↔영문 매핑(`statusKoMap`)

### 샘플 양식 다운로드 (v1.9.x, 모든 사용자)
- `GET /api/wbs/tasks/template` — `downloadTasksTemplate`
- `GET /api/wbs/issues/template` — `downloadIssuesTemplate`
- 표준 포맷 헤더 + 레벨/상태별 예시 행 + `작성안내` 시트(형식·필수항목·덮어쓰기 주의)를 담은 빈 양식 생성
- 프론트: `wbs.js`의 `downloadTasksTemplate`/`downloadIssuesTemplate` (공용 `downloadExcel` blob 유틸 재사용)
- UI: `index.jsx` 툴바의 **`샘플 양식`** 버튼 (`FileExcelOutlined`) — 현재 탭(WBS/간트→작업, 이슈→이슈)에 맞는 양식 다운로드

---

## DB 모델 요약

| 모델 | 테이블 | 비고 |
|------|--------|------|
| `WbsProject` | `wbs_projects` | 프로젝트, `createdBy`→users |
| `WbsProjectMember` | `wbs_project_members` | 멤버(자유 텍스트, users 비참조 — 외부 인원 포함 가능) |
| `WbsTask` | `wbs_tasks` | 작업 트리, `parentId` 자기참조, `level`/`order`, 진척률 `Decimal(5,2)`, 산출물 파일 필드 |
| `WbsIssue` | `wbs_issues` | 이슈, `status` enum(`WbsIssueStatus`), `createdBy`→users |

- 모든 하위 모델은 프로젝트 삭제 시 `onDelete: Cascade`
- WbsTask는 부모 삭제 시 자식도 Cascade

---

## 변경 이력

| 버전 | 내용 |
|------|------|
| v1.9 | F-13·F-14 구현 — WBS 트리, 이슈, 산출물 파일, 간트, Excel 가져오기/내보내기(표준+실무 포맷 자동 감지) |
| v1.9.x | 업로드용 샘플 양식 다운로드 추가 — `GET /api/wbs/tasks/template`, `GET /api/wbs/issues/template` + 툴바 `샘플 양식` 버튼 |
