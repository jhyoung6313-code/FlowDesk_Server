# tm-security — 개인정보 보호(PII) · 보안 강화 (F-56, F-57)

개인정보 입력 차단·검출로그·직무분리(F-56)와 세션·비밀번호·이상탐지·보관정책(F-57).
접속기록(감사로그) 자체는 [tm-auth] F-48 참조.

## 관련 파일

| 구분 | 경로 |
|------|------|
| PII 입력 차단 미들웨어 | `backend/src/middlewares/piiGuard.js` |
| PII 차단 서비스 | `backend/src/services/piiBlockService.js` |
| 권한 검사 미들웨어 | `backend/src/middlewares/requirePermission.js` |
| PII 검출로그 라우트 | `backend/src/routes/piiBlocks.js` |
| PII 검출로그 화면 | `frontend/src/pages/Admin/PiiBlockLog.jsx` |
| 이상징후 서비스 | `backend/src/services/anomalyService.js` |
| 보관정책 서비스 | `backend/src/services/retentionService.js` |
| 보안설정 서비스 | `backend/src/services/securitySettingsService.js` |
| 감사로그 서비스 | `backend/src/services/auditService.js` |
| 보안 상수/정책 | `backend/src/config/security.js`, `backend/src/utils/passwordPolicy.js` |
| 스키마 | `PiiBlockLog`, `PasswordHistory`, `User.permissions[]`, `User.sessionNonce` |

## F-56 개인정보 보호(PII)

### 입력 차단 (piiGuard)
- 요청 본문에서 **주민등록번호·신용카드번호·계좌번호·연락처** 등 PII 패턴 탐지 시 저장 전 차단
- `middlewares/piiGuard.js` + `services/piiBlockService.js`

### 검출로그 (PiiBlockLog)
- 차단 이벤트를 append-only 적재. **원문 미저장, 마스킹본(부분 비식별)만 보관**
- 기록: 사용자(삭제돼도 username 스냅샷)·IP·User-Agent·엔드포인트·PII유형·필드경로
- API: `GET /api/pii-blocks` (권한 `PII_AUDIT`, query: `piiType`, `userId`, `limit`, `offset`)

### 직무분리 (권한 레지스트리)
- role(admin/member)과 무관하게 `User.permissions[]` 집합으로 세밀 권한 부여
- 검출로그 열람은 **`PII_AUDIT` 권한 보유자만** (`requirePermission('PII_AUDIT')`) → 시스템 관리자와 감사자 분리
- 화면: `pii-audit` (`pages/Admin/PiiBlockLog.jsx`)

## F-57 보안 강화

- **단일 세션 강제**: `User.sessionNonce`로 최신 로그인만 유효. 다른 기기/탭 로그인 시 이전 세션 무효화
- **비밀번호 재사용 금지**: `PasswordHistory`에 과거 해시 이력 저장, 변경 시 재사용 차단
- **비밀번호 정책 단일화**: `config/security.js`의 `PASSWORD` + `utils/passwordPolicy.js`가 단일 기준(최소 8자·문자종류 4종 중 3종 이상, `.env` 조정). 신규/변경/재설정/관리자 계정생성 모두 `validateFormat` 사용
- **이상징후 탐지**: `services/anomalyService.js` — 비정상 접근 감지 시 감사로그 `ANOMALY_DETECTED` 적재
- **보관정책**: `services/retentionService.js` — 로그 보관기간 관리(접속기록 3년 요건, [tm-auth] F-48 연계)
- **보안설정**: `services/securitySettingsService.js` — 보안 관련 앱 설정 로드

## 감사 액션 (AUDIT_ACTION, config/security.js)
`LOGIN_SUCCESS`, `LOGIN_FAIL`, `LOGOUT`, `ACCOUNT_LOCKED`, `PASSWORD_CHANGE`, `PASSWORD_RESET`, `PII_READ`, `DATA_EXPORT`, `PERMISSION_DENIED`, `DATA_PURGE`, `ANOMALY_DETECTED`, `AI_REQUEST`([tm-ai] AI 호출)
