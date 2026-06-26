# FlowDesk 기능정의서 v1.9

> 소규모 팀(2~10명)을 위한 로컬 전용 풀스택 업무관리 시스템

---

## 목차
1. [인증 및 사용자 관리](#1-인증-및-사용자-관리) — F-01, F-11, F-15, F-22
2. [업무 관리](#2-업무-관리) — F-02~F-05
3. [시각화 뷰](#3-시각화-뷰) — F-08, F-09, F-12, F-16, F-20, F-21, F-26~F-28, F-33
4. [WBS 프로젝트 관리](#4-wbs-프로젝트-관리) — F-13, F-14
5. [협업 기능](#5-협업-기능) — F-17, F-23, F-31, F-46
6. [자동화 및 알림](#6-자동화-및-알림) — F-10, F-24, F-25, F-29, F-32
7. [데이터 가져오기/내보내기](#7-데이터-가져오기내보내기) — F-18, F-19, F-30, F-44
8. [보드(Board) 시스템](#8-보드board-시스템) — F-34, F-35
9. [플레이북(SOP) 엔진](#9-플레이북sop-엔진) — F-36, F-37
10. [채팅 시스템](#10-채팅-시스템) — F-38, F-39
11. [가계부](#11-가계부) — F-45
12. [시스템 관리](#12-시스템-관리) — F-40~F-43
13. [메모지](#13-메모지) — F-47

---

## 1. 인증 및 사용자 관리

### F-01. 로그인 (JWT 인증)
- **화면**: S-01 로그인
- **설명**: username/password 기반 로그인, JWT 토큰 발급 (유효기간 8시간)
- **보안**: 로그인 Rate Limit (5분/10회), bcrypt 비밀번호 해싱
- **비밀번호 입력 경고**: 한글 입력 또는 대문자(Caps Lock) 감지 시 amber 색상 경고 배너 표시 (실시간)
- **API**: `POST /api/auth/login`

### F-11. OTP 2단계 인증 (TOTP)
- **화면**: S-01 로그인
- **설명**: otplib 기반 TOTP 2단계 인증. 관리자가 개별 사용자에게 활성화/QR코드 발급
- **API**: `POST /api/auth/otp/verify`, `POST /api/users/:id/totp/enable`, `POST /api/users/:id/totp/disable`

### F-15. 비밀번호 변경
- **화면**: S-10 프로필
- **설명**: 현재 비밀번호 확인 후 신규 비밀번호 변경. 관리자는 모든 사용자 비밀번호 재설정 가능
- **API**: `PUT /api/users/:id/password`

### F-22. 사용자 관리 (관리자)
- **화면**: S-07 관리자 > 사용자
- **설명**: 계정 생성/수정/비활성화, 역할(admin/member) 설정, 아바타 색상 지정, TOTP 관리
- **API**: `GET/POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`

### 미사용 화면 잠금 / 자동 로그아웃
- **설명**: 사용자가 설정한 미사용 시간(분) 초과 시 **화면 잠금**(로그아웃 아님, 토큰 유지). 잠금 화면에서 비밀번호로 해제하거나 로그아웃 선택. 잠긴 상태에서 새로고침해도 잠금 유지(localStorage). **자정(00:00) 경과 시**에는 일자 전환을 위해 자동 로그아웃(잠금 중에도 동작).
- **설정**: `/profile`의 "미사용 화면 잠금" 카드에서 사용자별 시간 선택(사용 안 함/10·30분/1·2·4시간). 기본 60분. User.`idleTimeoutMin`에 저장.
- **API**: `PUT /api/auth/idle-timeout`(설정 저장), `POST /api/auth/verify-password`(잠금 해제용 비밀번호 검증)
- **구현**: `frontend/src/hooks/useIdleTimeout.js`, `store/lockStore.js`, `components/LockScreen/index.jsx`, `App.jsx`, `authController.js`(updateIdleTimeout, verifyPassword)

---

## 2. 업무 관리

### F-02. 업무 목록 조회
- **화면**: S-03 업무 목록
- **설명**: 파트·담당자·상태·우선순위·태그·날짜 기간별 필터링, 정렬(마감일/우선순위/등록일)
- **API**: `GET /api/tasks`

### F-03. 업무 생성/수정/삭제
- **화면**: S-04 업무 드로어
- **설명**:
  - 제목(필수), 설명, 파트, 우선순위(높음/보통/낮음), 상태(대기/진행중/완료/보류)
  - 시작일/마감일, 담당자(시스템 사용자), 외부 담당자(자유 텍스트)
  - 전임업무(선행 업무) 의존 관계, 태그 다중 선택
  - 소프트 삭제(delYn 플래그), 휴지통 복구 가능
- **권한**: 생성자 또는 담당자 또는 admin이 수정 가능
- **API**: `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`

### F-04. 업무 상태 빠른 변경
- **설명**: 드로어/칸반 카드에서 상태 직접 변경
- **API**: `PATCH /api/tasks/:id/status`

### F-05. 일괄 처리
- **설명**: 체크박스 선택 후 상태 일괄 변경 또는 일괄 삭제
- **API**: `POST /api/tasks/bulk`

---

## 3. 시각화 뷰

### F-08. 캘린더 뷰
- **화면**: S-05 캘린더
- **설명**: FullCalendar v6 기반. 업무를 시작일~마감일 범위로 표시. 드래그앤드롭으로 날짜 변경
- **API**: `GET /api/tasks/calendar`

### F-09. 간트 차트
- **화면**: S-06 간트
- **설명**: gantt-task-react 기반. 파트별 그룹화, 의존 관계 화살표 표시
- **API**: `GET /api/tasks/gantt`

### F-12. 칸반 뷰
- **화면**: S-03 업무 > 칸반 탭
- **설명**: 상태(대기/진행중/완료/보류) 컬럼별 카드 표시. 드래그앤드롭 상태 변경
- **API**: `PATCH /api/tasks/:id/status`

### F-16. 대시보드
- **화면**: S-02 대시보드
- **설명**: Recharts 기반 통계 위젯 (상태별/파트별/우선순위별 도넛·바 차트, D-Day 현황, 최근 활동)
- **API**: `GET /api/tasks` (필터 조합)

### F-20. 다크모드
- **설명**: Ant Design 다크 알고리즘 + 커스텀 CSS 변수. Zustand themeStore에 토글 저장
- 12가지 컬러 테마 선택 가능

### F-21. 마일스톤
- **화면**: S-15 마일스톤
- **설명**: 날짜·색상·설명을 가진 프로젝트 이정표. 캘린더·간트 차트에 표시
- **API**: `GET/POST /api/milestones`, `PUT/DELETE /api/milestones/:id`

### F-26. 캘린더 메모
- **화면**: S-05 캘린더 > 메모 팝업
- **설명**: 특정 날짜에 자유 메모 등록 (200자 제한)
- **API**: `GET/POST /api/calendar-notes`, `PUT/DELETE /api/calendar-notes/:id`

### F-27. 업무 목록 뷰 (리스트/칸반/캘린더)
- **화면**: S-03 업무
- **설명**: 업무 페이지에서 리스트·칸반·캘린더 3가지 뷰 전환 가능

### F-28. 대시보드 위젯
- **설명**: 위젯별 최소화/펼치기, 반응형 레이아웃

### F-33. 업무 지연 표시
- **설명**: 마감일 경과 + 미완료 상태의 업무를 "지연" 배지로 표시. 목록/칸반/대시보드 공통 적용

---

## 4. WBS 프로젝트 관리

### F-13. WBS 시트
- **화면**: S-11 WBS
- **설명**:
  - 다중 프로젝트 관리 (프로젝트 생성·수정·삭제)
  - 계층형 작업 트리 (레벨 0~4, 드래그앤드롭 순서·계층 변경)
  - 컬럼: 작업명, 산출물명, 시작일, 종료일, 계획진척률(%), 실적진척률(%), 메모
  - 산출물 파일 첨부 (업로드/다운로드/삭제)
  - Excel 내보내기 / Excel 가져오기 (표준 포맷 + 실무 WBS 포맷 자동 감지)
  - 업로드용 샘플 양식 다운로드 (표준 포맷 헤더 + 예시 행 + 작성안내 시트)
  - 간트 차트 뷰 연동
- **API**: `GET/POST /api/wbs/projects`, `PUT/DELETE /api/wbs/projects/:id`
- **API**: `GET/POST /api/wbs/projects/:id/tasks`, `PUT/DELETE /api/wbs/tasks/:taskId`
- **API**: `GET /api/wbs/tasks/template` (업로드용 샘플 양식)

### F-14. WBS 이슈사항
- **화면**: S-11 WBS > 이슈 탭
- **설명**:
  - 프로젝트별 이슈 등록·수정·삭제 (구분, 이슈내용, 발생일, 목표해결일, 진척률, 완료예정일, 상태, 비고)
  - 이슈 상태: 오픈/진행중/완료/보류
  - 등록자(User) 참조 및 표시
  - Excel 내보내기 / Excel 가져오기 / 업로드용 샘플 양식 다운로드
- **API**: `GET/POST /api/wbs/projects/:id/issues`, `PUT/DELETE /api/wbs/issues/:issueId`
- **API**: `GET /api/wbs/issues/template` (업로드용 샘플 양식)

---

## 5. 협업 기능

### F-17. 댓글 (진행사항)
- **화면**: S-04 업무 **수정 폼**(TaskForm) 하단 — 취소/저장 버튼 위. 기존 업무 수정 시에만 노출
- **설명**: 업무별 진행사항/댓글 CRUD. 작성자 표시, 수정 이력 없음. 댓글 작성 시 **파일 첨부 가능**(보드 카드 댓글과 동일 패턴, 최대 20MB). 댓글 첨부는 별도 첨부 목록과 분리(`commentId` 기준)
- **API**: `GET/POST /api/tasks/:id/comments`, `PUT/DELETE /api/tasks/comments/:commentId`, `POST /api/tasks/:id/comments/:commentId/attachment`
- **참고**: 상세보기(👁) 드로어에서는 댓글/첨부/캘린더이동 탭을 제거함. 모든 드로어는 좌우 너비 드래그 리사이즈 지원(`components/common/ResizableDrawer`)

### F-23. 업무 히스토리 (변경 이력)
- **화면**: S-04 업무 드로어 > 히스토리 탭
- **설명**: 업무 생성·수정·삭제 시 자동 기록 (필드명, 이전값, 신규값, 변경자, 시각)
- **API**: `GET /api/tasks/:id/history`

### F-31. 타임 트래킹
- **화면**: S-04 업무 드로어 > 시간 탭
- **설명**: 업무별 실제 작업 시간 기록 (시작시각, 종료시각, 메모). 총계 집계
- **API**: `GET/POST /api/time-entries`, `PUT/DELETE /api/time-entries/:id`

### F-46. 첨부파일
- **화면**: S-04 업무 드로어 > 파일 탭
- **설명**: 업무당 다중 파일 첨부. multer 파일 저장, 원본 파일명 보존, 다운로드
- **API**: `GET/POST /api/tasks/:id/attachments`, `DELETE /api/attachments/:id`

---

## 6. 자동화 및 알림

### F-10. 팝업 알림 (브라우저 알림)
- **화면**: S-09 알림
- **설명**: 업무 마감 D-1(due_soon), D-0(due_today), 지연(overdue) 시 알림 생성
- **구현**: node-cron 매일 오전 9시 자동 실행, SSE 또는 Socket.IO로 실시간 전달
- **API**: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`

### F-24. 반복 업무
- **화면**: S-13 관리자 > 반복업무
- **설명**:
  - 반복 유형: 매일(daily), 매주(weekly, 요일 지정), 매월(monthly, 날짜 지정)
  - 반복 종료일 설정 가능
  - 매일 자동 생성 (node-cron) 또는 수동 즉시 실행
  - 담당자(시스템 사용자 ID 목록 JSON) + 외부 담당자(이름 JSON) 지정
- **API**: `GET/POST /api/recurring-tasks`, `PUT/DELETE /api/recurring-tasks/:id`, `POST /api/recurring-tasks/generate`

### F-25. 이메일 알림
- **화면**: S-16 관리자 > 이메일 설정
- **설명**: nodemailer 기반 SMTP 설정. 마감 임박·지연 업무를 담당자 이메일로 발송
- **API**: `GET/PUT /api/settings` (email 관련 키), `POST /api/settings/test-email`

### F-29. 태그 관리
- **화면**: S-14 관리자 > 태그
- **설명**: 태그 생성·색상·삭제. 업무에 다중 태그 연결
- **API**: `GET/POST /api/tags`, `PUT/DELETE /api/tags/:id`

### F-32. 데스크탑 알림 (Web Push)
- **설명**: 브라우저 Notification API 기반 데스크탑 알림. SSE로 실시간 수신 시 자동 표시

---

## 7. 데이터 가져오기/내보내기

### F-18. Excel 내보내기
- **설명**: 업무 목록, WBS 시트, 이슈사항을 xlsx 파일로 다운로드 (현재 필터 조건 반영)
- **라이브러리**: xlsx (SheetJS)
- **API**: `GET /api/tasks/export`, `GET /api/wbs/projects/:id/tasks/export`, `GET /api/wbs/projects/:id/issues/export`

### F-19. Excel 가져오기
- **설명**: Excel 파일 업로드로 WBS 시트/이슈사항 일괄 등록 (기존 데이터 대체)
- **API**: `POST /api/wbs/projects/:id/tasks/import`, `POST /api/wbs/projects/:id/issues/import`
- **샘플 양식**: 표준 포맷 헤더 + 예시 행 + 작성안내 시트가 채워진 빈 양식 다운로드
  - **API**: `GET /api/wbs/tasks/template`, `GET /api/wbs/issues/template`

### F-30. PDF 출력
- **설명**: 업무 목록 / 상세를 PDF로 출력 (jsPDF 기반)
- **구현**: 프론트엔드 클라이언트 사이드 생성

### F-44. 백업/복원
- **화면**: S-17 관리자 > 백업
- **설명**: 전체 데이터 JSON 백업 다운로드, JSON 파일로 복원
- **API**: `GET /api/admin/backup/export`, `POST /api/admin/backup/import`

---

## 8. 보드(Board) 시스템

### F-34. 보드 관리
- **화면**: 보드 워크스페이스(3분할 단일 화면) — 좌측 카테고리·보드 트리 사이드바 + 우측 보드 내용 (`/boards`, `/boards/:id` 모두 동일 셸)
- **설명**:
  - 독립적인 칸반 보드 생성 (아이콘·배경색·설명 설정)
  - 멤버 초대 및 역할(admin/member) 관리
  - 커스텀 속성(BoardProperty) 정의: 텍스트, 숫자, 날짜, 선택, 체크박스 등
  - 카드 자동화 규칙 (BoardAutomation): 트리거 → 액션 설정
  - 기본 뷰: 칸반/타임라인/테이블/갤러리/캘린더 전환
  - **[v2 개편]** 채팅식 3분할 워크스페이스로 통합 (카드형 목록 페이지 폐기). 좌측 사이드바에서 카테고리 그룹 펼침/접기, 보드 선택 시 우측에 즉시 표시
  - **[v2] 카테고리(BoardCategory)**: 보드를 묶는 그룹. 공용(전체 노출)/개인(본인만) 범위 + 폴더 중첩(parentId). 보드 생성·수정·드롭다운으로 카테고리 이동. 삭제 시 소속 보드는 미분류로 이동
  - **[v2] 저장 뷰(BoardView)**: 보드마다 이름 붙은 뷰(타입+필터+정렬+검색+컬럼 설정)를 탭으로 저장·전환·이름변경·갱신·삭제. 기본 뷰(isDefault) 자동 적용
  - **[개선]** 사이드바 안읽음 배지: 멤버 보드의 새 카드·댓글 수 집계 (`BoardMember.lastReadAt` 기준, 본인 작성 제외). 보드 진입/이탈 시 읽음 처리
  - **[개선]** 보드 전용 채팅방 자동 연동: 카드 생성/수정/삭제·댓글 시 **보드 이름의 그룹 채팅방**(`boards.linked_room_id`)에 행위자 명의로 알림 발송 → 채팅 안읽음 카운트 연동 ([tm-chat] linkedRoomService)
- **API**: `GET/POST /api/boards`, `PUT/DELETE /api/boards/:id`, `PATCH /api/boards/reorder` (정렬·이동)
  - 카테고리: `GET/POST /api/board-categories`, `PUT/DELETE /api/board-categories/:id`, `PATCH /api/board-categories/reorder`
  - 저장 뷰: `GET/POST /api/boards/:id/views`, `PUT/DELETE /api/boards/:id/views/:viewId`, `PATCH /api/boards/:id/views/reorder`
  - `GET /api/boards/unread-count` (안읽음 집계), `POST /api/boards/:id/read` (읽음 처리)

### F-35. 보드 카드
- **설명**:
  - 카드 CRUD (제목, 설명, 담당자, 마감일, 우선순위, 진행률, 커버 이미지·색상)
  - 체크리스트, 첨부파일, 댓글
  - 카드 간 의존 관계 (blocks/depends-on)
  - 기존 업무(Task)와 연결(linkedTaskId)
  - 담당자 자동 연동: 카드에 담당자 지정 시 Task 자동 생성·연결, 이후 제목·상태·우선순위·기한·담당자를 연결 Task에 지속 동기화(담당자 제거/카드 삭제 시 Task는 유지)
- **API**: `GET/POST /api/boards/:id/cards`, `PUT/DELETE /api/boards/cards/:cardId`

---

## 9. 플레이북(SOP) 엔진

### F-36. 플레이북 (SOP 정의)
- **화면**: 플레이북 목록 / 편집기
- **설명**:
  - 단계별 SOP 절차 정의 (PlaybookStep)
  - 페이즈(PlaybookPhase)별 단계 그룹화
  - 단계 유형: 작업(task)/승인(approval)/노트(note)/의사결정(decision)
  - 단계별 담당자 지정 (미지정/특정 사용자/역할)
  - SLA 시간, 증거 첨부 필요 여부, 의존 관계 설정
  - 변수(variables) 정의로 런타임 동적 값 치환
  - **[개선]** 조건부 분기: decision 옵션에 `nextStepOrder` 지정 → 선택 시 해당 스텝 이전 스텝 자동 스킵
  - **[개선]** 병렬 그룹(parallelGroup): 같은 번호 스텝은 런 화면에서 가로 나란히 표시
  - **[개선]** 버전 이력 자동 저장 & 롤백 (PlaybookVersion)
  - **[개선]** 외부 웹훅 생성 (POST 요청으로 Run 자동 시작)
- **API**: `GET/POST /api/playbooks`, `PUT/DELETE /api/playbooks/:id`
  - `GET/POST /api/playbooks/:id/versions`, `POST /api/playbooks/:id/versions/:vid/restore`
  - `GET/POST /api/playbooks/:id/webhooks`, `DELETE /api/playbooks/:id/webhooks/:hookId`
  - `POST /api/webhooks/trigger/:token` (인증 불필요)

### F-37. 플레이북 실행 (Run)
- **화면**: 런 목록 / 런 상세
- **설명**:
  - 플레이북 기반 런 생성 또는 애드혹 런 생성
  - 런 상태: active/paused/finished/archived
  - 심각도(severity): P1/P2/P3/없음
  - 단계별 상태 추적 (pending/in_progress/done/skipped/blocked/rejected)
  - 런 참여자 관리, 런 업데이트(노트·알림) 작성
  - 타임라인 이벤트 자동 기록
  - **[개선]** SLA 위반 알림: in_progress 스텝의 SLA 80%·100% 초과 시 자동 알림 (15분마다 체크)
  - **[개선]** 런 결과 PDF 리포트: 단계·참여자·요약 포함 다운로드
  - **[개선]** 스텝별 체크리스트 (RunStepChecklist): 세부 항목 추가/체크
  - **[개선]** 실시간 협업: Socket.IO run 룸 → 다른 사용자의 스텝 변경이 즉시 반영
  - **[개선]** 통계 대시보드: 상태별·심각도별 런 수, 평균 완료 시간, 병목 단계 Top 5
  - **[개선]** 사이드바 안읽음 배지: 새 Run·Run 업데이트 수 집계 (`PlaybookReadState.lastReadAt` 기준, 본인 작성 제외). Run 목록 진입/이탈 시 읽음 처리. 실시간 누적은 전역 `playbook-activity` 소켓 broadcast 사용
  - **[개선]** 런 전용 채팅방 자동 연동: 런 시작/완료/일시정지/재개·스텝 완료·업데이트(노트) 시 **런 이름의 그룹 채팅방**(`playbook_runs.linked_room_id`, 멤버=참여자)에 알림 발송 ([tm-chat] linkedRoomService)
- **API**: `GET/POST /api/runs`, `PUT/PATCH /api/runs/:id`
  - `GET/POST/PATCH/DELETE /api/runs/:id/steps/:stepId/checklists(/:checkId)`
  - `GET /api/runs/stats`
  - `GET /api/runs/unread-count` (안읽음 집계), `POST /api/runs/read` (읽음 처리)

---

## 10. 채팅 시스템

### F-38. 채팅방
- **화면**: S-채팅
- **설명**:
  - DM(direct)/그룹(group)/공개(public)/비공개(private) 채팅방
  - 멤버 초대/제거, 즐겨찾기, 뮤트
  - Socket.IO 기반 실시간 메시지
  - **[개선]** 전역 안읽음 카운트(사이드바): 방별 `lastReadAt` 기준 집계. 채팅 페이지 미방문 상태에서도 소켓 연결 시 방 목록을 로드해 배지 표시·실시간 누적. 본인 발신 메시지는 안읽음 미집계
  - **[개선]** 보드/플레이북 연동 전용방: 보드/런 업데이트가 행위자 명의 시스템 메시지로 수신됨 ([tm-chat] linkedRoomService)
- **API**: `GET/POST /api/chat/rooms`, `DELETE /api/chat/rooms/:id`

### F-39. 메시지 기능
- **설명**:
  - 텍스트/파일 전송, 메시지 수정·삭제(소프트)
  - 스레드 답글(parentId), 이모지 리액션, 메시지 저장, 핀 고정
  - 메시지 전달(forwarding)
  - **[개선]** 메시지 내 내부 링크(`/boards/...`, `/runs/...`)는 SPA 네비게이션으로 이동 (전체 새로고침 없음)
- **API**: `GET/POST /api/chat/rooms/:id/messages`

---

## 11. 가계부

### F-45. 수입/지출 관리
- **화면**: 가계부
- **설명**:
  - 수입(income)/지출(expense) 내역 등록·수정·삭제
  - 카테고리별 분류, 예산(월별) 설정
  - 반복 거래(LedgerRecurring): 월별 자동 생성
  - 월별 통계 차트 (Recharts)
- **API**: `GET/POST /api/ledger/entries`, `GET/POST /api/ledger/categories`, `GET/POST /api/ledger/budgets`, `GET/POST /api/ledger/recurrings`

---

## 12. 시스템 관리

### F-40. 파트 관리
- **화면**: S-08 관리자 > 파트
- **설명**: 업무·반복업무·템플릿에서 사용하는 파트(부서/팀) CRUD
- **API**: `GET/POST /api/parts`, `PUT/DELETE /api/parts/:id`

### F-41. 업무 템플릿
- **화면**: S-17 관리자 > 템플릿
- **설명**: 반복적으로 사용하는 업무 형식 저장. 기간(일수), 담당자 미리 지정. 템플릿으로 업무 즉시 생성
- **API**: `GET/POST /api/templates`, `PUT/DELETE /api/templates/:id`

### F-42. 활동 로그
- **화면**: 관리자 > 활동 로그
- **설명**: 전체 업무 히스토리 조회 (관리자 전용)
- **API**: `GET /api/admin/activity-log`

### F-48. 접속기록 (보안 감사로그)
- **화면**: 관리자 > 접속기록 (`frontend/src/pages/Admin/AuditLog.jsx`)
- **설명**: 로그인/로그아웃을 포함한 보안 이벤트 이력 조회 (관리자 전용). 위·변조 방지를 위해 append-only로만 적재하며, 신용정보법상 접속기록 3년 보관 요건을 충족. 액션·사용자별 필터, "로그인만 보기" 빠른 필터 제공
- **적재 액션**(`AUDIT_ACTION`, `backend/src/config/security.js`): `LOGIN_SUCCESS`, `LOGIN_FAIL`, `LOGOUT`, `ACCOUNT_LOCKED`, `PASSWORD_CHANGE`, `PASSWORD_RESET`, `PII_READ`, `DATA_EXPORT`, `PERMISSION_DENIED`, `DATA_PURGE`, `ANOMALY_DETECTED`
- **기록 항목**: 사용자(삭제돼도 username 스냅샷 유지)·IP·User-Agent·결과(성공/실패)·대상 리소스·상세·일시
- **구현**: `AuditLog` 모델 + `services/auditService.js`(`record`), `authController.finalizeLogin`(로그인)·`logout`(로그아웃)에서 적재. 조회 API는 `routes/admin.js`(`router.use(authenticate, adminOnly)`로 관리자 전용)
- **API**: `GET /api/admin/audit-log` (query: `action`, `userId`, `limit`, `offset`)

### F-43. 앱 설정
- **설명**: 이메일 SMTP 설정, 테마 등 앱 전역 설정을 AppSetting 테이블에 key-value로 관리
- **API**: `GET/PUT /api/settings`

---

## 13. 메모지

### F-47. 개인 메모지
- **화면**: S-18 메모지 (상단 헤더·좌측 레일 진입)
- **설명**: 작성자 본인만 보는 개인 전용 메모. 두 가지 뷰를 사용자가 전환 가능
  - **포스트잇 보드형**: 색깔 카드를 보드 위에 자유 배치(드래그 이동), 위치 저장
  - **심플 사이드 메모형**: 카드 세로 목록
- **부가 기능**: 색상 분류(7색), 상단 고정(핀), 제목(선택)·내용
- **권한**: 본인 메모만 조회·수정·삭제 (createdBy 기준)
- **API**: `GET/POST /api/memos`, `PUT/DELETE /api/memos/:id`

---

## DB 테이블 구조 요약

| 테이블 | 설명 |
|--------|------|
| users | 사용자 계정 (role: admin/member) |
| parts | 파트(부서/팀) |
| tasks | 업무 (소프트 삭제: del_yn) |
| task_assignees | 업무 담당자 (users 참조, PK: taskId+userId) |
| task_extra_assignees | 외부 담당자 (자유 텍스트, users 참조 없음) |
| task_dependencies | 업무 의존 관계 (predecessor→successor) |
| task_comments | 업무 댓글 |
| task_attachments | 업무 첨부파일 |
| task_histories | 업무 변경 이력 |
| task_tags | 업무-태그 N:M |
| tags | 태그 (name unique) |
| notifications | 알림 (due_soon/due_today/overdue) |
| time_entries | 타임 트래킹 |
| calendar_notes | 캘린더 날짜 메모 |
| memos | 개인 메모지 (포스트잇/사이드, 색상·핀·위치) |
| milestones | 마일스톤 |
| recurring_tasks | 반복 업무 정의 (담당자: JSON 컬럼) |
| task_templates | 업무 템플릿 (담당자: JSON 컬럼) |
| app_settings | 앱 설정 key-value |
| wbs_projects | WBS 프로젝트 |
| wbs_project_members | WBS 프로젝트 멤버 (자유 텍스트, users 비참조) |
| wbs_tasks | WBS 작업 (계층 트리, parentId 자기참조) |
| wbs_issues | WBS 이슈사항 (createdBy → users 참조) |
| ledger_categories | 가계부 카테고리 |
| ledger_entries | 가계부 내역 |
| ledger_budgets | 예산 (카테고리+년월 unique) |
| ledger_recurrings | 반복 거래 |
| chat_rooms | 채팅방 |
| chat_room_members | 채팅방 멤버 |
| chat_messages | 채팅 메시지 (스레드: parentId 자기참조) |
| chat_message_reactions | 이모지 리액션 |
| chat_saved_messages | 저장된 메시지 |
| chat_pinned_messages | 핀 고정 메시지 |
| boards | 보드 |
| board_members | 보드 멤버 |
| board_properties | 보드 커스텀 속성 정의 |
| board_cards | 보드 카드 |
| board_property_values | 카드별 커스텀 속성 값 |
| board_card_assignees | 카드 담당자 |
| board_card_links | 카드 외부 링크 |
| board_card_comments | 카드 댓글 |
| board_card_attachments | 카드 첨부파일 |
| board_card_checklists | 카드 체크리스트 |
| board_card_dependencies | 카드 의존 관계 |
| board_automations | 보드 자동화 규칙 |
| playbooks | 플레이북(SOP) 정의 |
| playbook_phases | 플레이북 페이즈 |
| playbook_steps | 플레이북 단계 |
| playbook_runs | 플레이북 실행 인스턴스 |
| run_steps | 런 단계 |
| run_participants | 런 참여자 |
| run_updates | 런 업데이트(노트/알림) |
| run_timeline | 런 타임라인 이벤트 |

---

## 알려진 설계 주의사항

| 항목 | 내용 |
|------|------|
| recurring_tasks.assignee_ids_json | 담당자 ID 목록을 JSON 문자열로 저장 (정규화 미적용, 경량화 목적) |
| task_templates.assignee_ids_json | 동일 패턴 |
| wbs_project_members | users 테이블 참조 없음 — WBS는 외부 인원 포함 가능한 프로젝트 멤버 관리용 |
| board_cards.status/priority | Task enum 미사용, String 저장 — Board가 커스텀 상태를 지원하기 위한 유연한 설계 |
| Notification.task_id | NOT NULL — 업무 연동 알림 전용, 향후 일반 알림 추가 시 nullable 변경 필요 |
