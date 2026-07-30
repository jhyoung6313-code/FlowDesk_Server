# FlowDesk 기능 점검 · 테스트 보강 리포트

작성일: 2026-07-24 · 대상 브랜치: `feat/m365-gap-features`

전체 기능(F-01~F-69)을 컨트롤러 단위로 점검하고, 미커버 도메인에 단위 테스트를 신규 작성했다.
테스트는 기존 패턴(Prisma `jest.mock` 모킹, DB 불필요)을 따른다.

## 1. 테스트 실행 결과

| 항목 | 값 |
|------|-----|
| 전체 스위트 | 31 passed (기존 10 + 신규 21) |
| 전체 테스트 | **313 passed** (기존 103 + 신규 210) |
| 실행 | `cd backend && npm test` (PowerShell은 PATH에 `C:\Program Files\nodejs` 선행 필요) |

### 신규 작성 테스트
| 파일 | 도메인(F-번호) | 검증 포인트 |
|------|----------------|-------------|
| `__tests__/approval.test.js` (21) | 전자결재 F-52 | 상신/승인/반려 순차·병렬·전결(delegation) 흐름, 문서번호 채번, rejectedStep 기록, 부분 재상신(resume), 위임 검증, 열람 권한, **첨부 다운로드 인가(회귀)** |
| `__tests__/okr.test.js` (9) | OKR F-60 | 진척률 계산(percent/boolean/클램프), Objective 재계산, 주기 관리자 권한, 체크인 값 반영 |
| `__tests__/meeting.test.js` (9) | 회의 F-61 | 생성 검증·주최자 자동참석·중복제거, RSVP, 액션아이템→업무 전환(중복 전환 가드) |
| `__tests__/mail.test.js` (9) | 메일 F-54 | 발송 검증, 스레드 연결(답장), 참여자 댓글 권한, 일괄 처리 |
| `__tests__/bbs.test.js` (11) | 게시판 F-53 + 민감도 F-67 | 기밀 열람 게이트, 목록 민감도 필터, writeRole, 수정 권한, **첨부 다운로드 기밀 게이트(회귀)** |
| `__tests__/schedule.test.js` (12) | 일정·자원 F-55 | 공개범위 필터, 생성 검증(type/기간), 권한, 자원 생성 검증 |
| `__tests__/chat.test.js` (10) | 채팅 F-38/39 | 멤버십 게이트, DM 중복방지, 전달 시 비멤버 방 제외, 메시지 소유권, **검색 멤버 방 제한(회귀)** |
| `__tests__/ledger.test.js` (7) | 가계부 F-45 | 거래/예산 검증, 카테고리 삭제 가드, 반복거래 중복방지·월말보정, 요약 잔액 |
| `__tests__/playbookRun.test.js` (7) | 플레이북 F-36/37 | 런 생성 시 스텝 복사·`{{변수}}` 치환, 조건분기 스킵, 전체완료 자동종료, 담당자 검증, 삭제 권한 |
| `__tests__/wbs.test.js` (7) | WBS F-13/14 | 작업 생성 검증·진척 클램프(0~100)·level/order 계산, 이슈 생성 검증 |
| `__tests__/board.test.js` (7) | 보드 F-34/35 | 생성 검증·멤버/역할 부여, 접근(멤버) 게이트, 수정(owner 이상) 권한 |
| `__tests__/automationEngine.test.js` (24) | 자동화 F-62 | 조건 연산자 전체, 템플릿 렌더, emit 흐름(조건 스킵·notify·create_task·오류 격리·구스키마 안전) |
| `__tests__/approvalLine.test.js` (9) | 결재선 F-52 | evalCondition 연산자, 프리셋 해석(고정/직급규칙/scope/조건필터/formType 폴백) |
| `__tests__/pii.test.js` (14) | 개인정보 F-56 | 주민/카드/연락처/계좌 탐지, 날짜·이메일·02번호 오탐 방지, 재귀 scan, piiGuard 400 차단 |
| `__tests__/search.test.js` (4) | 통합검색 | 게시판 기밀 게이트·결재 참여자 제한 |
| `__tests__/wiki.test.js` (9) | 위키 F-59/67 | 스페이스 접근·기밀 문서 트리 제외, 열람 게이트, 본문 변경 시 버전 스냅샷 |
| `__tests__/notification.test.js` (3) | 알림 | 목록 필터(삭제 업무 제외), 읽음=소프트삭제, 전체읽음 |
| `__tests__/backup.test.js` (5) | 백업/복원 F-44 | 복호화 검증, **복원 범위 특성화(누락 결함 고정)** |
| `__tests__/securitySettings.test.js` (7) | 보안강화 F-57 | buildUpserts 범위검증·화이트리스트, refresh 오버라이드 반영 |
| `__tests__/authFlow.test.js` (8) | 인증 F-01/11 | OTP 2단계 검증, 비번 재설정 흐름·재사용 금지·잠금 해제 |
| `__tests__/board.test.js` (+3) | 보드 F-35 | **카드 의존성 순환 방지(신규)** |
| `__tests__/anomaly.test.js` (3) | 이상탐지 F-57 | **경보 쿨다운(중복 발송 방지)** |

---

## 2. 점검 중 발견한 결함/부족 (우선순위순)

### ✅ P1 — 첨부 다운로드/검색 인가 누락 (정보 노출) → **수정 완료**
부모 리소스 접근권한을 확인하지 않고 id만으로 데이터를 노출하던 3개 지점을 수정하고 회귀 테스트를 추가했다.

- **게시판 첨부 다운로드** `bbsPostController.downloadAttachment` — 첨부의 부모 게시글을 로드해 F-67 기밀 게이트(작성자·admin)를 적용하도록 수정. ✔ `bbs.test.js` 회귀 2건.
- **전자결재 첨부 다운로드** `approvalController.downloadAttachment` — 문서의 결재선을 로드해 `get`과 동일한 "작성자·결재자·admin" 규칙을 적용하도록 수정. ✔ `approval.test.js` 회귀 2건.
- **채팅 메시지 검색** `chatController.searchMessages` — `roomId`를 넘기면 비멤버도 해당 방 메시지를 검색할 수 있던 문제. 내가 멤버인 방인지 확인 후 아니면 403. ✔ `chat.test.js` 회귀 2건.
- **통합검색 게시판** `searchController.search` — 전역 검색의 게시판 결과가 F-67 기밀 게이트를 무시해 **기밀 게시글 제목/존재가 비작성자에게 노출**되던 문제(목록/상세/다운로드는 이미 차단했으나 통합검색만 누락). 비관리자에게 `sensitivity=confidential` 제외(본인 작성 제외) 조건 추가. ✔ `search.test.js` 4건.

### ✅ P1(데이터 무결성) — 백업 복원 데이터 누락 → **수정 완료**
기존 `restore`는 backup 23개 중 10개만 복원해 WBS 작업·이슈, 업무 댓글/첨부/히스토리, 타임트래킹, 반복업무, 템플릿, taskTags 등이 되살아나지 않았다. 아래 11개 컬렉션 복원을 FK 순서에 맞춰 추가(additive upsert):
`recurringTasks, taskTemplates(독립) → taskExtraAssignees, taskTags, taskComments, taskAttachments(댓글 이후), taskHistories, timeEntries(tasks 이후) → wbsProjectMembers, wbsTasks(level 오름차순으로 부모 먼저), wbsIssues(wbsProjects 이후)`.
- 날짜 필드는 `D()` 헬퍼로 ISO 문자열 → `Date` 변환. `wbsTasks`는 자기참조(parentId) 때문에 **level 오름차순 정렬 후 삽입**해 부모가 항상 먼저 생성되게 함. ✔ `backup.test.js` 6건(순서 검증 포함).
- **의도적 제외**: `users`(backup이 보안상 passwordHash 미포함 → 복원 불가), `notifications`(`runId/runStepId`가 backup 대상이 아닌 PlaybookRun/RunStep을 참조 → FK 위반 위험).
- ✔ **실 DB 왕복 검증 완료**: 실행 중 서버에서 실제 백업(51KB, `FLW1`) → 자기 자신에게 복원(additive) → **200 "복원이 완료되었습니다."** 실 스키마·실데이터에서 복원 트랜잭션이 FK/제약/날짜 오류 없이 완료됨(비파괴적). 단 additive 특성상 기존 행은 update no-op이라 **create 경로**(신규 행 삽입)의 FK 순서는 단위 테스트(level 오름차순)로 커버. 완전한 create 검증은 별도 스크래치 DB에서 delete-후-restore로 가능.

### ✅ P2 — 보드 카드 순환 의존성 → **수정 완료**
`boardController.addDependency`가 자기참조만 막고 순환(A→B, B→A 또는 더 긴 사이클)을 막지 않아 간트/토폴로지 렌더에서 교착·무한루프 가능. `dependencyCreatesCycle`(BFS) 추가로 순환 시 400 반환. ✔ `board.test.js` 3건.

### ✅ P2 — 발송 메일 삭제 무동작 → **수정 완료**
`InternalMail`에 `senderDeleted` 플래그 추가(마이그레이션 `20260729005640_add_mail_sender_deleted`, DB 적용·클라이언트 재생성 완료). `deleteSent`는 발송 메일을 `senderDeleted=true`로 숨기고(수신자 편지함 보존) draft는 실제 삭제, `list`의 보낸편지함 조회는 `senderDeleted:false` 필터. ✔ `mail.test.js` 4건.

### ✅ P2 — 자원(회의실·차량) 중복 예약 충돌 검사 → **구현 완료**
`scheduleController`에 `findResourceConflict` 헬퍼를 추가하고 `createEvent`/`updateEvent`에서 자원이 지정된 일정 저장 전 충돌을 검사하도록 구현. 충돌 시 **409**와 겹치는 예약 정보(제목·시간·예약자)를 반환한다.
- 판정: 동일 `resourceId` + 날짜 구간 겹침 && (한쪽이라도 종일 → 충돌 / 둘 다 시간지정 → 시간대 겹침, HH:MM 문자열 비교).
- 수정 시 본인 일정은 `excludeId`로 제외. ✔ `schedule.test.js` 5건 추가.
- 알려진 한계: 여러 날에 걸친 "시간 지정" 일정은 단순화하여 시간대만 비교(소규모 팀 로컬 전제). 필요 시 일자별 분해로 정밀화 가능.

### ✅ P3 — OKR 체크인 권한 → **수정 완료**
`okrController.createCheckin`에 `canEditObjective` 게이트 추가 — KR CRUD와 동일하게 목표 소유자·관리자만 체크인(KR 현재값 갱신) 가능. ✔ `okr.test.js` 403 케이스 추가.

### 🟡 P3 — 로버스트니스 관찰 (라이브 버그 아님, 테스트로 현재 동작 고정)
- **자동화 `changed_to` 조건** → **수정 완료**: `evalCondition`이 `changed_to`를 field 유무와 무관하게 `status/prevStatus` 전이로 먼저 평가하도록 변경(field 없는 규칙의 무조건 통과 함정 제거). ✔ `automationEngine.test.js` 전이 케이스.
- **PII 외국인 주민번호** → **수정 완료**: 주민번호 성별코드를 `[1-4]`→`[1-8]`로 확장(외국인등록번호 5~8 탐지). 0/9는 계속 제외해 오탐 억제. ✔ `pii.test.js` 외국인번호/경계 케이스.
- **이상탐지 중복 경보** → **수정 완료**: `anomalyService`에 경보 쿨다운(`shouldAlert`, 인메모리 Map) 도입. 동일 (유형+대상) 경보는 윈도우(대량조회/권한오류) 또는 24h(신규IP/업무외) 내 1회만 발송. ✔ `anomaly.test.js` 3건(연속 스캔 시 1회만).
- **비번 재설정 계정 열거** → **수정 완료**: `requestPasswordReset`이 유효 여부와 무관하게 항상 200+토큰 반환(무효 계정은 `userId=0` 토큰 → OTP 단계에서 401로 차단). 프론트 흐름 무변경. ✔ `authFlow.test.js` 열거방지 케이스.
- **OTP 검증 throttle** → **수정 완료**: `verifyLoginTotp`가 OTP 불일치 시 실패 카운트 누적·임계치 초과 시 계정 잠금(423), 잠긴 계정은 검증 전 차단(1단계 로그인과 동일 기준). ✔ `authFlow.test.js` 잠금 케이스.

---

## 3. 테스트 커버리지 공백 (다음 보강 후보)

44개 컨트롤러 중 현재 테스트 보유 **다수(핵심 도메인 대부분)**. 아직 미커버이며 로직이 복잡해 다음 순번으로 보강할 대상:

| 도메인 | 컨트롤러/서비스 | 핵심 검증 필요 로직 |
|--------|----------|---------------------|
| 백업/복원 F-44 | `backupController.js` | 복원 무결성·트랜잭션 |
| 보안강화 F-57 | `anomalyService.js`, `securitySettingsService.js` | 이상탐지·단일세션·비번이력·보관정책 |
| 보드 카드 상세 F-35 | `boardController.js` | 카드 이동·의존성 순환·커스텀 속성값 |
| AI/RAG F-58/63 | `ragService.js`, `aiService.js` | 출처 인용·근거 스코프(외부호출은 모킹) |
| 폼 F-66 | `formController.js` | (기존 form.test.js 보유) 집계 정확도 확장 |

이번 라운드에서 결재선 조건평가·자동화 엔진·통합검색·위키·PII·알림 커버 완료.
직전 라운드에서 채팅·일정·가계부·플레이북·WBS·보드 권한 커버 완료.

`jest.config`의 `collectCoverageFrom`은 controllers/middlewares 대상 → `npm run test:coverage`로 정량 공백 추적 가능.
