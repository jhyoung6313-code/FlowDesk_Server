# tm-automation — 자동화 및 알림 (F-10·24·25·29·32)

팝업/데스크탑 알림, 반복업무, 태그, 이메일 알림.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 알림 페이지 | `frontend/src/pages/Notifications/index.jsx` |
| 알림 컨트롤러 | `backend/src/controllers/notificationController.js` |
| 알림 서비스 | `backend/src/services/notificationService.js`, `sseService.js` |
| 반복업무(Admin) | `frontend/src/pages/Admin/RecurringTasks.jsx` |
| 반복업무 컨트롤러 | `backend/src/controllers/recurringTaskController.js` |
| 태그(Admin) | `frontend/src/pages/Admin/Tags.jsx` |
| 태그 컨트롤러 | `backend/src/controllers/tagController.js` |
| 이메일 설정(Admin) | `frontend/src/pages/Admin/EmailSettings.jsx` |
| 이메일 서비스 | `backend/src/services/emailService.js` |
| 소켓 | `backend/src/socket.js` |

## 기능 상세

### F-10 팝업 알림
- 마감 D-1(due_soon)/D-0(due_today)/지연(overdue) 알림 생성
- node-cron 매일 09시 자동 실행 + SSE/Socket.IO 실시간 전달
- 알림 소프트 삭제 지원(커밋 89c0375)
- API: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`

### F-24 반복 업무
- 유형: daily/weekly(요일)/monthly(날짜), 종료일 설정
- 매일 자동 생성(node-cron) 또는 수동 즉시 실행
- 담당자(시스템 ID JSON) + 외부 담당자(이름 JSON)
- API: `GET/POST /api/recurring-tasks`, `PUT/DELETE /api/recurring-tasks/:id`, `POST /api/recurring-tasks/generate`

### F-25 이메일 알림
- nodemailer SMTP, 마감임박·지연 업무를 담당자 이메일 발송
- API: `GET/PUT /api/settings`(email 키), `POST /api/settings/test-email`

### F-29 태그 관리
- 태그 생성·색상·삭제, 업무 다중 연결
- API: `GET/POST /api/tags`, `PUT/DELETE /api/tags/:id`

### F-32 데스크탑 알림 (Web Push)
- 브라우저 Notification API, SSE 실시간 수신 시 자동 표시
