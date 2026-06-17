# 보안 정책 (금융권 적용)

task-manager(FlowDesk)를 금융회사 환경에 적용하기 위한 정보보호·개인정보보호 정책 및 구현 현황 문서입니다.

> ⚠️ 본 문서는 기술 구현 기준입니다. 실제 적용 범위·수준은 **컴플라이언스/법무팀 및 정보보호최고책임자(CISO)** 검토를 거쳐야 합니다.

## 1. 적용 근거 법규

| 법규 | 핵심 요구사항 |
|------|--------------|
| 개인정보보호법(PIPA) | 수집 최소화, 동의, 파기, 안전성 확보조치 |
| 신용정보법 | 신용정보 암호화, 접근통제, **접속기록 3년 보관** |
| 전자금융거래법 / 전자금융감독규정 | 접근통제, 이중인증, 망분리, 로그관리, **거래기록 5년 보관** |
| 개인정보의 안전성 확보조치 기준(고시) | 암호화, 접근권한, 접속기록, 백업 |
| 금융분야 개인정보보호 가이드라인 | 가명·익명처리, 처리위탁 관리 |

## 2. 구현 현황 (코드 반영 완료)

### 2.1 인증 · 접근통제
| 항목 | 구현 | 위치 |
|------|------|------|
| OTP 2단계 인증 전사 강제 | `ENFORCE_OTP=true` | `config/security.js`, `authController.login` |
| JWT 만료 단축 (8h→1h) | `JWT_EXPIRES_IN=1h` | `config/security.js` |
| 비밀번호 변경 시 기존 토큰 무효화 | 토큰 `pwAt` 검증 | `middlewares/auth.js` |
| 계정 잠금 (5회 실패→30분) | `failedLoginCount`, `lockedUntil` | `authController.login` |
| bcrypt cost 12 | `BCRYPT_ROUNDS=12` | `config/security.js` |
| 권한 최소화(RBAC) | admin/member 역할 | `middlewares/adminOnly` |

### 2.2 비밀번호 정책
| 항목 | 값 | 위치 |
|------|-----|------|
| 최소 길이 | 9자 | `PASSWORD_MIN_LENGTH` |
| 문자 종류 | 4종 중 3종 이상 | `PASSWORD_MIN_CLASSES` |
| 변경 주기 | 90일 | `PASSWORD_EXPIRE_DAYS` |
| 재사용 금지 | 직전 5개 | `PASSWORD_HISTORY_COUNT` |
| 아이디 포함 금지 | 적용 | `utils/passwordPolicy.js` |

### 2.3 암호화
| 항목 | 구현 |
|------|------|
| 비밀번호 | bcrypt 단방향 (cost 12) |
| 민감정보 컬럼(주민번호·계좌 등) | AES-256-GCM 유틸 제공 — `lib/crypto.js` (`encrypt`/`decrypt`/`blindIndex`) |
| 전송 구간 | **TLS 1.2+ (nginx 프록시)** — 인프라 설정 필요 (4.1 참고) |
| 백업 파일 | `.enc` 암호화 (기존 backupController) |

> 현재 스키마에는 주민번호·계좌 등 민감정보 컬럼이 **없습니다**. 추가 시 `lib/crypto.js`로 저장 전 암호화하고, 동등검색이 필요하면 `blindIndex` 컬럼을 병행하세요.

### 2.4 접속기록 · 감사로그 (신용정보법 3년)
- 모델: `AuditLog` (append-only, 3개 인덱스)
- 기록 액션: 로그인 성공/실패, 계정잠금, 비밀번호 변경/초기화, **개인정보 조회(PII_READ)**, **대량 반출(DATA_EXPORT)**, 권한거부(403), 자동파기(DATA_PURGE), 비정상탐지(ANOMALY_DETECTED)
- 자동 기록: 권한거부는 전역 미들웨어, 반출/조회는 라우트별 `auditAction()` 부착
- 보관: **3년(1095일)** 후 자동 파기 (`RETENTION_AUDIT_DAYS`)
- 관리자 조회: `GET /api/admin/audit-log?action=&userId=`

### 2.5 비정상 접근 탐지 (외부 솔루션 불필요)
`services/anomalyService.js` — 감사로그를 5분마다 스캔하는 규칙 기반 엔진:

| 규칙 | 임계치 | 환경변수 |
|------|--------|----------|
| 무차별 대입 | 로그인 5회 실패→잠금 | `LOGIN_MAX_FAILED` |
| 단시간 대량 조회 | 5분/100건 | `ANOMALY_BULK_THRESHOLD` |
| 대량 반출 | DATA_EXPORT 즉시 기록 | — |
| 403 권한오류 다발 | 5분/10건 | `ANOMALY_FORBIDDEN_THRESHOLD` |
| 업무외 시간 로그인 | 00~06시 | `ANOMALY_OFF_HOURS_*` |
| 신규/다중 IP 로그인 | 미등록 IP·동시 2IP↑ | — |

탐지 시 → ANOMALY_DETECTED 감사로그 + 관리자에게 `security_alert` 알림.

### 2.6 데이터 보유 · 자동 파기
`services/retentionService.js` — 매일 03:00 실행, 파기 결과를 DATA_PURGE 대장에 기록.

| 대상 | 보유기간 | 비고 |
|------|---------|------|
| 감사/접속 로그 | 3년 | `RETENTION_AUDIT_DAYS` |
| 소프트삭제 업무(del_yn=1) | 90일 유예 후 물리삭제 | 첨부파일 동반 |
| 읽은 알림 | 90일 | |
| Orphan 첨부파일 | 24h 경과분 | DB 미참조 파일 |
| 비밀번호 이력 | 최근 5개 초과분 | 변경 시 정리 |

> ⚠️ **금융거래기록은 전자금융거래법상 5년 보관 의무** → 자동 파기 대상에서 제외. 파기는 "보유기간 경과 + 법정 보관의무 없음" 조건을 모두 만족할 때만 수행하도록 설계됨.

### 2.7 마스킹
`utils/masking.js` — 이름·연락처·이메일·주민번호·계좌 표시용 마스킹 함수. 화면/로그 출력 시 적용.

## 3. 환경변수 (.env)
모든 보안 임계치는 `.env`로 조정 가능 (`backend/.env.example` 참고). 핵심:
```
JWT_EXPIRES_IN=1h
ENFORCE_OTP=true
BCRYPT_ROUNDS=12
DATA_ENCRYPTION_KEY=<32바이트 hex>   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
LOGIN_MAX_FAILED=5
PASSWORD_EXPIRE_DAYS=90
RETENTION_AUDIT_DAYS=1095
```

## 4. 운영 적용 시 추가 조치 (코드 외 / 확인 필요)

### 4.1 인프라 (1순위)
- [x] **HTTPS/TLS 1.2+ 구성 완료** — frontend nginx 443 + HTTP→HTTPS 리다이렉트, 자체서명 인증서(`certs/`). 적용: `docker compose up -d --build` 후 `https://localhost:5443` 접속. **운영은 내부 CA/정식 인증서로 교체** 필요
- [x] **보안 헤더(helmet) 적용 완료** — HSTS·X-Frame-Options·nosniff·CORP. HSTS는 HTTPS에서 발효
- [ ] DB 접근 IP 제한, DB 계정 비밀번호 변경(`postgres1234` → 강화) → `docs/INFRA_HARDENING.md`
- [x] **민감정보 암호화 키(`DATA_ENCRYPTION_KEY`) 설정 완료** (로컬 `.env`, gitignore). 운영은 KMS/Vault 검토

### 4.2 관리적 (3순위)
- [ ] 개인정보처리방침 게시
- [ ] 처리위탁/제3자 제공 관리대장
- [ ] 접근권한 부여·변경·말소 이력 관리대장
- [ ] 망분리 의무 대상 여부 검토 (업권·규모별)
- [ ] ISMS-P 인증 대상 여부 검토 → `docs/ISMS-P/` 참고

## 5. 마이그레이션 적용 절차
스키마 변경(AuditLog, PasswordHistory, User 보안필드)이 포함되어 DB 마이그레이션이 필요합니다.
```bash
cd backend
npm install
# .env 에 DATA_ENCRYPTION_KEY 등 신규 변수 설정 후
npx prisma migrate dev --name add_security_audit_fields
npx prisma generate
```
기존 사용자는 `passwordChangedAt`이 마이그레이션 시각으로 설정되므로, 90일 변경주기는 그 시점부터 계산됩니다.
