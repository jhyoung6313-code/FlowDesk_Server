# tm-meeting — 회의 관리 (F-61)

회의의 **안건 → 참석자(RSVP) → 회의록 → 결정사항 → 액션아이템** 라이프사이클 관리.
액션아이템은 원클릭으로 업무([tm-core] F-03)로 전환·연결. 회의록 본문은 `RichEditor`(TipTap) HTML.
AI 회의록 요약은 [tm-ai] F-58 연계.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 컨트롤러 | `backend/src/controllers/meetingController.js` |
| 라우트 | `backend/src/routes/meetings.js` |
| 프론트 API | `frontend/src/api/meetings.js` |
| 화면(목록+상세) | `frontend/src/pages/Meetings/index.jsx` |
| 마크다운 렌더러(AI 요약 표시) | `frontend/src/components/ai/MarkdownLite.jsx` |
| 스키마 | `Meeting`, `MeetingAgenda`, `MeetingAttendee`, `MeetingDecision`, `MeetingActionItem` |

## 개념 구조
회의(Meeting) → 안건(MeetingAgenda) / 참석자(MeetingAttendee) / 결정사항(MeetingDecision) / 액션아이템(MeetingActionItem)

- **회의**: 제목·일시(start/end)·장소·주최자·상태(scheduled/in_progress/done/cancelled)·회의록(minutes HTML)·요약(summary). 소프트 삭제. 수정 권한: 주최자·관리자
- **안건**: 순서·제목·발표자·소요시간(분). 회의 생성/수정 시 목록 **교체**
- **참석자**: 내부(userId)/외부(extName), 역할(organizer/attendee/optional), **RSVP**(invited/accepted/declined/attended/absent). 주최자 자동 포함, 참석자 교체 시 기존 RSVP 보존
- **결정사항**: 회의별 결정 기록 추가/삭제
- **액션아이템**: 내용·담당자·기한·상태(open/done). **업무 전환**(to-task) 시 Task 생성·담당자 연결·`taskId` 링크(중복 전환 방지)

## API (마운트 `/api/meetings`, 인증 필요)

| 구분 | 엔드포인트 |
|------|-----------|
| 회의 | `GET /api/meetings?filter=mine\|upcoming\|past`, `POST /api/meetings`, `GET/PUT/DELETE /api/meetings/:id` |
| RSVP | `PATCH /api/meetings/:id/rsvp` (본인 응답) |
| AI 요약 | `POST /api/meetings/:id/ai-summary` ([tm-ai] 연계, `summary` 저장) |
| 결정사항 | `POST /api/meetings/:id/decisions`, `DELETE /api/meetings/:id/decisions/:did` |
| 액션아이템 | `POST/PUT/DELETE /api/meetings/:id/action-items(/:aid)`, `POST /api/meetings/:id/action-items/:aid/to-task` |

## 화면
`/meetings` — 좌측 회의 목록(내 회의/예정/지난 필터) + 우측 상세(개요·AI요약·RSVP·참석자·안건·회의록 편집·결정사항·액션아이템).
사이드바 '회의' 메뉴(협업 그룹, `FileDoneOutlined`). 선택은 `?id=<id>` 쿼리.

## 연계
- **[tm-core] 업무**: 액션아이템 → Task 전환(담당자·기한 연결, `taskId`)
- **[tm-ai] AI**: 회의록 AI 요약(키 설정 시 버튼 노출)

## 미구현(후속 확장 후보)
자원/일정([tm-schedule] F-55) 연동, 회의록 메일([tm-mail] F-54) 배포, 반복 회의.
기획: `docs/제안기능_기획서.md` F-61
