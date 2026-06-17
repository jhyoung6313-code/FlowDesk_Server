# 통제항목 이행 체크리스트 (시스템 매핑)

본 릴리즈에서 **코드로 이행한 통제항목**과 **남은 관리적/인프라 조치**를 요약합니다.

## ✅ 코드 구현 완료 (이번 릴리즈)
| ISMS-P 통제 | 구현 내용 | 위치 |
|------------|----------|------|
| 2.5.3 사용자 인증 | OTP 2단계 전사 강제 | `authController`, `config/security.js` |
| 2.5.4 비밀번호 관리 | 9자/3종/90일/직전5개 재사용금지 | `utils/passwordPolicy.js` |
| 2.6.2 시스템 접근 | 계정잠금(5회→30분) | `authController.login` |
| 2.6.7 세션관리 | JWT 1h, 유휴 30분, 비번변경 시 토큰무효화 | `middlewares/auth.js` |
| 2.7.1 암호화 | AES-256-GCM 유틸, bcrypt cost 12 | `lib/crypto.js` |
| 2.9.4 접속기록 | AuditLog 3년 보관 (append-only) | `services/auditService.js` |
| 2.9.5 로그 검토 | 비정상탐지 자동스캔 + 관리자 조회 | `services/anomalyService.js`, `admin/audit-log` |
| 2.9.7 폐기 | 보유기간 자동파기 + 파기대장 | `services/retentionService.js` |
| 2.11.3 이상행위 분석 | 규칙기반 6종 탐지 | `services/anomalyService.js` |
| 3.2.3 이용통제 | PII_READ·DATA_EXPORT 감사 | `middlewares/auditLogger.js` |
| 3.1.4 민감정보 | 암호화 유틸 + 마스킹 | `lib/crypto.js`, `utils/masking.js` |
| 3.4.1 파기 | 물리삭제 + 파일 unlink | `services/retentionService.js` |

## ✅ 코드 구현 완료 (추가 — 인프라/패치)
| ISMS-P 통제 | 구현 내용 | 위치 |
|------------|----------|------|
| 2.10.3 공개서버 보안 | **helmet 보안헤더**(HSTS·X-Frame-Options·nosniff·CORP·X-Powered-By 제거) | `app.js` |
| 2.10.8 패치관리 | 의존성 취약점 **0건** 달성 | `package.json` |
| 2.7.2 키 관리 | `DATA_ENCRYPTION_KEY` 설정·동작 검증 | `backend/.env`(gitignore) |

## 🟡 부분 구현 — 보완 필요
| 항목 | 보완 조치 |
|------|----------|
| 2.6.1 망분리 | 의무 대상 여부 확인 후 적용 |
| 2.6.4 DB 접근통제 | DB 계정 비밀번호 강화·접근 IP 제한 → `INFRA_HARDENING.md` |
| 2.7.2 키 관리 | 현재 `.env` 분리 적용. 운영은 KMS/Vault 검토 |
| 2.10.3 공개서버 보안 | helmet 적용 완료. 운영 HTTPS에서 HSTS 발효 |
| 2.10.8 패치관리 | `npm audit` 정례화(CI 자동화 권장) |

### 의존성 취약점 조치 이력 (2.10.8)
| 일자 | 조치 | 결과 |
|------|------|------|
| 2026-06-15 | `npm audit fix` (비파괴 패치) | 12건 → 3건 |
| 2026-06-15 | xlsx 0.18.5 → **0.20.3 (SheetJS CDN 패치본)** | high 1건 해소 → 2건 |
| 2026-06-15 | **node-cron 3.0.3 → 4.2.1** (uuid 의존성 제거, `crypto.randomUUID` 전환) | moderate 2건 해소 → **0건** |

**현재 잔여 취약점: 0건** ✅

## ⬜ 관리적·인프라 조치 (코드 외, 확인 필요)
| 항목 | 담당 |
|------|------|
| HTTPS/TLS 1.2+ 인증서 적용 | 인프라 |
| CISO/CPO 지정, 전담조직 구성 | 경영진 |
| 개인정보처리방침 게시 | 법무/컴플라이언스 |
| 처리위탁·제3자제공·접근권한 관리대장 | 개인정보보호 담당 |
| 임직원 보안교육 (연 1회↑) | 인사 |
| 위험평가·내부감사 (연 1회↑) | 보안조직 |
| 침해사고 대응절차·BCP/DRP 수립 | 보안조직 |
| ISMS-P 인증 의무대상 여부 판단 | 법무 |

## 핵심 환경변수 적용 확인
```
ENFORCE_OTP=true
JWT_EXPIRES_IN=1h
BCRYPT_ROUNDS=12
DATA_ENCRYPTION_KEY=<설정 필수>
RETENTION_AUDIT_DAYS=1095
```

## DB 마이그레이션 (필수 선행)
```bash
cd backend && npm install
npx prisma migrate dev --name add_security_audit_fields
npx prisma generate
```
