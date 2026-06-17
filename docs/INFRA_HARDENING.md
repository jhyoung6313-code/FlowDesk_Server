# 인프라 보안 강화 가이드 (운영 적용 절차)

코드로 자동 적용할 수 없는 **인프라/운영 레벨** 보안 조치입니다. 운영 환경에서 순서대로 적용하세요.

> ⚠️ 본 가이드의 명령은 **운영 중 서비스에 영향**을 줄 수 있습니다. 점검 시간에 백업 후 진행하세요.

---

## 1. HTTPS / TLS 1.2+ (전자금융감독규정 · ISMS-P 2.7.1) — ✅ 구성 완료

frontend 컨테이너의 nginx가 TLS를 종단 처리하도록 **이미 구성**되어 있습니다.
- `frontend/nginx.conf`: 443 TLS 서버(TLS 1.2/1.3) + HTTP(80)→HTTPS 리다이렉트 + HSTS
- `docker-compose.yml`: `./certs` 를 `/etc/nginx/certs`로 마운트, `5443:443` 노출
- 백엔드는 `app.set('trust proxy', 1)`로 프록시 뒤 동작 전제, CORS/Socket.IO에 HTTPS 오리진 허용

### 적용 절차
```bash
# 1) 인증서 확인 (없으면 생성)
ls certs/flowdesk.crt certs/flowdesk.key
#   재생성:
#   openssl req -x509 -nodes -newkey rsa:2048 \
#     -keyout certs/flowdesk.key -out certs/flowdesk.crt -days 825 \
#     -subj "/C=KR/O=FlowDesk/CN=localhost" \
#     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# 2) 빌드 + 기동
docker compose up -d --build

# 3) 접속
#   https://localhost:5443   (HTTP 5100 접속 시 HTTPS로 리다이렉트)
```

### ⚠️ 운영 전 필수 교체
- 현재는 **자체서명 인증서**라 브라우저 경고가 뜹니다(내부망 한정 허용).
- 운영: **내부 CA 발급 인증서** 또는 공개 도메인이면 **Let's Encrypt** 로 교체하고, `certs/` 의 `flowdesk.crt`/`flowdesk.key` 만 갈아끼우면 됩니다.
- 자체서명을 유지할 경우, 사내 단말에 루트 인증서를 신뢰 저장소에 등록하면 경고가 사라집니다.

---

## 2. DB 계정 보안 강화 (ISMS-P 2.6.4)

현재 기본 계정 `postgres / postgres1234`는 **운영 부적합**. 최소권한 앱 계정을 분리합니다.

### 2-1. 최소권한 애플리케이션 롤 생성
```sql
-- postgres 슈퍼유저로 접속
CREATE ROLE flowdesk_app WITH LOGIN PASSWORD '강력한_무작위_비밀번호';
GRANT CONNECT ON DATABASE task_manager TO flowdesk_app;
GRANT USAGE ON SCHEMA public TO flowdesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flowdesk_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flowdesk_app;
-- 향후 생성 테이블에도 자동 부여
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flowdesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO flowdesk_app;
```
> 마이그레이션(DDL)은 별도 관리자 계정으로 수행하고, 앱 런타임은 `flowdesk_app`(DDL 권한 없음)을 사용합니다.

### 2-2. postgres 슈퍼유저 비밀번호 변경
```sql
ALTER USER postgres WITH PASSWORD '새_강력한_비밀번호';
```

### 2-3. 앱 연결문자열 교체 (`backend/.env`)
```
DATABASE_URL="postgresql://flowdesk_app:강력한_무작위_비밀번호@localhost:5432/task_manager"
```
변경 후 백엔드 재시작.

### 2-4. 접근 IP 제한 (`pg_hba.conf`)
```
# 로컬/내부망만 허용, 암호화 연결 강제
hostssl  task_manager  flowdesk_app  127.0.0.1/32   scram-sha-256
hostssl  task_manager  flowdesk_app  10.0.0.0/8     scram-sha-256
```
`postgresql.conf`에서 `password_encryption = scram-sha-256`, `ssl = on` 설정 후 재시작.

---

## 3. 방화벽 / 포트 노출 최소화
- DB 포트(5432)·백엔드 포트(4000)는 **외부 미노출**, 443만 공개.
```bash
# 예: ufw
ufw default deny incoming
ufw allow 443/tcp
ufw allow 22/tcp        # 관리 접속(가능하면 VPN/특정 IP로 제한)
ufw enable
```

---

## 4. 백업 파일 키 관리
- `backupController`는 백업을 `.enc`로 암호화합니다. 복호화 키/패스프레이즈는 **DB·코드와 분리 보관**.
- 백업 파일은 별도 보관소(다른 호스트/스토리지)에 **최소 3세대 보관**.

---

## 5. 비밀키 운영 관리 (ISMS-P 2.7.2)
| 키 | 현재 | 운영 권장 |
|----|------|----------|
| `JWT_SECRET` | `.env` | 충분히 긴 무작위값으로 교체, 주기적 로테이션 |
| `DATA_ENCRYPTION_KEY` | `.env`(gitignore) | KMS/HashiCorp Vault 등 시크릿 매니저 이관 검토 |
| DB 비밀번호 | `.env` | 위와 동일 |

> ⚠️ `DATA_ENCRYPTION_KEY` **분실 시 기존 암호화 데이터 복호화 불가**. 키 교체 시 재암호화 마이그레이션 절차 필요.

---

## 6. 운영 점검 정례화
- [ ] `npm audit` 월 1회 이상 (CI 파이프라인 자동화 권장)
- [ ] 감사로그(`/api/admin/audit-log`) 주기 검토
- [ ] 보안경보(security_alert 알림) 모니터링
- [ ] OS·PostgreSQL·Node.js 보안 패치 적용
