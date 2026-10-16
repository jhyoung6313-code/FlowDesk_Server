# tm-scheduling — 회의 빈시간 찾기 (F-65)

참석자들의 회의([tm-meeting])·일정([tm-schedule], 휴가·외근·출장·차량 등)을 교차해 근무시간 내 공통 가용 슬롯을 제안. M365 Outlook "일정 도우미" 대응. 기존 데이터만 조회하는 순수 계산 — 신규 스키마 없음.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 순수 계산(구간 병합·슬롯 추출) | `backend/src/services/schedulingService.js` |
| 컨트롤러 | `backend/src/controllers/scheduleController.js` (freeSlots) |
| 프론트 API | `frontend/src/api/schedule.js` (findFreeSlots) |
| 화면 컴포넌트 | `frontend/src/components/Schedule/FreeSlotFinder.jsx` |

## 알고리즘
시간을 자정 기준 분(minute-of-day) 정수로 다룸: ① 참석자 바쁜 구간 수집 → ② 구간 병합(`mergeIntervals`) → ③ 근무시간에서 빼서 gap 산출 → ④ gap에서 duration 슬롯을 step 간격으로 추출.

- **바쁜 유형**: vacation·half_day·meeting·field_work·business_trip·vehicle(remote/etc는 가용 간주).
- **회의 바쁨 판정**: 주최자이거나, 참석자이면서 **초대를 거절(rsvp: 'declined')하지 않은** 경우만 바쁜 것으로 집계한다 — `scheduleController.freeSlots`가 `meeting.attendees`의 `rsvp`를 확인해 declined는 제외한다(과거에는 rsvp 필터가 아예 없어 거절한 회의도 계속 "바쁨"으로 잡혀 실제로는 비어 있는 슬롯을 숨기는 버그가 있었음).
- **파라미터**: attendeeIds(필수), from/to(최대 14일), durationMin(기본 60), workStart/workEnd(기본 09:00–18:00), stepMin(기본 30).

## API (인증 필요)
`POST /api/schedules/free-slots` → `{ durationMin, workStart, workEnd, days: [{ date, slots: [{ start, end }] }] }`

## 화면
회의 생성/수정 모달([tm-meeting]) 참석자 옆 "빈 시간 찾기" 버튼 → 슬롯 클릭 시 일시 자동 입력.

## 미구현(후속 확장 후보)
회의실(자원) 가용성 교차, 참석자별 가용률 히트맵, 타임존 다중 지원.
