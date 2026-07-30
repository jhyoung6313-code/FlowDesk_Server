# Changelog

All notable changes to this project will be documented in this file.

Format: `[MAJOR.MINOR.PATCH] - YYYY-MM-DD`  
Types: `Added` / `Changed` / `Fixed` / `Removed`

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
