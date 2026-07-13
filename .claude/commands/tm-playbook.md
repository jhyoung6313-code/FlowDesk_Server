# tm-playbook — 플레이북(SOP) 엔진 (F-36, F-37)

단계별 SOP 정의(F-36)와 실행 런(F-37). 분기·병렬·SLA·버전·웹훅·예약·통계.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 플레이북 워크스페이스/에디터 | `frontend/src/pages/Playbook/` |
| 런 목록/상세 | `frontend/src/pages/PlaybookRun/` |
| Playbook API 함수 | `frontend/src/api/playbook.js` |
| 정의 컨트롤러 | `backend/src/controllers/playbookController.js` |
| 런 컨트롤러 | `backend/src/controllers/playbookRunController.js` |
| 예약 컨트롤러 | `backend/src/controllers/playbookScheduleController.js` |
| 웹훅 컨트롤러 | `backend/src/controllers/webhookController.js` |
| 라우트 | `backend/src/routes/playbooks.js`, `runs.js` |

## F-36 플레이북(SOP 정의)
- 단계(PlaybookStep) + 페이즈(PlaybookPhase) 그룹화
- 단계 유형: task/approval/note/decision, 담당자(미지정/사용자/역할)
- SLA 시간, 증거 첨부 필요 여부, 의존관계, 변수(variables) 런타임 치환
- **조건부 분기**: decision 옵션 `nextStepOrder` → 선택 시 이전 스텝 자동 스킵
- **병렬 그룹(parallelGroup)**: 같은 번호 스텝 가로 나란히
- **버전 이력**(PlaybookVersion) 자동 저장 & 롤백
- **웹훅**: POST로 Run 자동 시작
- API: `GET/POST /api/playbooks`, `PUT/DELETE /api/playbooks/:id`
  - 버전: `GET/POST /api/playbooks/:id/versions`, `POST .../versions/:vid/restore`
  - 웹훅: `GET/POST /api/playbooks/:id/webhooks`, `DELETE .../webhooks/:hookId`, `POST /api/webhooks/trigger/:token`(인증 불필요)

## F-37 플레이북 실행(Run)
- 플레이북 기반 또는 애드혹 런. 상태 active/paused/finished/archived, 심각도 P1/P2/P3
- 스텝 상태: pending/in_progress/done/skipped/blocked/rejected, 참여자·런 업데이트·타임라인
- **SLA 위반 알림**: 80%·100% 초과 시 자동 알림(15분마다 체크)
- **런 결과 PDF 리포트**, 스텝별 체크리스트(RunStepChecklist)
- **실시간 협업**: Socket.IO run 룸
- **통계 대시보드**: 상태·심각도별 수, 평균 완료시간, 병목 Top5
- **안읽음 배지**: `PlaybookReadState.lastReadAt` 기준(본인 제외)
- **채팅방 자동 연동**: 런 시작/완료/일시정지/재개·스텝완료·업데이트 시 런명 그룹채팅방(`playbook_runs.linked_room_id`)에 알림
- **[확장] 예약 실행(PlaybookSchedule)**: 반복 유형·시간·참여자로 자동 실행. `playbook_schedules`
- API: `GET/POST /api/runs`, `PUT/PATCH /api/runs/:id`
  - 체크리스트: `GET/POST/PATCH/DELETE /api/runs/:id/steps/:stepId/checklists(/:checkId)`
  - `GET /api/runs/stats`, `GET /api/runs/unread-count`, `POST /api/runs/read`
