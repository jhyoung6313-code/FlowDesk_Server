# tm-auth — 인증 및 사용자 관리 (F-01, F-11, F-15, F-22, F-48)

## 관련 파일

| 구분 | 경로 |
|------|------|
| 로그인 페이지 | `frontend/src/pages/Login/index.jsx` |
| 로그인 CSS | `frontend/src/pages/Login/login.css` |
| 프로필 페이지 | `frontend/src/pages/Profile/index.jsx` |
| 사용자 관리 (Admin) | `frontend/src/pages/Admin/Users.jsx` |
| 접속기록 화면 (Admin) | `frontend/src/pages/Admin/AuditLog.jsx` |
| Admin API 함수 | `frontend/src/api/admin.js` |
| 감사로그 서비스 | `backend/src/services/auditService.js` |
| Admin 라우트 (감사로그 조회) | `backend/src/routes/admin.js` |
| Auth API 함수 | `frontend/src/api/auth.js` |
| Auth 스토어 | `frontend/src/store/authStore.js` |
| Lock 스토어 | `frontend/src/store/lockStore.js` |
| 화면 잠금 컴포넌트 | `frontend/src/components/LockScreen/index.jsx` |
| 유휴 타임아웃 훅 | `frontend/src/hooks/useIdleTimeout.js` |
| Auth 컨트롤러 | `backend/src/controllers/authController.js` |
| Users 컨트롤러 | `backend/src/controllers/userController.js` |
| Auth 라우트 | `backend/src/routes/auth.js` |
| Users 라우트 | `backend/src/routes/users.js` |
| Auth 미들웨어 | `backend/src/middlewares/auth.js` |

---

## F-01. 로그인 (JWT 인증)

- username / password 기반 로그인, JWT 발급 (유효 8시간)
- Rate Limit: 5분/10회 (`express-rate-limit`)
- bcrypt 비밀번호 해싱
- `mustChangePassword` 플래그 → 로그인 후 `/profile` 강제 이동
- **비밀번호 입력 경고** (v1.9.1):
  - 한글 입력 시 → "한글 입력 감지 — 입력기를 영문으로 전환하세요" (amber 배너)
  - Caps Lock 켜져 있을 시 → "Caps Lock이 켜져 있습니다 — 비밀번호를 확인하세요" (amber 배너)
  - 구현: `LoginTab`의 `useEffect`에서 `pwRef.current.input`(DOM 엘리먼트)에 네이티브 이벤트 리스너 직접 부착
    - `input` + `compositionend` → 한글 정규식 `/[ㄱ-ㅎㅏ-ㅣ가-힣]/` 검사
    - `keydown` + `keyup` → `e.getModifierState('CapsLock')`으로 실제 Caps Lock 상태 감지
    - `capsLockRef`(useRef)로 키보드 이벤트 간 Caps Lock 상태 유지
  - password 필드는 브라우저가 IME 조합을 우회해 `inputEl.value`에 한글이 담기지 않음
  - 따라서 `e.key`로 한글 키 입력 자체를 감지(`koreanTyped` 로컬 플래그 유지), 필드 비워지면 초기화
  - Ant Design Form의 IME 억제를 우회하기 위해 React 합성 이벤트 대신 DOM 네이티브 이벤트 사용
  - CSS 클래스: `.pw-warning`, `.pw-warning-icon`, `@keyframes fade-in-warn`
- **API**: `POST /api/auth/login`
  - Request: `{ username, password }`
  - Response (정상): `{ token, user, mustChangePassword? }`
  - Response (OTP 필요): `{ requireTotp: true, preAuthToken }`
  - Response (OTP 미등록): `{ requireTotpSetup: true, preAuthToken }`

---

## F-11. OTP 2단계 인증 (TOTP)

- `otplib` v12 기반 TOTP
- 관리자가 개별 사용자에 대해 활성화 / QR코드 발급
- 로그인 흐름: login → (requireTotp) → OTP 검증 → JWT 발급
- 최초 등록 흐름: login → (requireTotpSetup) → QR 스캔 → 코드 입력 → JWT 발급
- 비밀번호 초기화 시에도 OTP 인증 단계 포함 (3-step 흐름)
- **API**:
  - `POST /api/auth/otp/setup-login` — QR 생성 (preAuthToken 필요)
  - `POST /api/auth/otp/enroll-login` — 최초 등록 + 로그인
  - `POST /api/auth/otp/verify` — OTP 검증 후 JWT 발급
  - `POST /api/users/:id/totp/enable` — 관리자: TOTP 활성화
  - `POST /api/users/:id/totp/disable` — 관리자: TOTP 비활성화

---

## F-15. 비밀번호 변경

- 현재 비밀번호 확인 후 신규 비밀번호 변경
- 정책: 9자 이상, 영대·소문자·숫자·특수문자 중 3종 이상
- 관리자는 모든 사용자 비밀번호 강제 재설정 가능
- **API**: `PUT /api/users/:id/password`
  - Request: `{ currentPassword, newPassword }` (관리자는 currentPassword 불필요)

---

## F-22. 사용자 관리 (관리자)

- 계정 생성/수정/비활성화, 역할(admin/member) 설정
- 아바타 색상 지정, TOTP 관리
- **API**:
  - `GET /api/users` — 사용자 목록
  - `POST /api/users` — 사용자 생성
  - `PUT /api/users/:id` — 사용자 수정
  - `DELETE /api/users/:id` — 사용자 삭제(비활성화)

---

## 미사용 화면 잠금 / 자동 로그아웃

- 사용자 설정 미사용 시간 초과 시 화면 잠금 (토큰 유지)
- 잠금 화면에서 비밀번호 입력으로 해제 또는 로그아웃
- 자정(00:00) 경과 시 자동 로그아웃 (일자 전환용)
- 설정: `/profile` > "미사용 화면 잠금" — 사용 안 함/10·30분/1·2·4시간, 기본 60분
- `User.idleTimeoutMin` 필드에 저장
- **API**:
  - `PUT /api/auth/idle-timeout` — 설정 저장
  - `POST /api/auth/verify-password` — 잠금 해제 비밀번호 검증

---

## F-48. 접속기록 (보안 감사로그)

- 로그인/로그아웃 등 보안 이벤트 이력을 `AuditLog` 테이블에 **append-only**로 적재 (위·변조 방지, 신용정보법 접속기록 3년 보관)
- 화면: 관리자 > 접속기록 (`Admin/AuditLog.jsx`) — 액션·사용자 필터 + "로그인만 보기" 빠른 필터, 페이지네이션
- **권한**: 백엔드 `routes/admin.js`의 `router.use(authenticate, adminOnly)` + 프런트 `<PrivateRoute adminOnly>` + 사이드바 메뉴 `isAdmin` 조건부 노출 (삼중 방어)
- **적재 지점**: `auditService.record({ action, req, userId, username, resource, ... })`
  - `LOGIN_SUCCESS` / `LOGIN_FAIL` / `ACCOUNT_LOCKED` → `authController` 로그인 경로
  - `LOGOUT` → `authController.logout` (v1.9.2 추가)
  - `PASSWORD_CHANGE` / `PASSWORD_RESET` → 비밀번호 변경·초기화
- **주의**: 클라이언트 측 로그아웃(localStorage 토큰만 제거)·토큰 만료·창 닫기는 `POST /api/auth/logout`을 타지 않아 기록되지 않음 (명시적 로그아웃 API 호출만 적재)
- **API**: `GET /api/admin/audit-log` (query: `action`, `userId`, `limit`, `offset`)

---

## 비밀번호 초기화 흐름 (3-step)

1. 아이디 입력 → `POST /api/auth/reset-password/request` → `resetOtpToken` 반환
2. OTP 입력 → `POST /api/auth/reset-password/verify-otp` → `resetPwToken` 반환
3. 새 비밀번호 입력 → `POST /api/auth/reset-password/confirm`

---

## 주요 상태 / 스토어

| 항목 | 설명 |
|------|------|
| `authStore.user` | 로그인 사용자 정보 |
| `authStore.token` | JWT 토큰 (localStorage) |
| `authStore.setAuth(token, user)` | 로그인 상태 저장 |
| `authStore.logout()` | 로그아웃 (localStorage 정리) |
| `lockStore.locked` | 화면 잠금 여부 |

---

## 변경 이력

| 버전 | 내용 |
|------|------|
| v1.9 | F-01~F-22 기본 구현 완료 |
| v1.9.1 | 비밀번호 입력 시 한글/Caps Lock 감지 경고 배너 추가 — 네이티브 DOM 이벤트 기반, `getModifierState('CapsLock')` 활용 |
| v1.9.2 | F-48 접속기록(보안 감사로그) 추가 — `logout`에 `LOGOUT` 감사로그 적재 + 관리자 전용 접속기록 조회 화면(`Admin/AuditLog.jsx`, `GET /api/admin/audit-log`) |
