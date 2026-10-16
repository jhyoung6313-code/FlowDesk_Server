# Changelog

All notable changes to this project will be documented in this file.

Format: `[MAJOR.MINOR.PATCH] - YYYY-MM-DD`  
Types: `Added` / `Changed` / `Fixed` / `Removed`

---

## [2.17.1] - 2026-10-16

> v2.16~2.17 코드리뷰(6회차) 조치.

### Added
- **업무 범위 전환**: 새 홈 레이아웃(A·C·E·F)에 "전체 업무 / 내 담당"(내가 담당자이거나 만든 업무) 전환 추가. 기본은 전체(담당자 미지정 업무가 많아 "내 담당"만 보면 빈 화면이 되기 쉬움). 선택은 개인 설정 `home.scope`로 저장. 화면 문구도 범위에 맞게 표시("전체 업무"/"내 담당 업무").
- **업무 상세 딥링크**: `/tasks?taskId=N` 로 들어오면 해당 업무 상세가 열림 (새 홈 화면·알림·내 하루의 업무 클릭이 실제로 상세를 연다).
- **칸반(E) 상태 선택**: 카드마다 "상태" 선택 상자 — 터치·키보드에서도 상태 변경 가능. 드래그/선택 직후 카드가 즉시 새 컬럼에 표시(낙관적 갱신, 실패 시 원위치).
- **레이아웃 로드 실패 복구**: 선택한 홈 레이아웃을 불러오지 못하면 앱 전체 오류 화면 대신 "다시 시도 / 기본 대시보드로" 안내.
- 서버가 `home`(layout·scope)·`nav` 설정 값을 검증(잘못된 값 400).

### Changed
- 로그인: 요청·응답 연출 중에는 "처음부터"를 막아 늦게 도착한 결과가 새 대화에 끼어들거나 성공한 로그인이 되돌려지지 않게 함. 비밀번호 관리자 자동 채움은 **입력한 아이디와 같은 아이디로 채워진 경우에만** 바로 로그인(다른 아이디면 버리고 비밀번호를 물음 — 엉뚱한 계정 잠금 누적 방지). 잠금(423) 뒤 불필요한 재입력 안내 제거, OTP 단계에 "다른 계정으로 로그인", 입력창은 요청 중 `disabled` 대신 읽기 전용(포커스 유지), 알약·칩 글자 대비 개선, 모바일 `dvh` 대응.
- 설정 저장: 전송 실패 시 재시도(3·10·30초), 로그아웃 직전 전송 중인 요청까지 기다림, 서버에 잘못된 `home` 값이 있으면 로컬 값으로 복구, 계정 전환 시 캐시 정리 보완.
- 홈 레이아웃: 재조회 응답 순서 경합 방지, 업무 추가 후 중복 재조회 제거, "오늘 N건"은 마감 오늘·지연 업무만 집계, 집중 타이머를 종료 시각 기준으로(백그라운드 탭에서도 정확), 완료 처리 연타 방지, 완료 컬럼은 최근 완료 순, 클릭 요소 키보드 접근(Enter/Space)·메인 화면 선택 목록 라디오 구조.

---

## [2.17.0] - 2026-10-16

> 로그인 페이지 전면 개편 — 파스텔 대화형.

### Changed
- **로그인 화면을 대화형으로 교체**: 안내 말풍선으로 아이디 → 비밀번호 → OTP(등록 QR 포함) → 입장을 진행하고, 비밀번호 초기화(아이디 → OTP → 새 비밀번호 → 확인)도 같은 대화로 처리. 진행 알약, 입력 중 표시, 오류·중복 로그인(ALREADY_LOGGED_IN) 안내 말풍선, 파스텔 장식 카드. 서버 API·보안 정책 변경 없음.
- 비밀번호 관리자 자동 채움 지원(보이지 않는 실제 로그인 입력창). 비밀번호까지 자동 채워지면 바로 로그인.
- 한글 입력/Caps Lock 경고, `mustChangePassword` → `/profile` 이동, 다른 탭 계정 변경 안내(loginNotice)는 그대로 유지. 비밀번호 변경 강제 시 로그인 직후 `/profile` 이동이 `/`로 덮어써질 수 있던 경합을 제거.
- 화면 버전 표기를 `utils/appVersion.js` 한 곳으로 통합(상태바·로그인 공용).

### Removed
- 이전 로그인 화면(좌측 브랜드 패널 + 탭 폼)과 전용 CSS.

---

## [2.16.0] - 2026-10-16

> 메인(홈) 화면 레이아웃 선택 — 기존 대시보드는 그대로 두고 새 디자인 4종을 선택지로 추가.

### Added
- **메인 화면 레이아웃 선택**: 헤더 테마 팝오버의 "메인 화면"에서 `기본 대시보드`(기존) / **A 커맨드 센터**(다크 벤토) / **C 포커스 모드**(집중 타이머·완료·빠른 메모) / **E 보드 퍼스트**(파스텔 칸반·드래그 상태변경) / **F 데일리 브리프**(에디토리얼) 중 선택. 선택은 개인 설정(`home.layout`)으로 서버에 저장되어 계정·기기별로 유지.
- 새 레이아웃은 기존 API(`/tasks`, `/me/today`, `/mail`, `/bbs`, `/okr`)만 사용 — 서버 변경 없음. 각 레이아웃은 선택 시에만 로드(코드 분할).

### Changed
- 새 레이아웃을 선택하면 상단 요약 바(인사말·업무 통계)를 숨김(레이아웃이 자체 인사말·요약을 가짐). 기본 대시보드는 변경 없음.
- `preferenceStore`: `nav`/`home` 중 바뀐 키만 서버로 전송, 로그아웃 시 함께 초기화.

---

## [2.15.1] - 2026-10-16

> 2.15.0 실브라우저(헤드리스 Edge) 검증에서 발견된 보완.

### Fixed
- **앱 시작 시 일시 오류로 로그아웃되던 문제**: `getMe` 가 속도 제한(429)·네트워크 단절 등으로 실패해도 토큰을 지우고 로그인 화면으로 보내던 것을, 401/403 일 때만 로그아웃하고 그 외에는 최대 3회 재시도하도록 변경.
- **새 위젯이 보이지 않던 문제**: 대시보드에서 추가한 위젯이 맨 아래에 붙어 화면 변화가 없어 보이던 것을, 추가 즉시 맨 위쪽에 배치하도록 변경.
- 하단 상태바 버전 표시가 v2.14.1 로 남아 있던 것을 갱신.

---

## [2.15.0] - 2026-10-16

> 화면 개인화 + 계정 분리 보안 보강 — 레일 메뉴 편집, 대시보드 위젯 카탈로그, 가계부 개인용 전환, 1계정 1로그인.

### Added
- **레일 메뉴 개인화 (F-16)**: 좌측 아이콘 레일의 고정 메뉴를 사용자별로 선택·정렬(`⋯` → 전체 메뉴 20개 / 메뉴 편집). 메일·전자결재 미처리 건수 배지. 개인 설정 저장소 `GET/PUT /api/settings/preferences`(최상위 키 병합, 키 30개·32KB·깊이 6 제한, 사용자별 advisory lock 트랜잭션).
- **대시보드 위젯 카탈로그 (F-16)**: 편집 모드 "+ 위젯"으로 추가 위젯 5종(오늘 한눈에·결재 대기·오늘 회의·내 액션아이템·OKR 진척, 기본 숨김). 로딩/오류 상태 표시, 5분·포커스 시 갱신.
- **1계정 1로그인 (F-57)**: 접속 중인 계정으로의 새 로그인을 거부(409 `ALREADY_LOGGED_IN`). `User.lastActiveAt` 기반 접속 판단(`SESSION_ACTIVE_WINDOW_SEC` 기본 180초), 동시 로그인 원자적 선점, 로그아웃·토큰 만료 시 즉시 해제, 관리자 강제 로그아웃(`PATCH /api/users/:id/force-logout`) 및 사용자 관리 화면 "접속 중" 표시. `SINGLE_LOGIN_BLOCK=false` 로 이전 동작 복원.
- 탭 간 로그인 계정 불일치 방지(`utils/sessionIdentity.js`): 다른 탭에서 계정이 바뀌면 이 탭을 새로고침하고 불일치 상태의 API 요청을 차단.

### Changed
- **가계부 개인용 전환 (F-45)**: 거래·예산·반복거래·요약·내보내기를 소유자 본인만 접근(관리자 포함 타인 불가). 카테고리는 시스템 기본(공용, 관리자만 수정) + 개인 카테고리. `LedgerBudget.userId`, `LedgerCategory.userId` 추가.
- 테마·스킨·밀도 로컬 캐시를 계정별로 분리하고 로그아웃 시 초기화. 로그아웃은 페이지를 새로 불러와 이전 계정의 화면 상태를 모두 비움.
- 알림 스트림(SSE)도 세션 교체·비밀번호 변경 후 옛 토큰을 거부.

### Fixed
- 같은 브라우저에서 계정을 바꾸면 설정 저장·알림이 다른 계정으로 섞이던 문제(공유 `localStorage.token`).
- **보안**: `GET /api/mail/:id`가 참여자 확인 없이 타인 메일(숨은참조 포함)을 반환하던 문제.
- 로그아웃 후 다음 계정에 이전 계정의 메모·채팅 등 화면 데이터가 남던 문제.

### Migration
- `20261015050000_ledger_personal_and_last_active`: `ledger_budgets.user_id`(NOT NULL), `ledger_categories.user_id`, `users.last_active_at`. **가계부 예산 행이 있는 환경은 적용 전 정리/소유자 지정 필요.**
- `.env` 신규 항목: `SINGLE_LOGIN_BLOCK`, `SESSION_ACTIVE_WINDOW_SEC` (`backend/.env.example` 참조).

---

## [2.14.1] - 2026-07-30

> 스킨 시스템(2.14.0) 후속 — 전자결재 결재종류 트리, 업무목록 담당팀 컬럼, 전역 텍스트 크기 통일, 스킨 완성도 보강.

### Added
- **전자결재 결재종류 트리 네비게이션 (F-52)**: 문서함 좌측 2-pane 트리(결재종류→양식, 건수 롤업), 노드 선택 시 목록 필터. `GET /api/approvals/tree`, 목록 API `templateId` 필터. 탭 상단 전체 폭 + 트리·그리드 동일 높이 정렬.
- **업무 목록 담당팀 컬럼**: 제목 셀의 팀 태그를 독립 컬럼으로 분리.

### Changed
- **전역 텍스트 크기 통일**: 인라인 `fontSize`(9~14 혼재)를 본문 13으로 수렴하고, AntD 테이블/Descriptions/Tree 내부 텍스트를 13px로 강제(아이콘·아바타 제외). 위계는 굵기·색으로 표현. `--fd-fs-body/caption` 13, `--fd-fs-title` 15.
- **스킨 AntD 토큰 연결**: `App.jsx`의 `colorBgContainer·colorBgLayout·colorBorder·colorBorderSecondary·lineWidth`를 스킨값에 연결 → 인라인 `token.*`을 쓰는 화면(메일·게시판·전자결재 등)까지 스킨 반영.
- **스킨 자연 모드 자동 전환**: 8종 모두 `mode` 지정(글래스·슬릭=다크, 나머지=라이트) — 선택 시 라이트/다크 자동 전환.
- 셸·칸반·가계부·Chat/Board/WBS/Playbook·메모지 표면/모서리/그림자 스킨 변수화.

### Fixed
- 입력창 이중 테두리 제거, 내부 텍스트 세로 정렬 보정, `Input.Search` 버튼 높이 일치.

---

## [2.14.0] - 2026-07-30

> 화면 전체 디자인을 바꾸는 **디자인 스킨** 시스템 도입. 기존 색상 테마 선택 기능을 대체한다(F-20). 스킨은 형태(모서리·테두리·그림자·표면·폰트)와 강조색·자연 모드를 함께 정의하는 단일 커스터마이즈 축이다.

### Added
- **디자인 스킨 8종**: 기본(노션 웜)·뉴브루탈·클레이·미니멀 모노·아우로라 글래스·소프트 팝·슬릭 다크·페이퍼. 각 스킨 라이트/다크 2벌 + 자연 모드(선택 시 자동 전환).
- `frontend/src/utils/skins.js`: 스킨별 `--fd-sk-*` 변수(모서리·테두리·그림자·표면·레일·KPI) + 강조색 + `mode` 정의, `applySkin()` 주입.
- 헤더 디자인 팝오버에 스킨 갤러리(미니 미리보기) 추가.
- 서버 저장: `settings` 테마 프리퍼런스에 `skin` 필드 추가(`settingsController`).

### Changed
- `store/themeStore.js`: `skin` 축 추가, 강조색을 스킨이 결정, 스킨의 자연 모드로 라이트/다크 자동 전환, localStorage + 서버 저장.
- `App.jsx`: ConfigProvider의 AntD 표면/테두리 토큰(`colorBgContainer`·`colorBgLayout`·`colorBorder`·`colorBorderSecondary`·`lineWidth`·`borderRadius*`)을 현재 스킨값에 연결 → 인라인 `token.*`을 쓰는 화면(메일·게시판·전자결재 등)까지 스킨 자동 반영.
- `index.css`: 전역 AntD 컴포넌트(카드·테이블·버튼·입력·태그·모달)를 `--fd-sk-*`로 구동 + 스킨별 특수 처리(브루탈 하드그림자·클레이 뉴모픽·모노 에디토리얼·글래스 blur·팝 오프셋·페이퍼 세리프).
- 셸(사이드바 레일·헤더·서브헤더·상태바)·대시보드·칸반·가계부·Chat/Board/WBS/Playbook·메모지의 인라인 표면/테두리/모서리/그림자를 스킨 변수로 전환.

### Removed
- **색상 테마 선택 기능**(테마 6종 그리드 + 커스텀 강조색 피커) 제거 — 강조색은 이제 스킨이 담당. `themeStore`의 `setTheme`/`customAccent` 제거.

### Fixed
- 입력창 이중 테두리(affix 래퍼 안쪽 input) 제거.
- 검색·allowClear 입력 내부 텍스트 세로 하단 쏠림 보정.
- `Input.Search` 검색 버튼 높이를 입력창과 일치.

---

## [2.5.0] - 2026-07-10

> 2025~2026 트렌드 반영 4대 신규 도메인 추가 (F-58~F-61). 각 기능은 기존 컨벤션(싱글턴 Prisma, `delYn` 소프트삭제, 감사로그, `RichEditor` 재사용)을 따름. 상세: `FEATURES.md`, 기획: `docs/제안기능_기획서.md`.

### Added
- **F-58 AI 어시스턴트 (Claude API 연동)**: 자연어 → 업무 초안 자동 생성, 최근 7일 주간 업무 요약(마크다운). Anthropic `claude-opus-4-8`, API 키는 `backend/.env`(`ANTHROPIC_API_KEY`) 전용·미설정 시 자동 비활성화. PII 가드(F-56) 사전 차단, 감사로그 `AI_REQUEST`, `ai_usage_logs` 사용량 적재(프롬프트 원문 미저장). 업무관리 헤더·대시보드 진입.
- **F-59 협업 위키/문서**: 스페이스 → 문서(계층 트리) 구조, `RichEditor`(TipTap) 본문, 버전 이력 자동 스냅샷·복원, 문서 댓글, 공개범위(public/private). `/wiki`.
- **F-61 회의 관리**: 안건 → 참석자(RSVP) → 회의록 → 결정사항 → 액션아이템 라이프사이클. 액션아이템 원클릭 업무(F-03) 전환·연결. `/meetings`.
- **F-60 OKR/목표 관리**: 주기(Cycle) · 목표(Objective) · 핵심결과(KR) · 체크인. 진척 자동 계산(KR=`(현재-시작)/(목표-시작)`, Objective=KR 평균), KR↔업무 연결 시 완료율 자동 반영. `/okr`.
- **연계**: 회의록 AI 요약(F-61↔F-58, `POST /meetings/:id/ai-summary`), OKR KR↔업무 연결 UI(자동진척 체크박스 + 연결 모달), 공용 `MarkdownLite` 컴포넌트 추출.

### Changed
- `backend/prisma/schema.prisma`: 위 4개 도메인 모델 추가(마이그레이션 `ai_usage_logs`·`wiki`·`meetings`·`okr`)
- `config/security.js`: 감사 액션 `AI_REQUEST` 추가
- 사이드바(협업/뷰 그룹)·라우트에 위키·회의·OKR 메뉴 추가
- 의존성: `@anthropic-ai/sdk` 추가

---

## [1.9.2] - 2026-06-26

### Added
- **F-48 접속기록(보안 감사로그)**: 관리자 전용 조회 화면(`Admin/AuditLog.jsx`) — 로그인/로그아웃 등 보안 이벤트 이력 표시, 액션·사용자 필터, "로그인만 보기" 빠른 필터, 페이지네이션
  - `authController.logout`에 `LOGOUT` 감사로그 적재 추가 (기존 정의만 있고 미사용이던 `AUDIT_ACTION.LOGOUT` 연결)
  - 조회 API `GET /api/admin/audit-log` (백엔드는 기존부터 `adminOnly`로 보호) — 권한은 백엔드 미들웨어 + 프런트 `<PrivateRoute adminOnly>` + 사이드바 메뉴 조건부 노출로 삼중 방어
  - 기록 항목: 사용자(삭제돼도 username 스냅샷)·IP·User-Agent·결과·대상·상세·일시. append-only(위·변조 방지, 신용정보법 접속기록 3년 보관)

### Changed
- 위 릴리즈 커밋에는 그간 누적된 미커밋 작업이 함께 포함됨 (별도 추적 없이 묶어 커밋):
  - **다크모드 전면 적용**: Ant Design `darkAlgorithm` 연동 + 슬레이트 톤 배경/보더 색상 토큰(페이지<콘텐츠<카드<엘리베이티드 단계 대비)
  - Board/WBS/Playbook/Task/Chat/Dashboard 등 다수 화면 UI 정리 및 공통 컴포넌트(`components/common/`) 도입
  - DB: 업무 댓글/첨부 관련 마이그레이션(`20260624055333_task_comment_attachments`) 추가

---

## [1.9.0] - 2026-05-21

### Added (Playbook 9대 개선)
- **SLA 위반 알림**: in_progress 스텝의 SLA 80%/100% 초과 시 담당자·Owner에게 자동 알림 (15분 주기 cron)
- **런 결과 PDF 리포트**: Run 상세 화면에서 단계·참여자·요약 포함 PDF 다운로드 버튼
- **조건부 분기 흐름**: decision 스텝의 각 옵션에 `nextStepOrder` 지정 → 선택 시 건너뛸 스텝 자동 스킵
- **스텝별 체크리스트**: RunStepChecklist — 각 스텝에 세부 항목 추가/체크/삭제
- **런 실시간 협업**: Socket.IO run 룸 — 스텝 변경·런 상태 변경이 모든 참여자 화면에 즉시 반영
- **플레이북 버전 이력 & 롤백**: 수정 시 자동 스냅샷 저장, 편집기에서 이전 버전으로 롤백 가능
- **런 통계 대시보드**: 상태별·심각도별 런 수, 평균 완료 시간(분), 병목 단계 Top 5 차트
- **병렬 실행 레인**: 스텝에 parallelGroup 번호 지정 → 런 화면에서 같은 그룹 스텝이 가로 나란히 표시
- **외부 웹훅 트리거**: 플레이북별 토큰 기반 웹훅 생성, POST `/api/webhooks/trigger/:token`으로 Run 자동 시작

### Changed
- DB 스키마: Notification(taskId optional, runId/runStepId/message 추가), RunStep(parallelGroup), PlaybookStep(parallelGroup)
- DB 스키마: 신규 테이블 RunStepChecklist, PlaybookVersion, PlaybookWebhook
- NotificationType enum: sla_warning, sla_breach 추가

---

## [1.8.0] - 2026-05-21

### Added
- F-34~F-35: 보드(Board) 시스템 — 칸반/타임라인/테이블/갤러리/캘린더 뷰, 커스텀 속성, 자동화 규칙, 카드 체크리스트·댓글·첨부파일·의존 관계
- F-36~F-37: 플레이북(SOP) 엔진 — 단계별 SOP 절차 정의, 페이즈 그룹화, 런 실행·추적, 타임라인 이벤트 자동 기록
- F-38~F-39: 채팅 시스템 — DM/그룹/공개/비공개 채팅방, 스레드 답글, 이모지 리액션, 메시지 저장·핀 고정 (Socket.IO)
- F-45: 가계부 — 수입/지출 내역, 카테고리·예산 관리, 반복 거래 자동 생성, 월별 통계 차트
- F-33: 업무 지연 표시 — 마감일 경과·미완료 업무 "지연" 배지 (목록/칸반/대시보드 공통)
- F-44: 백업/복원 — 전체 데이터 JSON 백업 다운로드 및 복원

### Changed
- Windows 설치 패키지 추가 (installer/)
- PowerShell 스크립트 한글 인코딩 수정

### Fixed
- 팝업 알림 한글 깨짐 수정

---

## 버전 관리 규칙

```
MAJOR.MINOR.PATCH

MAJOR  큰 아키텍처 변경, 하위 호환 불가 변경
MINOR  새 기능 추가 (하위 호환 유지)
PATCH  버그 수정, 문서·설정 변경
```

### 커밋 메시지 컨벤션

```
feat:  새 기능
fix:   버그 수정
docs:  문서 변경
style: 포맷·공백 (기능 변경 없음)
refactor: 리팩토링
chore: 빌드·설정 변경
```

### 릴리즈 방법

```bash
# 1. CHANGELOG.md 업데이트
# 2. CLAUDE.md 버전 줄 수정
# 3. 커밋
git add CHANGELOG.md CLAUDE.md
git commit -m "chore: release v1.x.x"

# 4. 태그 생성
git tag -a v1.x.x -m "v1.x.x — 변경 요약"

# 5. 태그 확인
git tag --list
```
