# tm-data — 데이터 가져오기/내보내기 (F-18, F-19, F-30, F-44)

Excel 내보내기/가져오기, PDF 출력, 백업/복원.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 백업(Admin) | `frontend/src/pages/Admin/Backup.jsx` |
| 백업 컨트롤러 | `backend/src/controllers/backupController.js` |
| 백업 라우트 | `backend/src/routes/backup.js` (마운트 `/api/admin`) |
| WBS Excel | `backend/src/controllers/wbsController.js` ([tm-wbs] 참조) |
| 업무 Excel | `backend/src/controllers/taskController.js` |

## 기능 상세

### F-18 Excel 내보내기
- 업무 목록·WBS 시트·이슈사항을 xlsx로 다운로드(현재 필터 반영)
- 라이브러리: xlsx(SheetJS)
- API: `GET /api/tasks/export`, `GET /api/wbs/projects/:id/tasks/export`, `GET /api/wbs/projects/:id/issues/export`

### F-19 Excel 가져오기
- WBS 시트/이슈 일괄 등록(기존 데이터 대체)
- API: `POST /api/wbs/projects/:id/tasks/import`, `POST /api/wbs/projects/:id/issues/import`
- 샘플 양식: `GET /api/wbs/tasks/template`, `GET /api/wbs/issues/template`

### F-30 PDF 출력
- 업무 목록/상세 PDF(jsPDF, 프론트 클라이언트 사이드 생성)
- 플레이북 런 결과 PDF 리포트([tm-playbook] F-37)

### F-44 백업/복원
- 전체 데이터 JSON 백업 다운로드 / JSON 복원
- API: `GET /api/admin/backup/export`, `POST /api/admin/backup/import`
