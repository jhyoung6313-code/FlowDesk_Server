-- FlowDesk 개인정보 안전성 확보조치 검증 SQL (SELECT 전용, append-only — 라운드별로 삭제하지 말고 계속 추가)
-- 실행 대상: 로컬 flowdesk_server DB (postgres/postgres1234)

-- [Round 1] 2026-09-30 — PRIVACY_SECURITY_AUDIT.md 대응
SELECT 'audit_log_PII_READ' AS metric, COUNT(*) FROM audit_logs WHERE action = 'PII_READ'
UNION ALL
SELECT 'audit_log_DATA_PURGE', COUNT(*) FROM audit_logs WHERE action = 'DATA_PURGE'
UNION ALL
SELECT 'audit_log_DATA_EXPORT', COUNT(*) FROM audit_logs WHERE action = 'DATA_EXPORT'
UNION ALL
SELECT 'audit_log_ANOMALY_DETECTED', COUNT(*) FROM audit_logs WHERE action = 'ANOMALY_DETECTED'
UNION ALL
SELECT 'pii_block_logs_total', COUNT(*) FROM pii_block_logs
UNION ALL
SELECT 'users_with_PII_AUDIT_permission', COUNT(*) FROM users WHERE 'PII_AUDIT' = ANY(permissions)
UNION ALL
SELECT 'audit_logs_total', COUNT(*) FROM audit_logs
UNION ALL
SELECT 'audit_logs_older_than_3y', COUNT(*) FROM audit_logs WHERE created_at < NOW() - INTERVAL '1095 days';

-- 결과 (2026-09-30 실측):
--             metric              | count
-- --------------------------------+-------
--  audit_log_PII_READ             |     0   <- High: PII 조회 감사 미기록
--  audit_log_DATA_PURGE           |     0   <- 정상(아직 파기 대상 없음, 운영 후 재확인)
--  audit_log_DATA_EXPORT          |     7   <- 정상
--  audit_log_ANOMALY_DETECTED     |    29   <- 정상
--  pii_block_logs_total           |     0   <- 정보: 차단 이력 없음(시도 없음 vs 미탐지 구분 필요)
--  users_with_PII_AUDIT_permission|     0   <- Critical: 검출로그 열람 가능자 없음
--  audit_logs_total               |   368
--  audit_logs_older_than_3y       |     0   <- 정상

-- [Round 2] 2026-09-30 — 조치 후 재검증
SELECT 'users_with_PII_AUDIT_permission' AS metric, COUNT(*) FROM users WHERE 'PII_AUDIT' = ANY(permissions);
-- 결과: 1 (admin 계정에 부여 완료, Critical 항목 조치 확인)
