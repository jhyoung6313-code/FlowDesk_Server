# FlowDesk 개발환경 세팅 (다른 PC에서 이어서 작업하기)

이 문서는 **새 PC/새 클론에서 FlowDesk를 이어서 개발**할 때 필요한 절차를 정리한 것입니다.
코드는 git으로 전부 공유되지만, 아래 3가지는 **git에 올라가지 않으므로** 각 PC에서 새로 준비해야 합니다.

1. `node_modules` (의존성) — `.gitignore` 대상
2. `backend/.env` (DB 접속·시크릿 등) — `.gitignore` 대상
3. PostgreSQL 로컬 DB + 스키마/데이터 — DB는 git에 없음

---

## 0. 사전 요구사항 (설치돼 있어야 하는 것)

| 항목 | 버전/비고 |
|------|-----------|
| Node.js | 18 LTS 이상 (권장 20+) — `node -v` |
| PostgreSQL | **17** (16도 가능) — 서비스 실행 중이어야 함 |
| Git | 최신 |
| (Windows) Git Bash | `restart.sh` 실행용 (또는 `restart.bat`) |

---

## 1. 코드 가져오기

```bash
# 최초 클론
git clone https://github.com/jhyoung6313-code/FlowDesk_Server.git FlowDesk_Repo
cd FlowDesk_Repo

# 이미 클론돼 있으면 최신 동기화
git fetch origin
git checkout feat/m365-gap-features   # 현재 작업 브랜치
git pull
```

> 현재 활성 작업 브랜치는 `feat/m365-gap-features` 입니다. (main 아님)

---

## 2. 의존성 설치

```bash
cd backend  && npm install
cd ../frontend && npm install
cd ..
```

> `restart.sh` 는 `node_modules` 가 없으면 자동으로 `npm install` 을 수행합니다.

---

## 3. 환경변수 `backend/.env` 만들기

`backend/.env` 는 공유되지 않으므로 새로 만들어야 합니다. 예시를 복사해 값을 채웁니다.

```bash
cp backend/.env.example backend/.env
```

로컬 개발 기본값(프로젝트 표준):

```env
# DB (계정 postgres / postgres1234, DB명 flowdesk_server)
DATABASE_URL="postgresql://postgres:postgres1234@localhost:5432/flowdesk_server"

JWT_SECRET="<무작위 긴 문자열>"     # node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_EXPIRES_IN="8h"
PORT=4000
CORS_ORIGIN="http://localhost:3000,http://localhost"

# 민감정보 컬럼 암호화 키(64 hex). 기존 암호화 데이터를 그대로 쓰려면 반드시 기존 PC와 동일한 키 사용!
# 생성: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
DATA_ENCRYPTION_KEY="<64 hex>"
```

> ⚠️ **`DATA_ENCRYPTION_KEY`** 는 기존 PC의 DB 데이터를 옮겨 쓸 경우 **반드시 같은 값**이어야 복호화됩니다. 키가 다르면 기존 암호화 컬럼(PII 등)을 읽을 수 없습니다. 새 빈 DB로 시작한다면 새로 생성해도 됩니다.
>
> 나머지 보안/정책 변수(OTP·비밀번호 정책·보관정책·이상탐지 등)는 `backend/.env.example` 참고. 개발 편의상 OTP를 끄려면 예시의 관련 플래그를 조정하세요.

프론트엔드는 별도 `.env` 가 필요 없습니다(Vite dev 서버가 `:4000` 으로 프록시).

---

## 4. 데이터베이스 준비

### 4-1. DB 생성
```bash
# psql 로 접속(비번 postgres1234) 후
CREATE DATABASE flowdesk_server;
```

### 4-2. 스키마 적용 (마이그레이션)
```bash
cd backend
npx prisma generate       # Prisma Client 생성
npx prisma migrate deploy # 모든 마이그레이션 적용 (운영/이어받기용)
```

### 4-3-A. 새 데이터로 시작하는 경우 — 시드
```bash
npm run seed              # 기본 계정/샘플 데이터 생성
```
기본 계정: `admin / admin1234`, `member1~2 / member1234`

### 4-3-B. 기존 PC의 데이터를 그대로 옮기는 경우 — 덤프/복원
```bash
# [기존 PC]
pg_dump -U postgres -h localhost flowdesk_server > flowdesk_dump.sql
# [새 PC] (DB 생성 후)
psql -U postgres -h localhost -d flowdesk_server < flowdesk_dump.sql
```
> 이 경우 `backend/.env` 의 `DATA_ENCRYPTION_KEY` 를 **기존 PC와 동일하게** 맞춰야 합니다.

---

## 5. 서버 실행

```bash
bash restart.sh      # (Windows: restart.bat)
```
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

`restart.sh` 는 ①포트 4000/3000 정리 → ②PostgreSQL 확인 → ③의존성 확인 → ④백엔드(nodemon) → ⑤프론트(vite) 순으로 기동합니다. 로그는 `backend/backend.log`, `frontend/frontend.log`.

---

## 6. 자주 겪는 문제

| 증상 | 해결 |
|------|------|
| `.env 파일이 없습니다` | 3단계 수행 (`cp backend/.env.example backend/.env`) |
| Prisma `EPERM`/DLL 잠금 (generate 실패) | 포트 4000 프로세스 종료 후 `npx prisma generate`, 이어서 재시작 |
| DB 연결 실패 | PostgreSQL 서비스 실행 여부·`DATABASE_URL` 계정/포트/DB명 확인 |
| 마이그레이션 drift 경고 | 이어받기는 `migrate deploy` 사용(개발 중 스키마 변경 시에만 `migrate dev`) |
| 로그인은 되는데 PII 등 일부 값 오류 | `DATA_ENCRYPTION_KEY` 가 기존 DB 생성 시와 다름 |

---

## 요약 (한 번에)

```bash
git clone <repo> FlowDesk_Repo && cd FlowDesk_Repo
git checkout feat/m365-gap-features
cd backend && npm install && cp .env.example .env   # .env 값 채우기 (DATABASE_URL, JWT_SECRET, DATA_ENCRYPTION_KEY)
npx prisma generate && npx prisma migrate deploy
npm run seed                                         # 새 DB일 때만
cd ../frontend && npm install
cd .. && bash restart.sh
```
