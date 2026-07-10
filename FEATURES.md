# FlowDesk 기능정의서 v2.1

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
14. [전역 통합 검색](#14-전역-통합-검색) — F-49
15. [통합 알림 인박스 및 @멘션](#15-통합-알림-인박스-및-멘션) — F-50
16. [워크로드 밸런싱](#16-워크로드-밸런싱) — F-51
17. [전자결재](#17-전자결재) — F-52
18. [게시판(BBS)](#18-게시판bbs) — F-53
19. [사내 메일](#19-사내-메일) — F-54
20. [일정 · 공휴일](#20-일정--공휴일) — F-55
21. [개인정보 보호(PII)](#21-개인정보-보호pii) — F-56
22. [보안 강화](#22-보안-강화) — F-57
23. [AI 어시스턴트](#23-ai-어시스턴트) — F-58
24. [협업 위키/문서](#24-협업-위키문서) — F-59
25. [회의 관리](#25-회의-관리) — F-61
26. [OKR / 목표 관리](#26-okr--목표-관리) — F-60

> **[v2.1 변경 요약]** 전자결재·게시판·사내메일·일정·공휴일·개인정보보호·보안강화 도메인 추가(F-52~F-57). 다크모드(구 F-20)는 제거되고 CSS 변수 기반 테마로 대체됨. 조직구조는 파트→부서·팀 2단계로 개편(F-40). 플레이북 예약실행·채팅 예약메시지 확장.

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

### F-20. 컬러 테마 ~~(다크모드)~~
- **[변경]** 다크모드는 제거됨(커밋 `a186692 style: 다크모드 제거`). 현재는 **CSS 변수 기반 라이트 컬러 테마** 방식만 제공
- **설명**: Zustand `themeStore`에 선택 테마 저장, CSS 변수(`--section-card` 등)로 섹션 카드 색상 연동
- **주의**: 문서·코드에 남아있는 "다크모드" 표현은 레거시. Ant Design 다크 알고리즘은 미사용

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
  - **[확장] 예약 실행(PlaybookSchedule)**: 플레이북을 반복 유형(daily/weekly/monthly)·시간·참여자로 예약 자동 실행. `playbook_schedules` 테이블, `controllers/playbookScheduleController.js`
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

### F-40. 부서 · 팀 관리
- **화면**: S-08 관리자 > 부서·팀 (`frontend/src/pages/Admin/Departments.jsx`)
- **설명**: 조직을 **부서(Department) → 팀(Team)** 2단계 구조로 관리. 부서/팀 각각 CRUD하며, 팀은 소속 부서에 종속(부서 삭제 시 소속 팀 cascade 삭제). 업무·반복업무·템플릿의 분류와 사용자 소속, 게시판 수신부서가 이 구조를 사용한다. (기존 "파트"를 대체)
  - 업무/반복업무/템플릿은 **팀** 단위로 분류 (내부 컬럼은 `part_id`를 유지하되 팀을 참조)
  - 사용자는 **부서 + 팀**을 관리자가 지정 (사용자 등록/수정 모달)
- **API**: `GET/POST /api/departments`, `PUT/DELETE /api/departments/:id` · `GET/POST /api/teams`, `PUT/DELETE /api/teams/:id`

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
| users | 사용자 계정 (role: admin/member, 부서·팀 FK: department_id·team_id) |
| departments | 부서 |
| teams | 팀 (부서 종속, department_id) — 업무/반복업무/템플릿 분류에 사용 (구 parts) |
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
| playbook_schedules | 플레이북 예약 실행 정의 (반복 유형·시간·참여자) |
| scheduled_chat_messages | 채팅 예약 메시지 |
| schedule_resources | 일정 자원 (회의실/차량) |
| schedule_events | 일정 (휴가/회의/외근/차량 등, 날짜 단위) |
| schedule_event_assignees | 일정 대상자 N:M |
| holidays | 공휴일 (임시/대체/법정, 관리자 등록) |
| bbs_categories | 게시판 카테고리 (트리, 쓰기권한, 대시보드 노출) |
| user_dashboard_bbs_categories | 사용자별 대시보드 노출 게시판 선택 |
| bbs_posts | 게시글/공문 (발신기관·시행일·수신부서, 소프트 삭제) |
| bbs_comments | 게시판 댓글 (대댓글 트리) |
| bbs_attachments | 게시판 첨부 (게시글/댓글) |
| approval_form_types | 결재양식종류 (트리 분류) |
| approval_templates | 결재양식 (입력필드·기본결재선 정의) |
| approval_documents | 결재문서 (상태·문서번호·소프트 삭제) |
| approval_doc_seq | 문서번호 채번 (양식코드+연도별 시퀀스) |
| approval_steps | 결재단계 (결재자·직위·서명 스냅샷) |
| approval_attachments | 결재 첨부 |
| approval_comments | 결재 의견/댓글 |
| internal_mails | 사내 메일 (스레드·답장·전달) |
| internal_mail_recipients | 메일 수신자별 상태 (읽음/별표/폴더) |
| internal_mail_labels | 메일 라벨 (사용자별 색상) |
| internal_mail_label_links | 메일-라벨 N:M |
| internal_mail_comments | 메일 코멘트 |
| internal_mail_attachments | 메일 첨부 |
| pii_block_logs | 개인정보 입력차단 검출로그 (마스킹본만) |
| password_histories | 비밀번호 재사용 금지 이력 |
| ai_usage_logs | AI 어시스턴트 호출 사용량/비용 (F-58, append-only, 프롬프트 원문 미저장) |
| wiki_spaces | 위키 스페이스 (F-59, 공개범위 public/private) |
| wiki_docs | 위키 문서 (계층 트리 parentId, HTML 본문, 소프트 삭제) |
| wiki_doc_versions | 위키 문서 버전 이력 (본문 변경 시 자동 스냅샷) |
| wiki_doc_comments | 위키 문서 댓글 (소프트 삭제) |
| meetings | 회의 (F-61, 상태·회의록 HTML, 소프트 삭제) |
| meeting_agenda | 회의 안건 (순서·발표자·소요시간) |
| meeting_attendees | 회의 참석자 (내부/외부, 역할, RSVP) |
| meeting_decisions | 회의 결정사항 |
| meeting_action_items | 회의 액션아이템 (담당자·기한·상태, taskId 업무 연결) |
| okr_cycles | OKR 주기 (F-60, 분기/연간) |
| objectives | 목표 (범위·책임자·상태·진척, KR 평균 자동) |
| key_results | 핵심결과 (측정유형·시작/목표/현재값·autoProgress) |
| key_result_links | KR↔업무 연결 (autoProgress 계산용) |
| key_result_checkins | KR 체크인 이력 (값·신뢰도·코멘트) |

---

## 14. 전역 통합 검색

### F-49. Command Palette (Ctrl+K)
- **화면**: 어느 페이지에서나 오버레이 팔레트
- **단축키**: `Ctrl+K` (Mac: `Cmd+K`), 헤더 검색 버튼 클릭
- **검색 대상**: 업무·보드카드·메모·플레이북·WBS프로젝트·채팅메시지 동시 검색
- **UX**: 250ms 디바운스, 그룹별 결과, ↑↓ 키보드 네비게이션, Enter로 해당 페이지 이동
- **API**: `GET /api/search?q=...&limit=8`
- **파일**: `backend/src/controllers/searchController.js`, `frontend/src/components/common/CommandPalette.jsx`

---

## 15. 통합 알림 인박스 및 @멘션

### F-50. @멘션 알림
- **트리거**: 업무 댓글에 `@표시명` 또는 `@아이디` 입력 시 해당 사용자에게 실시간 알림(SSE)
- **알림 타입**: `mention` — 알림 팝업·인박스에 '멘션' 태그(마젠타)로 구분
- **클릭 이동**: 알림 클릭 시 해당 업무 페이지로 자동 이동
- **댓글 입력**: TaskForm 댓글창이 `Mentions` 컴포넌트로 대체 — `@` 입력 시 사용자 자동완성
- **API**: `POST /api/tasks/:id/comments` (기존 엔드포인트, 멘션 파싱 내부 처리)
- **서비스**: `backend/src/services/mentionService.js`
- **DB**: `notifications.actor_id`, `notifications.link`, `notifications.type='mention'` 필드 추가

---

## 16. 워크로드 밸런싱

### F-51. 워크로드 대시보드
- **화면**: `/workload` — 사이드바 '워크로드' 메뉴
- **설명**: 멤버별 진행 중 업무 수·우선순위·지연 현황을 카드 형태로 시각화
- **부하 등급**: idle(0건) / normal / warning(기본 ≥5건) / overload(기본 ≥8건)
- **요약 배너**: 과부하·여유 멤버 이름을 상단에 표시, 업무 배정 대상 추천
- **정렬**: 부하순 / 이름순 전환
- **클릭**: 카드 클릭 시 해당 담당자 필터가 적용된 업무 페이지로 이동
- **임계치**: `.env`의 `WORKLOAD_OVERLOAD_THRESHOLD`로 조정 (기본 8)
- **API**: `GET /api/users/workload`
- **파일**: `backend/src/controllers/userController.js` (workload), `frontend/src/pages/Workload/index.jsx`

---

## 17. 전자결재

### F-52. 전자결재 (결재양식 · 결재선 · 상신/승인 워크플로)
- **화면**: `/approvals`(문서함), `/approvals/new`·`/approvals/:id/edit`(작성), `/approvals/:id`(상세), `admin/approval`(양식·양식종류 관리)
- **개념 구조**: 결재양식종류(ApprovalFormType, 트리) → 결재양식(ApprovalTemplate) → 결재문서(ApprovalDocument) → 결재단계(ApprovalStep)
- **결재양식종류**: 아이콘·색상·정렬을 가진 계층(parentId) 분류. 관리자 CRUD·순서변경
- **결재양식(Template)**: 동적 입력필드 정의(`fieldsJson`), 기본 결재선(`lineJson`), 문서번호 코드(`code`, 기본 DOC)
- **결재문서(Document)**: 양식 기반 작성. 상태 draft/pending/approved/rejected/cancelled, `currentStep`/`totalSteps` 진행 추적, 자동 문서번호(`docNo`, `ApprovalDocSeq`로 양식코드+연도별 채번), 소프트 삭제(`delYn`), 첨부·댓글
- **결재선(Step)**: 순번(stepOrder)·결재자(approverId)·유형(approval)·상태(pending/approved/rejected/skipped). 결재 시 **결재자 직위·서명이미지·서명 IP·대결(actingType) 스냅샷** 저장 (User.`position`·`signImagePath` 활용)
- **워크플로 API**: `submit`(상신)·`approve`(승인)·`reject`(반려)·`cancel`(취소)·`resubmit`(재상신)·`resume`(반려 후 재개)
- **결재선 자동 해석**: `services/approvalLine.js` — 양식의 lineJson을 실제 결재자로 치환(`resolve-line`)
- **API**:
  - 양식종류: `GET/POST /api/approval-types`, `PUT /api/approval-types/reorder`, `PUT/DELETE /api/approval-types/:id`
  - 양식: `GET /api/approval-templates(/:id)`, `POST/PUT/DELETE /api/approval-templates(/:id)`, `GET/POST /api/approval-templates/:id/resolve-line`
  - 문서: `GET /api/approvals/pending-count`, `GET/POST /api/approvals`, `GET/PUT/DELETE /api/approvals/:id`, `POST /api/approvals/:id/{submit,approve,reject,cancel,resubmit,resume}`
  - 첨부: `POST /api/approvals/:id/attachments`, `GET /api/approvals/:id/attachments/:aid/download`, `DELETE /api/approvals/:id/attachments/:aid`
  - 댓글: `GET/POST /api/approvals/:id/comments`, `PUT/DELETE /api/approvals/:id/comments/:cid`
- **파일**: `controllers/approvalController.js`·`approvalTemplateController.js`·`approvalFormTypeController.js`, `services/approvalLine.js`, `routes/approvals.js`, `pages/Approval/*`, `pages/Admin/ApprovalAdmin.jsx`

---

## 18. 게시판(BBS)

### F-53. 게시판 (공지 · 공문)
- **화면**: `/bbs`, `admin`(카테고리 관리는 게시판 내부/관리자)
- **카테고리(BbsCategory)**: 아이콘·색상·계층(parentId)·정렬. 쓰기권한(`writeRole`, 기본 all), 대시보드 노출(`showOnDashboard`) 설정
- **대시보드 위젯 연동**: 사용자별로 대시보드에 표시할 카테고리 선택(`UserDashboardBbsCategory`). `GET/PUT /api/bbs-categories/dashboard`
- **게시글(BbsPost)**: 제목·내용, **공문 필드**(발신기관 `senderOrg`, 공문 시행일 `officialDueDate`, 수신부서 `recipientDepts[]`), 상단고정(pin), 조회수, 소프트 삭제(delYn)
- **댓글(BbsComment)**: 대댓글(parentId 트리), 소프트 삭제, 첨부 가능
- **첨부(BbsAttachment)**: 게시글·댓글 첨부(commentId 분리), multer 저장, 다운로드
- **API**:
  - 카테고리: `GET/POST /api/bbs-categories`, `GET/PUT /api/bbs-categories/dashboard`, `PUT /api/bbs-categories/reorder`, `PUT/DELETE /api/bbs-categories/:id`
  - 게시글: `GET/POST /api/bbs`, `GET/PUT/DELETE /api/bbs/:id`, `PUT /api/bbs/:id/pin`
  - 댓글: `GET/POST /api/bbs/:id/comments`, `PUT/DELETE /api/bbs/:id/comments/:cid`
  - 첨부: `POST /api/bbs/:id/attachments`, `GET /api/bbs/:id/attachments/:aid/download`, `DELETE /api/bbs/:id/attachments/:aid`
- **파일**: `controllers/bbsPostController.js`·`bbsCategoryController.js`, `routes/bbs.js`, `pages/BBS/*`

---

## 19. 사내 메일

### F-54. 사내 메일 (내부 메일함)
- **화면**: `/mail`(메일함 + 상세 + 작성 모달 + 라벨 관리), `/chat-popup`(팝업)
- **메일(InternalMail)**: 제목·본문, 임시보관(isDraft), 중요도(normal/urgent), 답장·전달 원본(parentId·forwardedFrom), 대화 스레드(threadId)
- **수신자(InternalMailRecipient)**: 수신유형(to/cc/bcc), 읽음(isRead/readAt), 별표(isStarred), 폴더(inbox/trash), 소프트 삭제(deletedAt) — 수신자별 상태 개별 관리
- **라벨(InternalMailLabel)**: 사용자별 색상 라벨 + 메일 연결(InternalMailLabelLink)
- **기능**: 발송·회신·전달, 별표 토글, 읽음 처리, 라벨 지정, 첨부(다운로드), 메일별 코멘트, 일괄처리, 휴지통 비우기, 안읽음 카운트
- **API** (기본 마운트 `/api/mail`):
  - `GET /api/mail`, `POST /api/mail`(임시저장/작성), `GET/PUT/DELETE /api/mail/:id`
  - `GET /api/mail/unread-count`, `DELETE /api/mail/trash`(휴지통 비우기), `POST /api/mail/bulk`(일괄)
  - `POST /api/mail/:id/{send,reply,forward}`, `PATCH /api/mail/:id/{star,read}`, `PUT /api/mail/:id/labels`
  - 라벨: `GET/POST /api/mail/labels`, `PUT/DELETE /api/mail/labels/:id`
  - 첨부: `POST /api/mail/:id/attachments`, `GET /api/mail/:id/attachments/:aid/download`, `DELETE /api/mail/:id/attachments/:aid`
  - 코멘트: `GET/POST /api/mail/:id/comments`, `DELETE /api/mail/:id/comments/:cid`
- **파일**: `controllers/mailController.js`, `routes/mail.js`, `pages/Mail/*`(index·MailDetail·ComposeModal·LabelManager), `pages/ChatPopup`

---

## 20. 일정 · 공휴일

### F-55. 일정(스케줄) · 자원 예약 · 공휴일
- **화면**: 대시보드 주간 일정·자원 위젯 + 월간 캘린더 (메모리 `schedule-feature.md` 참조)
- **자원(ScheduleResource)**: 회의실(room)/차량(vehicle) 등 예약 대상. 이름·설명(정원/차종/번호판)·정렬·활성화
- **일정(ScheduleEvent)**: 유형(휴가/반차/회의/외근/출장/재택/차량 등), 기간(startDate~endDate, 날짜 단위), 종일/시간(allDay·startTime·endTime), 장소, 메모, 자원 연결(resourceId), 공개 범위(visibility: public/shared/private)
- **대상자(ScheduleEventAssignee)**: 타인 다중 지정 가능 (일정의 주체 — 본인 외 팀원 일정 등록)
- **공유자(ScheduleEventShare)**: 주체는 아니지만 열람/알림 대상. `visibility='shared'`일 때만 지정. 지정 시 대상자에게 `schedule_shared` 알림 발송. `visibility='public'`(전체 공개)/`shared`(대상자·공유자만)/`private`(대상자·작성자만)에 따라 조회 필터(관리자는 전체 열람)
- **공유 범위(ScheduleEventShareScope)**: 개인 외에 **부서/팀 단위 공유**(kind='dept'|'team'). 소속 인원 변동을 자동 반영(조회 시 요청자 소속 부서·팀으로 필터, 알림은 소속원으로 확장). 개인·부서·팀 공유는 함께 지정 가능
- **공휴일(Holiday)**: 임시공휴일/대체공휴일/법정 등 관리자 등록(내장 기본 공휴일을 덮어씀). 캘린더·간트·일정에 반영
- **API**:
  - 일정: `GET/POST /api/schedules`, `PUT/DELETE /api/schedules/:id`
  - 자원: `GET/POST /api/schedules/resources`, `PUT/DELETE /api/schedules/resources/:id`
  - 공휴일: `GET/POST /api/holidays`, `DELETE /api/holidays/:id`
- **파일**: `controllers/scheduleController.js`·`holidayController.js`, `routes/schedules.js`·`holidays.js`

---

## 21. 개인정보 보호(PII)

### F-56. 개인정보 입력 차단 · 검출로그 · 직무분리
- **입력 차단(piiGuard)**: 요청 본문에서 **주민등록번호·신용카드번호·계좌번호·연락처** 등 PII 패턴을 탐지하면 저장 전에 차단. 미들웨어 `middlewares/piiGuard.js` + `services/piiBlockService.js`
- **검출로그(PiiBlockLog)**: 차단 이벤트를 append-only로 적재. **원문은 저장하지 않고 마스킹본(부분 비식별)만 보관**. 사용자·IP·User-Agent·엔드포인트·PII유형·필드경로 기록(사용자 삭제돼도 username 스냅샷 유지)
- **직무분리(권한 레지스트리)**: role(admin/member)과 무관하게 `User.permissions[]` 집합으로 세밀 권한 부여. 검출로그 열람은 **`PII_AUDIT` 권한 보유자만** 가능(`middlewares/requirePermission.js`) → 시스템 관리자와 감사자 분리
- **화면**: `pii-audit`(검출내역 조회, `pages/Admin/PiiBlockLog.jsx`)
- **API**: `GET /api/pii-blocks` (권한: `PII_AUDIT`, query: `piiType`, `userId`, `limit`, `offset` — 마스킹본만 반환)
- **파일**: `middlewares/piiGuard.js`·`requirePermission.js`, `services/piiBlockService.js`, `routes/piiBlocks.js`, `pages/Admin/PiiBlockLog.jsx`

---

## 22. 보안 강화

### F-57. 세션 · 비밀번호 · 이상탐지 · 보관정책
- **단일 세션 강제**: `User.sessionNonce`로 최신 로그인만 유효. 다른 기기/탭에서 로그인 시 이전 세션 무효화(커밋 `89c0375 feat: 단일 세션 강제`)
- **비밀번호 재사용 금지**: `PasswordHistory`에 과거 해시 이력 저장, 변경 시 재사용 차단
- **비밀번호 정책 단일화**: `config/security.js`의 `PASSWORD` + `utils/passwordPolicy.js`가 단일 기준(최소 8자·문자종류 4종 중 3종 이상, `.env` 조정). 신규/변경/재설정/관리자 계정생성 모두 `validateFormat` 사용
- **이상징후 탐지**: `services/anomalyService.js` — 비정상 접근 패턴 감지 시 감사로그(`ANOMALY_DETECTED`) 적재
- **보관정책(retention)**: `services/retentionService.js` — 감사로그 등 로그 보관기간 관리(접속기록 3년 요건, F-48 연계)
- **보안설정 서비스**: `services/securitySettingsService.js` — 보안 관련 앱 설정 로드
- **감사로그(F-48 연계)**: 로그인/로그아웃·비밀번호변경·권한거부·PII읽기·데이터내보내기·데이터삭제·이상징후 등 `AUDIT_ACTION` 적재
- **파일**: `services/anomalyService.js`·`retentionService.js`·`securitySettingsService.js`·`auditService.js`, `config/security.js`, `utils/passwordPolicy.js`

---

## 23. AI 어시스턴트

### F-58. AI 어시스턴트 (Claude API 연동) — 업무 자동 생성 · 주간 요약
- **개요**: Anthropic Claude API(`claude-opus-4-8`)를 백엔드에서 호출해 축적된 업무 데이터를 활용. **API 키는 `backend/.env`(`ANTHROPIC_API_KEY`)에만 보관**하고 클라이언트에 노출하지 않는다(백엔드 프록시 전용). 키 미설정 시 AI 기능은 자동 비활성화되고 프론트 버튼도 숨겨진다(`GET /api/ai/status`).
- **업무 자동 생성**: 자연어 요청 → 실행 가능한 업무 초안 배열(제목·설명·우선순위·기한·담당자 후보) 반환. 담당자는 이름 정확 일치로 **후보만 제시**(자동 배정 금지). 사용자가 검토·수정 후 기존 업무 생성 API로 등록. 구조화 출력(`output_config.format` json_schema) 사용.
- **주간 요약**: 최근 7일간 갱신·마감 업무를 집계해 마크다운 리포트 생성(핵심요약·완료·진행중·지연·제언). 스코프 `me`(본인)/`all`(관리자 전용, 팀 전체).
- **PII 보호(F-56 연계)**: AI 요청 본문은 전역 `piiGuard` 미들웨어가 사전 스캔·차단.
- **감사·사용량**: 모든 호출을 감사로그 `AI_REQUEST`(F-48)로 적재. `AiUsageLog`(ai_usage_logs)에 모델·토큰수·성공여부 집계 적재(프롬프트 원문 미저장).
- **화면**: 업무 관리(S-03) 헤더 "AI 업무 생성" 버튼 → 초안 검토 모달. 대시보드(S-02) 업무 보드 헤더 "AI 주간 요약" 버튼.
- **API** (마운트 `/api/ai`, 인증 필요):
  - `GET /api/ai/status` — AI 설정 여부·모델
  - `POST /api/ai/tasks/generate` — { prompt } → { tasks: [...] }
  - `POST /api/ai/summary` — { scope, from?, to? } → { summary, stats, period }
- **파일**: `backend/src/services/aiService.js`, `controllers/aiController.js`, `routes/ai.js`; `frontend/src/api/ai.js`, `components/ai/AiTaskGenerator.jsx`·`AiWeeklySummary.jsx`
- **미구현(후속 F-58 확장 후보)**: 채팅/회의 요약, 시맨틱 검색, 결재·메일 초안 보조 (기획: `docs/제안기능_기획서.md`)

---

## 24. 협업 위키/문서

### F-59. 협업 위키/문서 (팀 지식베이스)
- **개요**: 팀 지식베이스·회의록·매뉴얼을 **스페이스 → 문서(트리)** 구조로 작성·공유. 개인 메모지(F-47)와 달리 팀 공유·버전·댓글을 갖춘다. 본문은 기존 `RichEditor`(TipTap) HTML로 저장.
- **스페이스(WikiSpace)**: 위키 최상위 묶음. 공개범위 `public`(전원)/`private`(작성자·관리자). 이름·아이콘·색상.
- **문서(WikiDoc)**: 스페이스 내 계층 트리(`parentId` 자기참조). 제목·본문(HTML)·즐겨찾기·정렬. 소프트 삭제(delYn, 하위 문서 동반 삭제).
- **버전 이력(WikiDocVersion)**: 본문 변경 시 직전 상태를 자동 스냅샷(최근 50건). 목록에서 특정 버전으로 **복원**(복원 전 현재본도 버전으로 보존).
- **댓글(WikiDocComment)**: 문서별 댓글, 소프트 삭제, 작성자·관리자만 삭제.
- **접근 제어(MVP)**: 스페이스 공개범위 기준(public 전원 / private 작성자·관리자). 접근 가능한 스페이스의 문서는 팀원이 편집 가능.
- **화면**: `/wiki` — 좌측 스페이스·문서 트리 사이드바 + 우측 문서 뷰/편집(제목·리치에디터·댓글) + 변경 이력 드로어. 사이드바 '위키' 메뉴(협업 그룹).
- **API** (마운트 `/api/wiki`, 인증 필요):
  - 스페이스: `GET/POST /api/wiki/spaces`, `PUT/DELETE /api/wiki/spaces/:id`
  - 문서: `POST /api/wiki/docs`, `GET/PUT/DELETE /api/wiki/docs/:id`
  - 버전: `GET /api/wiki/docs/:id/versions`, `POST /api/wiki/docs/:id/versions/:vid/restore`
  - 댓글: `GET/POST /api/wiki/docs/:id/comments`, `DELETE /api/wiki/docs/comments/:cid`
- **파일**: `backend/src/controllers/wikiController.js`·`routes/wiki.js`; `frontend/src/api/wiki.js`, `pages/Wiki/index.jsx`(RichEditor 재사용)
- **미구현(후속 확장 후보)**: 부서/팀 단위 세밀 권한, 블록 단위 인라인 코멘트, 실시간 공동 편집, 문서 간 `[[링크]]`·전역검색 색인 (기획: `docs/제안기능_기획서.md` F-59)

---

## 25. 회의 관리

### F-61. 회의 관리 (안건 · 회의록 · 결정사항 · 액션아이템)
- **개요**: 회의의 **안건 → 참석자(RSVP) → 회의록 → 결정사항 → 액션아이템** 라이프사이클 관리. 액션아이템은 원클릭으로 업무(F-03)로 전환·연결. 회의록 본문은 `RichEditor`(TipTap) HTML로 저장.
- **회의(Meeting)**: 제목·일시(start/end)·장소·주최자·상태(scheduled/in_progress/done/cancelled)·회의록(minutes)·요약(summary, AI 연계 예비). 소프트 삭제(delYn). 수정 권한은 주최자·관리자.
- **안건(MeetingAgenda)**: 순서·제목·발표자·소요시간(분). 회의 생성/수정 시 목록 교체.
- **참석자(MeetingAttendee)**: 내부(userId)/외부(extName), 역할(organizer/attendee/optional), **RSVP**(invited/accepted/declined/attended/absent). 주최자는 자동 포함. 본인 RSVP는 `PATCH .../rsvp`로 응답.
- **결정사항(MeetingDecision)**: 회의별 결정 기록 추가/삭제.
- **액션아이템(MeetingActionItem)**: 내용·담당자·기한·상태(open/done). **업무 전환**(`to-task`) 시 Task 생성·담당자 연결·`taskId` 링크(중복 전환 방지).
- **화면**: `/meetings` — 좌측 회의 목록(내 회의/예정/지난 필터) + 우측 상세(개요·RSVP·참석자·안건·회의록 편집·결정사항·액션아이템). 사이드바 '회의' 메뉴(협업 그룹).
- **API** (마운트 `/api/meetings`, 인증 필요):
  - 회의: `GET /api/meetings?filter=mine|upcoming|past`, `POST /api/meetings`, `GET/PUT/DELETE /api/meetings/:id`
  - RSVP: `PATCH /api/meetings/:id/rsvp`
  - 결정사항: `POST /api/meetings/:id/decisions`, `DELETE /api/meetings/:id/decisions/:did`
  - 액션아이템: `POST/PUT/DELETE /api/meetings/:id/action-items(/:aid)`, `POST /api/meetings/:id/action-items/:aid/to-task`
- **파일**: `backend/src/controllers/meetingController.js`·`routes/meetings.js`; `frontend/src/api/meetings.js`, `pages/Meetings/index.jsx`
- **미구현(후속 확장 후보)**: 자원/일정(F-55) 연동, AI 회의록 요약(F-58), 회의록 메일 배포(F-54), 반복 회의 (기획: `docs/제안기능_기획서.md` F-61)

---

## 26. OKR / 목표 관리

### F-60. OKR / 목표 관리 (Objective · Key Result · 체크인)
- **개요**: 분기·연간 목표(Objective)와 핵심결과(Key Result)를 정의하고 진척을 자동 집계. 회사→부서/팀→개인 계층으로 목표 정렬.
- **주기(OkrCycle)**: 연도·분기(예: 2026 Q3)·기간·활성여부. 관리자만 생성/삭제.
- **목표(Objective)**: 주기 소속, 상위 목표 정렬(parentId), 범위(company/dept/team/personal), 책임자, 상태(on_track/at_risk/off_track), 진척률(KR 평균 자동). 소프트 삭제. 수정 권한: 책임자·관리자.
- **핵심결과(KeyResult)**: 측정 유형(number/percent/boolean), 시작값·목표값·현재값, 담당자, **autoProgress**(연결 업무 완료율로 현재값 자동 갱신).
- **진척 계산**: KR = `(현재-시작)/(목표-시작)` 0~100 클램프(boolean은 목표 도달 시 100). Objective = 소속 KR 평균. 체크인/수정/연결 시 자동 재계산.
- **체크인(KeyResultCheckin)**: 주기적 현재값·신뢰도(1~10)·코멘트 기록(이력), 기록 시 KR 현재값 갱신.
- **업무 연결(KeyResultLink)**: KR↔업무(task) 연결. autoProgress KR은 연결 업무 완료율로 진척 자동화.
- **화면**: `/okr` — 주기 선택 + 주기 전체 진척 배너 + 목표 카드(진척바·상태·KR 리스트·체크인). 사이드바 'OKR' 메뉴(뷰 그룹).
- **API** (마운트 `/api/okr`, 인증 필요):
  - 주기: `GET /api/okr/cycles`, `POST /api/okr/cycles`(관리자), `DELETE /api/okr/cycles/:id`(관리자)
  - 트리: `GET /api/okr/tree?cycleId=`
  - 목표: `POST /api/okr/objectives`, `PUT/DELETE /api/okr/objectives/:id`
  - KR: `POST /api/okr/objectives/:objId/key-results`, `PUT/DELETE /api/okr/key-results/:krId`
  - 체크인: `GET/POST /api/okr/key-results/:krId/checkins`
  - 연결: `POST /api/okr/key-results/:krId/links`, `DELETE .../links/:linkId`
- **파일**: `backend/src/controllers/okrController.js`·`routes/okr.js`; `frontend/src/api/okr.js`, `pages/Okr/index.jsx`
- **미구현(후속 확장 후보)**: 목표 정렬(alignment) 트리 시각화, 보드카드·WBS 연결, 진척 히트맵 대시보드 (기획: `docs/제안기능_기획서.md` F-60)

---

## 알려진 설계 주의사항

| 항목 | 내용 |
|------|------|
| recurring_tasks.assignee_ids_json | 담당자 ID 목록을 JSON 문자열로 저장 (정규화 미적용, 경량화 목적) |
| task_templates.assignee_ids_json | 동일 패턴 |
| wbs_project_members | users 테이블 참조 없음 — WBS는 외부 인원 포함 가능한 프로젝트 멤버 관리용 |
| board_cards.status/priority | Task enum 미사용, String 저장 — Board가 커스텀 상태를 지원하기 위한 유연한 설계 |
| Notification.task_id | NOT NULL — 업무 연동 알림 전용, 향후 일반 알림 추가 시 nullable 변경 필요 |
