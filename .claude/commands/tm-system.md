# tm-system — 시스템 관리 (F-40~F-43)

부서·팀(조직), 업무 템플릿, 활동 로그, 앱 설정.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 부서·팀(Admin) | `frontend/src/pages/Admin/Departments.jsx` |
| 활동 로그(Admin) | `frontend/src/pages/Admin/ActivityLog.jsx` |
| 템플릿(Admin) | `frontend/src/pages/Admin/Templates.jsx` |
| 시스템 설정(Admin) | `frontend/src/pages/Admin/SystemSettings.jsx` |
| 관리자 콘솔 | `frontend/src/pages/Admin/AdminConsole.jsx` |
| Org API 함수 | `frontend/src/api/org.js` |
| 컨트롤러 | `departmentController.js`, `teamController.js`, `templateController.js`, `settingsController.js` |
| 라우트 | `departments.js`, `teams.js`, `templates.js`, `settings.js`, `admin.js` |

## 기능 상세

### F-40 부서 · 팀 관리 (구 "파트" 대체)
- 조직을 **부서(Department) → 팀(Team)** 2단계로 관리. 부서 삭제 시 팀 cascade
- 업무·반복업무·템플릿은 **팀** 단위 분류(내부 컬럼 `part_id` 유지하되 팀 참조)
- 사용자는 **부서+팀**을 관리자가 지정
- 게시판 수신부서([tm-bbs])가 이 구조 사용
- API: `GET/POST /api/departments`, `PUT/DELETE /api/departments/:id`, `GET/POST /api/teams`, `PUT/DELETE /api/teams/:id`

### F-41 업무 템플릿
- 반복 업무 형식 저장(기간 일수·담당자 미리 지정), 템플릿으로 즉시 생성
- 담당자는 `assignee_ids_json`(JSON 문자열)
- API: `GET/POST /api/templates`, `PUT/DELETE /api/templates/:id`

### F-42 활동 로그
- 전체 업무 히스토리 조회(관리자 전용)
- API: `GET /api/admin/activity-log`

### F-43 앱 설정
- 이메일 SMTP·테마 등 전역 설정을 AppSetting key-value 관리
- API: `GET/PUT /api/settings`

> 관련: 접속기록(F-48)·보안강화(F-57)는 [tm-auth]·[tm-security] 참조
