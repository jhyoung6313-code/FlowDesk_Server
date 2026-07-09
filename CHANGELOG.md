# Changelog

All notable changes to this project will be documented in this file.

Format: `[MAJOR.MINOR.PATCH] - YYYY-MM-DD`  
Types: `Added` / `Changed` / `Fixed` / `Removed`

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
