# FlowDesk 개인정보 안전성 확보조치 · 컴플라이언스 체크리스트 검증 보고서

- 대상 브랜치: `feat/m365-gap-features`
- 검증일: 2026-09-30
- 방법: 코드 배선 추적(grep + 파일 읽기) + 로컬 `flowdesk_server` DB 실측(`PRIVACY_SECURITY_AUDIT_VERIFY.sql`)
- 원칙: "코드가 존재한다"와 "실제로 호출되어 동작한다"를 분리 검증 (CLAUDE.md 상시 규칙 적용)

## 요약

| 항목 | 코드 존재 | 실제 배선/동작 | 판정 |
|---|---|---|---|
| 접근권한 관리(직무분리) | ✅ `requirePermission` | ⚠️ `PII_AUDIT` 1곳에만 적용, **부여받은 사용자 0명** | **Critical** |
| PII 조회 감사(PII_READ) | ✅ 상수·이상탐지 쿼리 존재 | ❌ 어디서도 기록(`audit.record`)되지 않음, DB 0건 | **High** |
| 개인정보 암호화 저장 | ✅ `lib/crypto.js` (AES-256-GCM) | ❌ 어떤 모델·컬럼에도 미적용, 완전 미사용(dead code) | **Medium** (구조상 필요 여부 재확인 필요) |
| PII 입력 차단(piiGuard) | ✅ 전역 미들웨어 | ✅ `app.use('/api', piiGuard)` 배선 확인, 감사수단 존재 | 정상 |
| 접속기록/감사로그 3년 보관 | ✅ `RETENTION.AUDIT_LOG_DAYS=1095` | ✅ cron 배선(`scheduleRetention` in app.js), DB 3년초과 로그 0건(정상: 아직 도래 안함) | 정상 |
| 개인정보(데이터) 파기 | ✅ `runPurge` 5개 파기 루틴 | ✅ cron 등록 확인. DB상 `DATA_PURGE` 이력 0건(아직 파기 대상 없음 — 정상 추정, 운영 후 재확인 필요) | 정상(조건부) |
| 대량 반출(Excel/PDF/백업) 감사 | ✅ `AUDIT_ACTION.DATA_EXPORT` | ✅ tasks/wbs/ledger/backup export 라우트에 `auditAction` 부착, DB 7건 확인 | 정상 |
| 비밀번호 정책 단일화 | ✅ `passwordPolicy.validateFormat` | ✅ 가입/변경/재설정/관리자생성 전부 동일 정책 사용 확인 | 정상 |
| 비밀번호 해시 강도 | ✅ `bcrypt`, `BCRYPT_ROUNDS=12`(금융권 권장) | ⚠️ `userController.js:154`(임시 비밀번호 발급) 및 `seed.js`는 **하드코딩 10 라운드** 사용 — 정책 상수 미사용 | **Low** |
| 전송구간 암호화(HTTPS/HSTS) | ✅ `helmet({ hsts: ... })` | ⚠️ 현재 로컬 개발환경은 HTTP(3000/4000) — HSTS는 HTTPS 위에서만 의미. **운영 배포 시 리버스프록시 TLS 종단 필수**(현재 코드로는 미확인) | 확인 필요(운영시점) |
| 이상탐지(비정상 접근) | ✅ `anomalyService.js` cron 5분 | ✅ DB에 29건 실제 적재 확인 | 정상 |

## 상세

### 1. [Critical] `PII_AUDIT` 권한 보유자 0명 → 검출로그 화면 무용지물
`SELECT COUNT(*) FROM users WHERE 'PII_AUDIT' = ANY(permissions)` 결과 **0**.
F-56의 핵심 통제(PII 검출로그를 감사자만 열람)가 설계·구현은 되어 있으나, 실제로는 admin을 포함해 **아무도 이 화면(`pages/Admin/PiiBlockLog.jsx`)에 접근할 수 없는 상태**다. 기능이 "존재하되 죽어있는" 상태 — 감사 요구사항(누가 PII 이벤트를 주기적으로 점검하는가) 자체가 현재 충족되지 않는다.
- 조치 방향(승인 후 진행): 최소 1명(예: admin 또는 지정 감사자)에게 `permissions`에 `'PII_AUDIT'` 부여.

### 2. [High] `PII_READ` 감사액션이 실제로는 한 번도 기록되지 않음
`config/security.js`에 상수가 정의되어 있고 `anomalyService.js`가 이 액션을 집계해 "단시간 대량 PII 조회" 이상탐지를 수행하도록 설계되어 있다. 그러나 전체 백엔드에서 `audit.record({ action: AUDIT_ACTION.PII_READ, ... })` 형태의 실제 호출부를 찾을 수 없었고, DB에도 0건이다.
- 결과: 이 이상탐지 룰은 **항상 조건을 만족하지 못해 절대 발동하지 않는 죽은 규칙**이다. "개인정보 열람 이력 관리"라는 안전성 확보조치 항목이 로그 상으로는 비어있는 상태로 남는다.
- 확인 필요:애초에 PII를 조회하는 화면/API가 어디인지(주민번호 등 구조화된 PII 컬럼은 schema.prisma에 존재하지 않음 — 아래 3번 참고) — 대상이 없다면 이 상수·이상탐지 룰 자체가 불필요한 설계일 수 있음.

### 3. [Medium] 암호화 유틸(`lib/crypto.js`)이 완전히 미사용
AES-256-GCM 기반 `encrypt/decrypt/blindIndex` 유틸이 구현되어 있고 `.env.example`에 `DATA_ENCRYPTION_KEY` 항목도 있으나, `grep -r "lib/crypto"` 결과 **어떤 컨트롤러·모델에서도 import되지 않는다**. `schema.prisma` 전체를 확인한 결과 주민등록번호·계좌번호·카드번호 등을 저장하는 **전용 컬럼 자체가 없다** — 즉 현재 아키텍처는 "구조화된 PII를 애초에 저장하지 않고 입력 단계에서 차단(piiGuard)"하는 예방 중심 설계로 보인다.
- 판단 필요: (a) 크립토 유틸이 향후 대비용으로 남겨진 것이라면 문제 아님(단, "코드가 있으면 배선되어야 한다" 원칙상 사용처가 없으면 dead code로 표시하거나 제거 검토), (b) 만약 자유텍스트 필드(위키 본문, 메일 본문, 게시판 첨부 등)에 PII가 우회 저장될 가능성이 있다면 piiGuard의 탐지 커버리지를 별도로 점검할 필요가 있음(4번 참고).

### 4. [정보] `pii_block_logs` 테이블 0건
개발/테스트 기간 동안 PII 패턴이 실제로 한 번도 차단된 적이 없다는 뜻. 정상일 수도 있으나, **piiGuard가 실제로 정규식에 걸리는지 자체 테스트가 없다면** "차단이 안 되는 것"과 "시도가 없었던 것"을 구분할 수 없다. 검증 방법: 관리자 계정으로 주민등록번호 패턴(예: `901231-1234567`)을 업무 설명란 등에 입력해보고 차단 및 로그 적재 여부 확인 권장.

### 5. [Low] 비밀번호 해시 라운드 불일치
`config/security.js`의 `AUTH.BCRYPT_ROUNDS`(기본 12, 금융권 권장)를 대부분 사용하지만, `userController.js:154`(임시 비밀번호 발급 로직)와 `prisma/seed.js`는 하드코딩된 `10`을 사용한다. CLAUDE.md의 "단일 기준 사용, 중복 정의 금지" 원칙과 동일한 문제 패턴 — seed는 초기 데이터용이라 영향 낮지만, **임시 비밀번호 발급 경로는 운영 코드이므로 정책 상수 미사용은 실제 보안수준 저하**로 이어짐.

### 6. [확인 필요] 전송구간 암호화
`helmet`의 HSTS 헤더는 설정돼 있으나 이는 "브라우저에게 앞으로 HTTPS만 쓰라고 지시"하는 것일 뿐, 서버 자체가 HTTPS를 강제하거나 종단하는 코드는 app.js에 없다(주석상 "프론트는 별도 nginx/Vite 담당"으로 위임). 로컬 개발환경(HTTP)에서는 문제 없으나, **운영 배포 시 리버스프록시(nginx 등)의 TLS 종단 설정이 실제로 적용됐는지는 이 레포 범위 밖이라 별도 확인 필요**.

## 정상 확인된 항목 (근거)
- 접속기록 3년 보관 및 자동 파기 cron: `app.js:153` `scheduleRetention()` 배선 확인, `RETENTION.PURGE_CRON='0 3 * * *'`
- 대량 반출 감사: tasks/wbs/ledger/backup 라우트 7곳에 `auditAction(DATA_EXPORT)` 부착, DB 7건 매칭
- 비밀번호 정책 단일화: 가입/변경/재설정/관리자 생성 4개 경로 모두 `passwordPolicy.validateFormat` 사용
- 이상탐지 실동작: DB에 `ANOMALY_DETECTED` 29건 실제 적재(오프아워 로그인 등으로 추정 — 내용 재검토는 별도 필요)

## 다음 단계 제안 (사용자 확인 후 진행)
1. `PII_AUDIT` 권한을 최소 1개 계정에 부여 (Critical)
2. `PII_READ` 감사액션을 실제 발생 지점에 배선하거나, 해당 이상탐지 룰/상수를 사용처 없음으로 명시하고 정리 (High)
3. 임시비밀번호 발급 경로의 bcrypt rounds를 정책 상수로 통일 (Low)
4. piiGuard 실제 차단 동작 수기 테스트로 확인 (정보성)
5. 운영 배포 환경의 TLS 종단 설정 별도 확인 (이 레포 범위 밖)
6. 이어서 `/security-review`로 코드 레벨 취약점(OWASP Top 10) 정적 진단 진행 권장
