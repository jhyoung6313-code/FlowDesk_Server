# FlowDesk 서버 이관 가이드 (처음 하는 분을 위한 완전판)

> 이 문서는 **서버 배포를 한 번도 해본 적 없는 분**도 그대로 따라 하면 끝나도록
> 모든 명령에 "무엇을·왜" 하는지 설명을 붙였습니다. 위에서부터 순서대로 진행하세요.
>
> - 대상 서버: **Ubuntu 22.04 LTS** (사내 내부망)
> - 작업 PC: **Windows** (현재 개발 노트북)
> - 시나리오: **데이터 없이 새로 시작** (admin 계정·기본 데이터는 자동 생성됨)
>
> ※ 서버가 Ubuntu가 아니거나(예: CentOS/Rocky), 클라우드(AWS/네이버클라우드 등)라면
> 1~4단계만 조금 다릅니다. 그 경우 알려주시면 맞춰 드리겠습니다.

---

## 0. 먼저 큰 그림 이해하기 (5분)

### 이 앱은 어떻게 돌아가나?
FlowDesk는 **Docker**라는 기술로 실행됩니다. Docker는 "앱 + 필요한 모든 것(DB, 웹서버,
설정)을 상자(컨테이너)에 담아 통째로 실행"하는 도구입니다. 덕분에 **서버에는 Docker
하나만 설치**하면 되고, Node.js·PostgreSQL·Nginx를 따로 설치할 필요가 없습니다.

이 앱은 3개의 컨테이너로 구성됩니다:

| 컨테이너 | 역할 | 비유 |
|----------|------|------|
| `db` | PostgreSQL 데이터베이스 (데이터 저장) | 창고 |
| `backend` | API 서버 (업무 로직 처리) | 주방 |
| `frontend` | 웹 화면 제공 (nginx) | 홀(손님 응대) |

사용자는 웹브라우저로 `frontend`에 접속하고, `frontend`가 `backend`에, `backend`가 `db`에
연결됩니다. 이 연결 관계는 `docker-compose.yml` 파일에 이미 다 정의돼 있습니다.

### 무엇을 서버로 옮기나?
- **옮기는 것**: 소스 코드 (GitHub를 통해)
- **서버에서 새로 만드는 것**: `.env`(비밀번호·키 설정), `certs/`(보안 인증서)
  → 이 둘은 보안상 GitHub에 올리지 않으므로 서버에서 직접 만듭니다.
- **자동으로 생기는 것**: 데이터베이스 구조, admin 계정, 기본 샘플 데이터

### 전체 순서 미리보기
```
[준비물 확인] → [서버 접속] → [서버 기본 세팅] → [Docker 설치]
   → [코드 내려받기] → [.env 작성] → [인증서 생성] → [실행] → [접속 확인]
```

---

## 1. 준비물 체크리스트

시작 전에 아래 정보를 메모장에 적어두세요. **진행 중 계속 사용합니다.**

| 항목 | 예시 | 내 값 (적어두기) |
|------|------|------------------|
| 서버 IP 주소 | `192.168.1.100` | __________ |
| 서버 로그인 계정 | `ubuntu` | __________ |
| 서버 로그인 비밀번호 | (서버 설치 시 정한 것) | __________ |
| GitHub 저장소 주소 | `https://github.com/jhyoung6313-code/FlowDesk_Server.git` | (확정) |
| 새 DB 비밀번호 | (직접 정함, 영문+숫자 16자↑) | __________ |

> **서버 IP를 모른다면?** 서버에 직접 접속(모니터·키보드 연결)한 뒤 `ip addr` 명령을
> 입력하면 `192.168.x.x` 형태의 주소가 보입니다. 그게 서버 IP입니다.

---

## 2. 서버에 접속하기 (Windows → 서버)

서버는 보통 모니터 없이 **원격 접속(SSH)** 으로 다룹니다. SSH는 "내 PC에서 서버에
명령을 보내는 보안 통로"입니다.

### Windows에서 접속
1. 시작 메뉴에서 **PowerShell** 또는 **Windows Terminal**을 엽니다.
2. 아래 명령을 입력합니다 (`ubuntu`와 IP는 본인 값으로):
   ```powershell
   ssh ubuntu@192.168.1.100
   ```
3. 처음 접속하면 `Are you sure you want to continue connecting (yes/no)?` 라고 물어봅니다.
   → `yes` 입력 후 Enter.
4. 비밀번호를 입력합니다. (화면에 글자가 안 보이는 게 정상입니다. 그냥 치고 Enter)
5. 프롬프트가 `ubuntu@서버이름:~$` 처럼 바뀌면 **접속 성공**입니다.

> 이후 이 문서의 모든 명령은 **이 SSH 창(= 서버 안)** 에서 입력합니다.
> (예외: "Windows에서" 라고 명시된 부분만 노트북에서 실행)

> `ssh` 명령이 없다고 나오면: Windows 설정 → 앱 → 선택적 기능 → "OpenSSH 클라이언트"
> 설치, 또는 [PuTTY](https://www.putty.org/) 프로그램을 사용하세요.

---

## 3. 서버 기본 세팅

### 3-1. 패키지 최신화
서버의 프로그램 목록을 최신으로 갱신하고 업그레이드합니다.
```bash
sudo apt update && sudo apt upgrade -y
```
- `sudo`: 관리자 권한으로 실행 (비밀번호를 한 번 더 물을 수 있음)
- `apt`: Ubuntu의 프로그램 설치 도구
- 시간이 몇 분 걸릴 수 있습니다. 완료될 때까지 기다리세요.

### 3-2. 방화벽 설정 (필요한 포트만 열기)
외부에서 들어올 수 있는 통로를 SSH와 앱 포트로만 제한합니다.
```bash
sudo ufw allow OpenSSH      # SSH 접속 유지 (이거 빼먹으면 다음 접속 시 막힘!)
sudo ufw allow 5443/tcp     # 앱 HTTPS 접속
sudo ufw allow 5100/tcp     # 앱 HTTP 접속(→HTTPS로 자동 이동)
sudo ufw enable             # 방화벽 켜기
```
- `sudo ufw enable` 실행 시 "기존 SSH 연결이 끊길 수 있다"는 경고가 나오면 `y` 입력.
- 확인: `sudo ufw status` → `5443`, `5100`, `OpenSSH`가 `ALLOW`로 보이면 정상.

---

## 4. Docker 설치

### 4-1. 설치
Docker 공식 설치 스크립트를 실행합니다.
```bash
curl -fsSL https://get.docker.com | sudo sh
```
- 1~2분 소요. `Docker version 2x.x.x` 같은 메시지가 나오면 성공.

### 4-2. sudo 없이 docker 쓰도록 설정
```bash
sudo usermod -aG docker $USER
newgrp docker
```
- 매번 `sudo`를 붙이지 않아도 되게 현재 계정을 docker 그룹에 추가합니다.

### 4-3. 설치 확인
```bash
docker --version          # 예: Docker version 27.x.x
docker compose version    # 예: Docker Compose version v2.x.x
docker run hello-world    # "Hello from Docker!" 메시지가 나오면 정상 동작
```
> `docker compose version`에서 오류가 나면 Compose 플러그인이 빠진 것입니다.
> `sudo apt install -y docker-compose-plugin` 실행 후 다시 확인하세요.

---

## 5. 소스 코드 내려받기 (GitHub clone)

### 5-1. 코드를 둘 폴더 만들기
```bash
sudo mkdir -p /opt/flowdesk          # /opt/flowdesk 폴더 생성
sudo chown $USER:$USER /opt/flowdesk # 내 계정이 이 폴더를 쓸 수 있게 소유권 변경
cd /opt/flowdesk                     # 그 폴더로 이동
```
> `/opt`는 리눅스에서 직접 설치한 앱을 두는 표준 위치입니다.

### 5-2. 코드 받기
```bash
git clone https://github.com/jhyoung6313-code/FlowDesk_Server.git .
```
- 맨 끝의 `.`(점)은 "현재 폴더에 바로 받기"라는 뜻입니다. (빼먹지 마세요)
- `git`이 없다고 나오면: `sudo apt install -y git` 후 다시 실행.

> **저장소가 비공개(private)라면** 아이디/비밀번호를 묻습니다. 이때 비밀번호 자리에는
> GitHub 일반 비밀번호가 아니라 **Personal Access Token(PAT)** 을 넣어야 합니다.
> - 발급: GitHub 웹 → 우측 상단 프로필 → Settings → Developer settings →
>   Personal access tokens → **Tokens (classic)** → Generate new token →
>   `repo` 권한 체크 → 생성 → **토큰 문자열 복사**(한 번만 보임!).
> - clone 시 Username엔 GitHub 아이디, Password엔 복사한 토큰을 붙여넣기.

### 5-3. 확인
```bash
ls
```
→ `docker-compose.yml`, `backend`, `frontend`, `.env.example` 등이 보이면 성공.

---

## 6. 환경변수(.env) 작성 ⭐ 가장 중요

`.env`는 비밀번호·암호화 키 같은 **민감 설정을 담는 파일**입니다. GitHub에는 올라가지
않으므로 서버에서 직접 만듭니다.

### 6-1. 예시 파일 복사
```bash
cd /opt/flowdesk
cp .env.example .env
```

### 6-2. 먼저 비밀 키 2개를 생성
아래 두 명령을 각각 실행하고, **출력된 문자열을 메모장에 복사**해 두세요.
```bash
# (1) JWT_SECRET 용 — 로그인 토큰 서명 키
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# (2) DATA_ENCRYPTION_KEY 용 — 민감정보 암호화 키 (64자리 hex)
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
> ⚠️ `DATA_ENCRYPTION_KEY`는 한 번 정하면 **절대 바꾸지 마세요**. 바꾸면 그 이후
> 암호화되어 저장된 데이터를 다시 읽을 수 없습니다.

### 6-3. .env 편집
`nano`라는 간단한 편집기로 엽니다.
```bash
nano .env
```
아래처럼 값을 채웁니다 (IP·비밀번호·키는 본인 값으로):
```ini
# 사내망의 다른 PC에서도 접속하려면 반드시 0.0.0.0 으로 둡니다
BIND_ADDR=0.0.0.0
APP_PORT=5100
APP_HTTPS_PORT=5443

# 서버 IP 로 변경 (콤마로 두 개 다 적기)
CORS_ORIGIN=https://192.168.1.100:5443,http://192.168.1.100:5100

# DB 비밀번호 (직접 정한 강한 값)
DB_PASSWORD=여기에_강한_비밀번호

# 위 6-2에서 생성한 값을 붙여넣기
JWT_SECRET=여기에_(1)에서_복사한_값
DATA_ENCRYPTION_KEY=여기에_(2)에서_복사한_값

JWT_EXPIRES_IN=8h
DISABLE_OTP=false
```

**nano 사용법**: 방향키로 이동, 그냥 타이핑해서 수정.
저장하고 끝내기 → `Ctrl + O`(저장) → `Enter` → `Ctrl + X`(나가기).

### 6-4. 각 항목이 무슨 뜻인가?
| 변수 | 의미 |
|------|------|
| `BIND_ADDR` | 접속 허용 범위. `0.0.0.0`=사내 모든 PC, `127.0.0.1`=서버 자신만 |
| `APP_PORT` / `APP_HTTPS_PORT` | 접속 포트(HTTP 5100, HTTPS 5443) |
| `CORS_ORIGIN` | 보안상 허용할 접속 출처. 서버 IP로 맞춰야 함 |
| `DB_PASSWORD` | 데이터베이스 비밀번호 |
| `JWT_SECRET` | 로그인 토큰 위조 방지용 비밀 키 |
| `DATA_ENCRYPTION_KEY` | 민감정보 암호화 키 (변경 금지) |
| `DISABLE_OTP` | OTP 2단계 인증 끄기. 운영은 `false`(켜기) 권장 |

---

## 7. 보안 인증서(TLS) 만들기

HTTPS(`https://`) 접속을 위해 인증서 파일 2개가 필요합니다. 내부망이므로 **자체서명
인증서**를 직접 만듭니다.

```bash
cd /opt/flowdesk
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout certs/flowdesk.key -out certs/flowdesk.crt \
  -subj "/CN=192.168.1.100" \
  -addext "subjectAltName=IP:192.168.1.100"
```
- `192.168.1.100` 두 군데를 **본인 서버 IP로** 바꾸세요.
- `-days 3650` = 10년 유효.
- 만들어진 `certs/flowdesk.crt`, `certs/flowdesk.key`는 `docker-compose.yml`이 자동으로
  사용합니다. (파일명 고정이므로 바꾸지 마세요)

확인:
```bash
ls certs
```
→ `flowdesk.crt`, `flowdesk.key` 두 개가 보이면 성공.

> 자체서명이라 브라우저에서 "안전하지 않음" 경고가 뜹니다. 내부망에서는 정상이며,
> 접속 시 "고급 → 계속 진행"을 누르면 됩니다(9단계 참고).

---

## 8. 빌드하고 실행하기

이제 모든 준비가 끝났습니다. 컨테이너를 만들고 실행합니다.

### 8-1. 빌드 (이미지 생성)
```bash
cd /opt/flowdesk
docker compose build
```
- 소스 코드로부터 실행 가능한 "이미지"를 만듭니다. **첫 빌드는 5~15분** 걸릴 수 있습니다.
  (인터넷에서 기반 이미지를 받아오기 때문)

### 8-2. 실행 (백그라운드 기동)
```bash
docker compose up -d
```
- `-d`는 "백그라운드 실행"(창을 닫아도 계속 돌아감)이라는 뜻입니다.
- db → backend → frontend 순서로 알아서 기동됩니다.

### 8-3. 첫 기동 로그 확인 (DB 초기화 지켜보기)
```bash
docker compose logs -f backend
```
백엔드가 처음 켜질 때 자동으로:
1. 데이터베이스 표(테이블) 생성 (`prisma migrate deploy`)
2. **admin / admin1234**, member1·2, 샘플 업무 생성 (`seed.js`)
3. `서버 시작!` 메시지 출력

`서버 시작!`이 보이면 정상입니다. 로그 보기를 멈추려면 `Ctrl + C` (앱은 계속 돌아갑니다).

### 8-4. 상태 확인
```bash
docker compose ps
```
- `db`, `backend`, `frontend` 세 개가 보이면 정상.
- `frontend`가 `unhealthy`로 보여도 **정상입니다**(아래 9단계에서 실제 접속으로 확인).

---

## 9. 접속 확인

같은 사내망의 PC에서 웹브라우저를 열고 주소창에 입력:
```
https://192.168.1.100:5443
```
(`192.168.1.100`은 본인 서버 IP, 앞에 `https://`, 뒤에 `:5443` 꼭 붙이기)

### 인증서 경고 통과하기
"연결이 비공개로 설정되어 있지 않습니다" 같은 경고가 나오면(자체서명이라 정상):
- **Chrome/Edge**: "고급" 클릭 → "192.168.1.100(안전하지 않음)(으)로 이동" 클릭

### 로그인
- 아이디: `admin`
- 비밀번호: `admin1234`

로그인되면 **이관 성공!** 🎉

> 접속이 안 되면 13단계(문제 해결)를 보세요.

---

## 10. admin 계정 / 샘플 데이터 정리

### 기본 비밀번호 변경
처음 로그인한 뒤 admin 비밀번호(admin1234)는 **반드시 변경**하세요
(우측 상단 프로필 → 비밀번호 변경).

### 샘플 업무 5개가 거슬린다면
첫 기동 시 생성된 예시 업무를 비우려면:
```bash
docker compose exec db psql -U postgres -d task_manager -c "TRUNCATE tasks CASCADE;"
```

---

## 11. 평소 운영 명령어

모두 `/opt/flowdesk` 폴더 안에서 실행합니다 (`cd /opt/flowdesk`).

| 하고 싶은 것 | 명령어 |
|--------------|--------|
| 상태 확인 | `docker compose ps` |
| 전체 로그 보기 | `docker compose logs -f` |
| 백엔드 로그만 | `docker compose logs -f backend` |
| 재시작 | `docker compose restart` |
| 중지 (데이터 유지) | `docker compose down` |
| 다시 시작 | `docker compose up -d` |

### 코드 업데이트 (개발 노트북에서 GitHub에 push한 뒤)
```bash
cd /opt/flowdesk
git pull                       # 최신 코드 받기
docker compose up -d --build   # 다시 빌드 + 반영
```

---

## 12. 데이터 백업 (운영 시작 후 정기적으로!)

> 먼저 볼륨 이름을 확인하세요: `docker volume ls` → `flowdesk_db_data`,
> `flowdesk_uploads_data` 같은 이름이 보입니다(앞 글자는 폴더명에 따라 다름).
> 아래 명령의 볼륨 이름을 실제 이름으로 바꿔 쓰세요.

### 데이터베이스 백업
```bash
cd /opt/flowdesk
docker compose exec db pg_dump -U postgres -d task_manager > backup_$(date +%F).sql
```
→ `backup_2026-06-17.sql` 같은 파일이 생깁니다. 이 파일을 안전한 곳에 보관하세요.

### 업로드 파일(첨부) 백업
```bash
docker run --rm -v flowdesk_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
```

### 데이터베이스 복원 (필요 시)
```bash
cat backup_2026-06-17.sql | docker compose exec -T db psql -U postgres -d task_manager
```

---

## 13. 문제 해결 (자주 나는 상황)

### ❌ 브라우저에서 접속이 안 됨
1. 서버에서 `docker compose ps`로 세 컨테이너가 떠 있는지 확인.
2. 서버에서 직접 응답 확인:
   ```bash
   curl -k -s -o /dev/null -w "%{http_code}\n" https://localhost:5443/
   ```
   → `200`이 나오면 앱은 정상, **네트워크/방화벽 문제**입니다.
   - `.env`의 `BIND_ADDR=0.0.0.0` 확인 → 바꿨다면 `docker compose up -d`로 재적용.
   - 방화벽 확인: `sudo ufw status` → 5443 열려 있는지.
   - 접속 PC와 서버가 같은 네트워크인지 확인.

### ❌ `docker compose build`에서 멈추거나 실패
- 인터넷 연결 확인 (`ping -c 3 github.com`).
- 디스크 공간 확인: `df -h` → 가득 찼으면 `docker system prune -a`로 정리.

### ❌ backend 로그에 `DATA_ENCRYPTION_KEY` 관련 에러
- `.env`에 `DATA_ENCRYPTION_KEY` 값이 비어 있거나 64자리 hex가 아닙니다.
  6-2의 (2) 명령으로 다시 생성해 채운 뒤 `docker compose up -d backend`.

### ❌ backend가 계속 재시작됨 (DB 연결 실패)
- `docker compose logs db`로 DB가 정상인지 확인.
- `.env`의 `DB_PASSWORD`를 바꿨다면, **기존 DB 볼륨에는 옛 비밀번호가 남아** 충돌할 수
  있습니다. 데이터가 없는 초기 상태라면:
  ```bash
  docker compose down -v     # ⚠️ -v는 데이터까지 삭제! 초기 상태에서만 사용
  docker compose up -d
  ```

### ❌ SSH 접속이 끊겨서 다시 안 됨
- 방화벽에서 OpenSSH를 안 열었을 수 있습니다. 서버에 모니터를 직접 연결해
  `sudo ufw allow OpenSSH` 실행.

### 컨테이너 안을 들여다보고 싶을 때
```bash
docker compose exec backend sh    # 백엔드 컨테이너 내부 셸 진입 (나올 땐 exit)
docker compose exec db psql -U postgres -d task_manager   # DB 직접 접속
```

---

## 14. 용어 빠른 정리

| 용어 | 쉬운 설명 |
|------|-----------|
| SSH | 내 PC에서 서버를 원격 조종하는 보안 통로 |
| Docker | 앱을 상자(컨테이너)에 담아 통째로 실행하는 도구 |
| 컨테이너 | 실행 중인 앱 상자 (db/backend/frontend) |
| 이미지 | 컨테이너를 만드는 설계도(빌드 결과물) |
| 볼륨 | 컨테이너가 꺼져도 유지되는 데이터 저장소 |
| `.env` | 비밀번호·키를 담는 설정 파일 (git 제외) |
| 마이그레이션 | DB 표 구조를 코드에 맞게 만드는 작업 |
| 시드(seed) | 초기 기본 데이터(admin 계정 등) 생성 |
| 방화벽(ufw) | 서버로 들어오는 통로를 제한하는 보안 장치 |

---

문서대로 진행하다 막히는 부분이 있으면, **어느 단계의 어떤 메시지**에서 멈췄는지
그대로 알려주세요. 바로 도와드리겠습니다.
