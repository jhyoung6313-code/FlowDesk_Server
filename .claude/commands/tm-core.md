# tm-core — 업무 CRUD (F-02~F-07)

업무 목록·생성/수정/삭제·상태변경·일괄처리 등 핵심 업무 관리.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 업무 목록 페이지 | `frontend/src/pages/Tasks/index.jsx` |
| 업무 드로어/폼 | `frontend/src/pages/Tasks/` (TaskForm 등) |
| Tasks API 함수 | `frontend/src/api/tasks.js` |
| 컨트롤러 | `backend/src/controllers/taskController.js` |
| 라우트 | `backend/src/routes/tasks.js` |
| 스키마 | `Task`, `TaskAssignee`, `TaskExtraAssignee`, `TaskDependency`, `TaskTag` |

## 기능 상세

### F-02 업무 목록 조회
- 파트(팀)·담당자·상태·우선순위·태그·날짜 기간 필터, 정렬(마감일/우선순위/등록일)
- API: `GET /api/tasks`

### F-03 업무 생성/수정/삭제
- 필드: 제목(필수)·설명·팀(part_id)·우선순위(높음/보통/낮음)·상태(대기/진행중/완료/보류)
- 시작일/마감일, 담당자(시스템 사용자), 외부 담당자(자유 텍스트), 전임업무(선행 의존), 태그 다중
- **소프트 삭제**: `del_yn='1'` (Prisma `delYn`), 휴지통 복구 가능
- 권한: 생성자 또는 담당자 또는 admin
- API: `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`

### F-04 상태 빠른 변경
- 드로어/칸반 카드에서 직접 변경. API: `PATCH /api/tasks/:id/status`

### F-05 일괄 처리
- 체크박스 선택 후 상태 일괄 변경/삭제. API: `POST /api/tasks/bulk`

### F-06·F-07 (담당자·기한·우선순위 관리)
- 담당자: `TaskAssignee`(users N:M) + `TaskExtraAssignee`(외부 자유텍스트)
- 의존관계: `TaskDependency`(predecessor→successor)

## 코드 컨벤션 (필수 준수)
- 에러: `next(err)` 패턴, 4xx/5xx는 `{ error }` 필드
- PrismaClient: `require('../lib/prisma')` 싱글턴 (개별 `new PrismaClient()` 금지)
- 소프트 삭제 조회 시 `delYn='0'` 필터
