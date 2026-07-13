# tm-schedule — 일정 · 자원 · 공휴일 (F-55)

날짜 단위 일정(휴가/회의/외근/차량 등) + 자원(회의실/차량) 예약 + 관리자 공휴일 등록.
대시보드 주간 일정·자원 위젯 및 월간 캘린더의 데이터 소스.

## 관련 파일

| 구분 | 경로 |
|------|------|
| Schedule API 함수 | `frontend/src/api/schedule.js` |
| Holiday API 함수 | `frontend/src/api/holiday.js` |
| 일정 컨트롤러 | `backend/src/controllers/scheduleController.js` |
| 공휴일 컨트롤러 | `backend/src/controllers/holidayController.js` |
| 라우트 | `backend/src/routes/schedules.js`, `backend/src/routes/holidays.js` |
| 스키마 | `backend/prisma/schema.prisma` (ScheduleResource, ScheduleEvent, ScheduleEventAssignee, ScheduleEventShare, ScheduleEventShareScope, Holiday) |
| 관련 메모리 | `memory/schedule-feature.md` (대시보드 위젯·캘린더 구조) |

## F-55 상세

### 자원 (ScheduleResource)
- 회의실(`kind='room'`)/차량(`kind='vehicle'`) 등 예약 대상
- 이름·설명(정원/차종/번호판)·정렬(sortOrder)·활성화(isActive)
- API: `GET/POST /api/schedules/resources`, `PUT/DELETE /api/schedules/resources/:id`

### 일정 (ScheduleEvent)
- 유형(`type`): vacation/half_day/meeting/field_work/business_trip/remote/vehicle/etc
- 기간: `startDate`~`endDate` (날짜 단위), 종일(`allDay`) 또는 시간(`startTime`/`endTime`, 'HH:mm')
- 장소(location), 메모, 자원 연결(`resourceId`, onDelete SetNull)
- 공개 범위(`visibility`): `public`(전체 공개) | `shared`(대상자·공유자만) | `private`(대상자·작성자만). 조회 시 `visibilityWhere(user)`로 필터(admin은 전체). 기본값 `public`(기존 데이터 호환)
- 대상자(ScheduleEventAssignee): 일정의 주체, 타인 다중 지정 가능
- 공유자(ScheduleEventShare): 열람/알림만, 주체 아님. `visibility='shared'`에서만 지정(대상자와 중복 제거). 신규 지정분에 `schedule_shared` 알림(actorId·message·link='/') → `pushNotification`
- 공유 범위(ScheduleEventShareScope, kind='dept'|'team', refId=Department/Team id loose 참조): 부서/팀 단위 공유. `visibilityOr()`가 요청자 소속 부서·팀으로 조회 필터, `resolveScopeUserIds()`가 소속 활성 사용자로 확장해 알림. 응답은 `shareDeptIds[]`/`shareTeamIds[]`로 평탄화
- API: `GET/POST /api/schedules`, `PUT/DELETE /api/schedules/:id` (body에 `visibility`, `shareIds[]`, `shareDeptIds[]`, `shareTeamIds[]` 추가)

### 공휴일 (Holiday)
- 유형(`type`): temporary(임시)/substitute(대체)/legal(법정)/etc
- 관리자 등록분이 내장 기본 공휴일을 덮어씀. 캘린더·간트·일정에 반영
- `date` 컬럼 unique
- API: `GET/POST /api/holidays`, `DELETE /api/holidays/:id`
