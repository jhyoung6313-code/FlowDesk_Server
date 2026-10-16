# PR: feat/m365-gap-features → main

> 제목: **v2.17.1 — M365 격차 기능 8종 · 전자결재 고도화 · 디자인 스킨 · 개인화·계정 분리 · 로그인 개편 · 코드리뷰 조치**
> 규모: 커밋 66개 · 294개 파일 · +23,200 / −3,505 (백엔드 소스 62파일, 프런트 소스 141파일, 백엔드 테스트 37파일)
> 마지막 릴리즈 태그: `v2.17.1` (이 브랜치의 세부 이력은 `CHANGELOG.md` 참고)

## 요약

main 대비 이 브랜치에 쌓인 변경을 영역별로 정리했습니다. 한 번에 보기엔 크므로 **영역별로 나눠 검토**하는 것을 권장합니다.

### 1. 기능 추가
- **M365 격차 기능 8종 (F-62~F-69)**: 범용 자동화 규칙 엔진, AI 질의응답(RAG)·채팅요약, 개인 "내 하루" 홈, 회의 빈시간 찾기, Forms 설문/투표, 민감도 라벨, 통합 문서함, 위키 실시간 공동편집(Yjs).
- **전자결재 고도화 (F-52)**: 결재선 프리셋·드래그 순서, 위임(대결), 리마인더, 일괄 승인, 조건부 결재선 미리보기, 양식 종류별 기본 결재선, 폼 빌더 강화, 결재종류 트리 네비게이션.
- **전역 검색 확장**(게시판·전자결재), **오프라인 한국어 맞춤법 표시**, 하단 상태바, 메일 발신자 삭제.
- **v2.15 개인화**: 좌측 레일 메뉴 편집, 대시보드 위젯 카탈로그, 개인 설정 저장소(`/api/settings/preferences`).
- **v2.16 메인 화면 선택**: 기본 대시보드 + 커맨드 센터·포커스·보드·브리프 4종(기존 화면은 그대로 유지, 선택지로 추가).
- **v2.17 로그인 개편**: 파스텔 대화형 로그인(OTP 등록·인증·비밀번호 초기화 포함).

### 2. 디자인 · 사용성
- 디자인 스킨 8종 시스템(색상 테마 대체), 전역 텍스트 크기 13px 통일, 대시보드 "오늘의 포커스" 리디자인과 사용자 커스터마이즈(위치·크기·표시).

### 3. 보안 · 계정
- **1계정 1로그인**: 접속 중인 계정으로의 새 로그인 거부(409), 로그아웃·토큰 만료 시 즉시 해제, 관리자 강제 로그아웃. (`User.lastActiveAt`)
- **계정 간 설정·알림 혼선 차단**: 다른 탭에서 계정이 바뀌면 자동 새로고침, 로그아웃 시 상태·캐시 초기화.
- **가계부 개인용 전환**(타인 거래·예산·반복거래 접근 불가), **메일 단건 조회 권한 검증**(타인 메일·숨은참조 노출 수정), 알림 스트림 세션 검증.
- 개인정보 안전성 확보조치 점검 조치, PII 외국인번호 탐지 확장, OTP throttle, 비밀번호 재설정 계정 열거 방지, 보안 경보 쿨다운.

### 4. 안정성 · 운영
- 200명 동시접속·폐쇄망 확장(연결 풀, Socket.IO Redis 어댑터 옵션), 백업 복원 누락 컬렉션 11개 복구, 백업 자동 스케줄.
- 코드 리뷰 6회 라운드 조치 — 보고서 `CODE_REVIEW_m365-gap-features.md`, `CODE_REVIEW_feat-widget-home.md`, 검증 SQL `CODE_REVIEW_VERIFY.sql`.
- **e2e 자동 검증(`e2e/`)** 편입, **운영 상시 실행 가이드(`ops/`)**, API 속도 제한 한도 환경설정화.

## 배포 시 필요한 작업 ⚠

**1. DB 마이그레이션 (20개)** — `cd backend && npx prisma migrate deploy`

`20260713014154_add_automation_rules`, `20260713043625_add_forms`, `20260713075915_add_sensitivity`, `20260716064922_add_approval_urgent_duedate`, `20260723033818_add_formtype_linejson`, `20260729005640_add_mail_sender_deleted`, `20260929054405_automation_rule_soft_delete`, `20260930083455_board_member_user_index`, `20261001041105_approval_group_policy`, `20261001041415_drop_template_group_policy`, `20261002003541_approval_fields_snap`, `20261002004620_approval_approver_group`, `20261002005533_approval_reject_reason_category`, `20261002010351_approval_comment_attachment_mention`, `20261002043757_approval_document_history`, `20261002050113_document_hub_favorites_wbs_meta`, `20261002051029_wbs_task_dependencies`, `20261002052627_task_template_sets`, `20261011135155_add_scale_indexes`, **`20261015050000_ledger_personal_and_last_active`**

- 마지막 마이그레이션(가계부 개인화)은 `ledger_budgets.user_id` 를 **NOT NULL** 로 추가합니다. **가계부 예산 행이 있는 환경은 적용 전에 백업 후 정리(또는 소유자 지정)해야 합니다.** (개발 DB는 0건 확인)
- 배포 전 DB 백업을 권장합니다.

**2. `.env` 신규·변경 항목** (`backend/.env.example` 참고)
- `SINGLE_LOGIN_BLOCK=true`, `SESSION_ACTIVE_WINDOW_SEC=180` — 1계정 1로그인
- `DATABASE_URL` 에 `?connection_limit=40&pool_timeout=10` 권장(200명 기준)
- `BACKUP_AUTO_ENABLED / BACKUP_AUTO_CRON / BACKUP_RETENTION_COUNT` — 자동 백업
- `REDIS_URL`(선택) — Socket.IO 수평 확장 시에만
- `API_RATE_LIMIT_MAX / LOGIN_RATE_LIMIT_MAX`(선택) — 프록시·NAT 환경에서 한도 조정
- 운영에서는 `ENFORCE_OTP=true` 유지, 개발용 우회(`DISABLE_OTP`)는 제거

**3. 동작 변경 안내 (사용자 공지 필요)**
- **한 계정으로는 동시에 한 곳에서만 로그인**할 수 있습니다. 창만 닫으면 약 3분 후 다시 로그인되며, 급하면 관리자가 사용자 관리 화면에서 강제 로그아웃할 수 있습니다.
- **로그인 화면이 대화형으로 바뀌었습니다.**
- **가계부는 개인용**이 되어 다른 사람의 거래가 보이지 않습니다.
- 같은 PC에서 **여러 계정을 동시에** 쓰려면 별도 브라우저/프로필(시크릿 창)이 필요합니다.

## 검증

- 백엔드 단위 테스트: **37 스위트 / 438건 통과** (`cd backend && npm test`)
- 프런트 프로덕션 빌드 성공 (`cd frontend && npm run build`)
- **e2e(실제 브라우저·서버·DB)**: `e2e/` — 화면 스위트 4종, API 스위트 2종, OTP 스위트 1종 (`cd e2e && npm install && npm test`)
- 로컬 코드 리뷰(서브에이전트 병렬, 과금 없음) 6회 라운드, 지적 사항 조치 완료. 조치하지 않은 항목과 사유는 보고서 하단에 기록.

## 알려진 한계 · 후속 과제

- 브라우저의 "비밀번호 저장" 프롬프트가 새 로그인(XHR)에서 뜨는지는 환경별 확인이 필요합니다.
- 새 홈 레이아웃은 디자인 스킨·다크 모드와 아직 연동되지 않습니다(자체 색상).
- 업무 목록은 전체를 한 번에 조회합니다(수천 건 이상이면 서버 쪽 범위 필터/페이지 필요).
- 일반 API 속도 제한은 IP당 분당 300회 기본값이며, 프록시/NAT 환경에서는 환경변수로 조정하세요.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
