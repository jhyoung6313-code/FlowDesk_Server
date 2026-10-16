# 운영 · 상시 실행 가이드

서버가 꺼졌을 때 사용자가 로그인 화면조차 못 보는 일을 줄이기 위한 정리입니다. 환경별로 방법이 다릅니다.

| 환경 | 상시 실행 방식 | 비고 |
|---|---|---|
| **운영 서버 (Linux, Docker)** — 권장 | `docker-compose.yml` 의 `restart: unless-stopped` + `healthcheck` | 프로세스가 죽거나 서버가 재부팅돼도 컨테이너가 자동으로 다시 올라옵니다. 설치는 `SERVER_SETUP.md` 참고 |
| **Windows 개발/소규모 PC** | `ops/windows/register-autostart.ps1` (작업 스케줄러) | 로그온 시 자동 시작 + 2분마다 `/health` 감시·재기동 |
| 수동 | `restart.bat` / `restart.sh` | 한 번 띄우는 용도 (죽으면 다시 실행해야 함) |

## 1. 운영 서버 (Docker) — 확인할 것

```bash
docker compose ps                    # 모든 서비스 Up (healthy)
docker compose logs -f backend       # 기동 로그
curl -k https://<서버>/health        # {"status":"ok"}  (백엔드 /health, 인증 불필요·내부 정보 없음)
```

- 자동 재기동: 서비스마다 `restart: unless-stopped`. 서버 재부팅 후에도 Docker 서비스가 켜져 있으면 함께 올라옵니다(`systemctl enable docker`).
- 헬스체크가 실패하는 컨테이너는 `unhealthy` 로 표시됩니다. 외부 감시(예: 사내 모니터링)가 있다면 `/health` 를 주기적으로 호출하게 하세요.
- 여러 사용자가 프록시/NAT 한 대를 거쳐 접속하면 서버는 모두 같은 IP 로 보고 **IP당 분당 300회** 요청 한도에 함께 걸립니다.
  이 경우 `backend/.env` 에서 `API_RATE_LIMIT_MAX`(기본 300)와 필요하면 `LOGIN_RATE_LIMIT_MAX`(기본 10, 5분)를 환경에 맞게 올리세요.
  프록시가 `X-Forwarded-For` 를 넘기면 서버는 `trust proxy` 설정에 따라 실제 클라이언트 IP 로 집계합니다.

## 2. Windows PC — 자동 시작 + 감시

관리자 권한 PowerShell 에서(저장소 루트):

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\register-autostart.ps1     # 등록
Get-ScheduledTask -TaskName 'FlowDesk-*'                                          # 확인
powershell -ExecutionPolicy Bypass -File .\ops\windows\unregister-autostart.ps1   # 해제
```

- `FlowDesk-Start`: 로그온할 때 `restart.bat` 실행.
- `FlowDesk-Watchdog`: 2분마다 `http://localhost:4000/health` 와 `http://localhost:3000/` 를 확인해, 하나라도 응답이 없으면 `restart.bat` 으로 다시 띄웁니다.
  10분 안에 3회 넘게 재시작해야 하면(기동 자체가 실패하는 상태) 더 시도하지 않고 `ops/watchdog.log` 에 기록만 남깁니다 → 로그를 보고 원인을 확인하세요.
- 등록은 **PC 설정을 바꾸는 작업**이라 자동으로 실행하지 않았습니다. 필요할 때 직접 실행하세요.
- 서버를 일부러 내리려면 `stop.bat` 후 감시가 다시 켜지 않도록 `unregister-autostart.ps1` 로 해제하거나 `FlowDesk-Watchdog` 를 일시 중지하세요.

## 3. 로그 · 점검 순서 (서버가 안 열릴 때)

1. 포트: `netstat -ano | findstr ":3000 :4000 :5432"` — 5432(PostgreSQL)가 안 떠 있으면 서비스(`postgresql-x64-17`)부터 시작.
2. 백엔드 로그: `backend/backend.log` (Docker 는 `docker compose logs backend`).
3. 프런트 로그: `frontend/frontend.log`.
4. `/health` 확인: 응답이 있으면 백엔드는 정상, 프런트(3000) 문제.
5. 계속 죽으면 `ops/watchdog.log` 와 위 로그를 함께 확인.
