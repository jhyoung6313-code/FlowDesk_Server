# e2e — 화면·계정 분리 자동 검증

실제 브라우저(헤드리스 Edge/Chrome)와 실제 서버·DB 로 FlowDesk 의 핵심 화면과 계정 분리를 검증합니다.
단위 테스트(`backend/__tests__`, DB 모킹)가 못 잡는 문제 — 화면 연결, 서버·DB 와의 실제 상호작용, 계정 간 혼선 — 을 잡는 용도입니다.

> ⚠ **개발 환경 전용.** 스위트는 테스트 계정(admin / member1 / member2, 비밀번호 `admin1234` / `member1234`)의 세션 토큰을
> DB 의 현재 세션 값으로 직접 서명해 사용하고, 설정·업무 상태·가계부·OTP 상태 등을 **일시 변경한 뒤 원복**합니다.
> 서버·DB 가 모두 `localhost` 가 아니거나 `NODE_ENV=production` 이면 실행을 거부합니다. 운영 환경에는 절대 실행하지 마세요.

## 준비

```bash
# 1) 개발 서버가 떠 있어야 합니다: 프런트 http://localhost:3000, 백엔드 http://localhost:4000, PostgreSQL
bash restart.sh            # 또는 restart.bat

# 2) 의존성 (한 번만) — puppeteer-core 는 브라우저를 내려받지 않습니다
cd e2e && npm install

# 3) 브라우저: 설치된 Edge/Chrome 을 자동으로 찾습니다. 못 찾으면 경로 지정
#    set E2E_BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe
```

테스트 계정이 DB 에 있어야 합니다(`cd backend && npm run seed`). `member2` 비밀번호가 변경 주기를 넘겼으면 로그인 직후 `/profile`
로 이동하는 것이 정상 동작입니다(스위트가 이를 고려합니다).

## 실행

```bash
cd e2e
npm test                 # 전체 (약 15분: 화면 스위트 사이에 속도 제한 회피용 대기 포함)
npm run test:api         # 브라우저 없이 API 만 (05, 06) — 1분 이내
npm run test:ui          # 화면 스위트 (01~04)
npm run test:otp         # OTP 등록·인증·비밀번호 초기화 (07, 보조 서버를 자동으로 띄웠다 끔)
node run-all.js --only 03,04 --gap 20      # 일부만 / 대기 시간 조정
```

종료 코드는 모두 통과해야 0, 하나라도 FAIL 이거나 항목이 하나도 실행되지 않으면 1 입니다. 스크린샷은 `e2e/shots/`(git 제외)에 저장됩니다.

## 스위트

| 파일 | 내용 | 계정 |
|---|---|---|
| `01-nav-widgets-admin-identity` | 레일 메뉴 편집·서버 저장, 대시보드 위젯 추가·저장, 사용자 관리 "접속 중"·강제 로그아웃, 다른 탭 계정 변경 시 자동 새로고침, 로그아웃 시 캐시·상태 초기화 | member1, member2, admin(토큰) |
| `02-home-layouts` | 메인 화면 선택(기본 + A·C·E·F), 서버 저장·새로고침 유지, 집중 타이머, 빠른 메모, 칸반 드래그, 기본으로 복귀 | member1 |
| `03-login` | 파스텔 대화형 로그인: 대화 진행, 틀린 비밀번호, **중복 로그인 안내**, 성공 로그인, 비밀번호 초기화 시작, 안내 배너, 390px 폭 | member2 |
| `04-review-fixes` | 코드 리뷰 조치 회귀: 업무 범위 전환, 업무 상세 딥링크, 칸반 낙관적 갱신, 레이아웃 로드 실패 복구, 서버 설정 검증, 자동 채움 안전장치, "처음부터" 비활성 | member1, member2 |
| `05-account-isolation-api` | 계정별 설정(메뉴·테마·대시보드) 분리, 알림은 본인 것만, 옛 세션의 알림 스트림 거부 | member1, member2 |
| `06-single-login-ledger-api` | **1계정 1로그인**(중복 거부·로그아웃 후 재로그인·관리자 강제 로그아웃) + **가계부 개인 분리** | member2 (+member1 토큰) |
| `07-otp-enroll-verify-reset` | OTP 최초 등록(QR)·OTP 인증·비밀번호 초기화 전체(OTP → 새 비밀번호 규칙 → 확인) — 개발 서버가 OTP 를 안 쓰므로 `ENFORCE_OTP=true` 보조 서버(4001/3001)를 자동 기동 | member2 |

## 알아둘 점

- **속도 제한**: 일반 API 는 IP당 분당 300회입니다(`backend/src/app.js`). 한 화면 로드가 약 40건이라, 스위트를 연달아 돌리면 429 가 날 수 있어 `run-all.js` 가 사이에 쉽니다.
- **보조 서버(07)**: `DISABLE_SCHEDULERS=true` 로 cron 이 중복 실행되지 않게 하고 같은 DB 를 씁니다. 포트 4001/3001 이 비어 있어야 합니다.
- **원복**: 각 스위트는 종료 시 건드린 설정·상태를 되돌립니다. 도중에 강제 종료하면 member2 의 OTP·비밀번호(07), 업무 상태(02·04), `last_active_at` 이 남을 수 있으니 `npm run test:otp` 를 한 번 더 끝까지 돌리거나 DB 를 확인하세요.
- **새 스위트 추가**: `suites/NN-이름.js` 를 만들고 `require('../lib/env')` 로 설정을 가져옵니다. `PASS/FAIL  항목명` 형식으로 한 줄씩 출력하면 `run-all.js` 가 집계합니다.
