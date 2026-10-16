# tm-myday — 내 하루 통합 홈 (F-64)

여러 도메인에 흩어진 "내가 할 일"을 한 화면으로 집계. M365 To Do / My Day 대응. 기존 테이블만 조회하는 순수 추가(additive) — 신규 스키마 없음.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 컨트롤러 | `backend/src/controllers/meController.js` |
| 라우트 | `backend/src/routes/me.js` |
| 프론트 API | `frontend/src/api/me.js` |
| 화면 | `frontend/src/pages/MyDay/index.jsx` |

## 집계 항목
- **내 업무**: 담당자 또는 생성자이면서 미완료(대기/진행중/보류), 마감 오름차순. 지연(overdue) 배지.
- **오늘 회의**: 주최자이거나, 참석자이면서 **초대를 거절(rsvp declined)하지 않은** 회의(취소 제외).
- **내 액션아이템**: 회의([tm-meeting])에서 내게 배정된 미완료(open) 액션아이템(업무연결·지연 표시).
- **결재 대기**: 상신(pending) 문서 중 현재 결재 순번이 나인 것만 — `backend/src/services/approvalAccess.js`의 `myPendingStepWhere`/`isMyTurnNow`를 [tm-approval]의 `approvalController.pendingCount`와 **공유**한다(각자 재구현하면 두 화면의 "결재 대기" 건수가 갈라짐 — 과거 리뷰에서 실제로 발생했던 divergence).
- **요약 카운트**: 내 업무·지연·결재대기·오늘회의·액션아이템·안읽은 알림·안읽은 메일.

## API (인증 필요)
`GET /api/me/today` → `{ date, tasks[], meetings[], actionItems[], approvals[], counts{} }`

## 화면
`/my-day` — 상단 요약 카드(클릭 시 해당 페이지 이동) + 내 업무/오늘 회의/액션아이템/결재 대기 리스트. 사이드바 '뷰' 그룹.

## 미구현(후속 확장 후보)
OKR 체크인 리마인더, 위키/게시판 멘션, 개인 커스텀 위젯 배치.
