-- ============================================================================
-- FlowDesk 코드리뷰 검증 쿼리 — feat/m365-gap-features
-- 대상 DB: PostgreSQL 17, flowdesk_server (localhost:5432, postgres/postgres1234)
-- 목적: CODE_REVIEW_m365-gap-features.md에 기재된 발견 사항의 실제 데이터 영향
--       범위(건수)를 확인한다. 코드 수정 여부와 무관하게 매 리뷰 라운드마다
--       실행해 "이론상 버그"와 "실제로 몇 건에 영향을 미치는 버그"를 구분한다.
-- 실행: psql -U postgres -d flowdesk_server -f CODE_REVIEW_VERIFY.sql
--       (또는 섹션별로 필요한 쿼리만 발췌 실행)
-- 주의: 전부 SELECT 전용(읽기 전용) — 데이터를 변경하지 않는다.
-- ============================================================================


-- ============================================================================
-- §2. RAG(ragService.js)이 기밀 게이트를 우회 — 실제 노출 가능 대상 규모
-- (CODE_REVIEW_m365-gap-features.md 2절)
-- ============================================================================

-- 2-1. 기밀(confidential) BBS 게시글 — RAG 쿼리는 sensitivity 필터가 전혀 없으므로
--      아래 전부가 AI 질의응답으로 유출 가능한 대상이다.
SELECT id, title, category_id, created_by, sensitivity, created_at
FROM bbs_posts
WHERE del_yn = '0' AND sensitivity = 'confidential'
ORDER BY created_at DESC;

-- 2-2. "공개 스페이스"에 있지만 기밀로 표시된 위키 문서
--      (RAG는 space.visibility만 체크하고 doc.sensitivity는 체크하지 않음 → 이 목록 전부가 위험군)
SELECT wd.id, wd.title, wd.space_id, ws.visibility AS space_visibility,
       wd.sensitivity, wd.created_by, wd.updated_at
FROM wiki_docs wd
JOIN wiki_spaces ws ON ws.id = wd.space_id
WHERE wd.del_yn = '0'
  AND wd.sensitivity = 'confidential'
  AND ws.visibility = 'public'
ORDER BY wd.updated_at DESC;

-- 2-3. 비멤버에게 새는 보드 카드 규모 참고용 — 보드 총 카드 수 대비 board_members 없는 보드 수
--      (RAG boardCard 쿼리는 멤버십 필터 자체가 없음 → 사실상 전체 board_cards가 노출 대상)
SELECT COUNT(*) AS total_board_cards_exposed
FROM board_cards bc
JOIN boards b ON b.id = bc.board_id;


-- ============================================================================
-- §3. 자동화(automationService.js) EVENT_CATALOG 중 미배선 이벤트로 만들어진
--     "영구 무동작" 규칙 탐지
-- ============================================================================

-- 3-1. 절대 발화되지 않는 5개 이벤트(approval.approved/rejected, bbs.post_created,
--      okr.at_risk, meeting.finished)로 등록된 활성 규칙 — 있다면 즉시 관리자 통지 필요
SELECT id, name, event, is_active, run_count, last_run_at, last_error, created_by, created_at
FROM automation_rules
WHERE event IN ('approval.approved', 'approval.rejected', 'bbs.post_created', 'okr.at_risk', 'meeting.finished')
ORDER BY created_at DESC;

-- 3-2. 활성 상태인데 run_count=0인 모든 규칙(=배선 누락이든 아니든 "한번도 안 돈" 규칙 전수 확인용)
SELECT id, name, event, created_at,
       (now() - created_at) AS age
FROM automation_rules
WHERE is_active = true AND run_count = 0
ORDER BY created_at ASC;


-- ============================================================================
-- §4. 위임 알림(Notification.message VarChar(500)) 초과 위험 사전 점검
-- ============================================================================

-- 4-1. 기존 알림 중 450자 이상(500자 한도에 근접) 사례 — 실제로 잘림/에러가 날 뻔한 사례가 있었는지
SELECT id, user_id, type, length(message) AS msg_len, left(message, 80) AS preview, created_at
FROM notifications
WHERE length(message) >= 450
ORDER BY length(message) DESC;

-- 4-2. approval_steps.acting_type(VarChar(10)) 현재 사용 중인 값 분포 —
--      이미 '위임(...)' 형태로 저장된 게 있는지(있다면 과거에 짧은 이름에서만 운좋게 통과한 것)
SELECT acting_type, length(acting_type) AS len, count(*)
FROM approval_steps
WHERE acting_type IS NOT NULL
GROUP BY acting_type
ORDER BY len DESC;

-- 4-3. 위임 대상이 될 수 있는 사용자 중 표시이름이 길어 actingType 초과를 유발할 사람 목록
--      (표시이름 6자 이상이면 "위임(" + 이름 + ")" 이 10자를 초과)
SELECT id, username, display_name, length(display_name) AS name_len
FROM users
WHERE length(display_name) >= 6
ORDER BY name_len DESC;


-- ============================================================================
-- §5. 보낸편지함 삭제 불가 메일 — 실제 영향 건수
-- (deleteSent가 라우트에 연결되지 않고, trash()는 recipient row가 없으면 404)
-- ============================================================================

-- 5-1. 발신자 본인이 recipient(to/cc/bcc)로 포함되지 않은 발송 메일 =
--      현재 UI에서 "휴지통으로 이동"을 눌러도 실제로는 삭제되지 않는 메일 전체
SELECT im.id, im.from_user_id, u.display_name AS sender, im.subject, im.created_at
FROM internal_mails im
JOIN users u ON u.id = im.from_user_id
WHERE im.is_draft = false
  AND im.sender_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM internal_mail_recipients r
    WHERE r.mail_id = im.id AND r.user_id = im.from_user_id
  )
ORDER BY im.created_at DESC;

-- 5-2. 위 5-1의 총 건수 (영향 규모 요약)
SELECT count(*) AS undeletable_sent_mail_count
FROM internal_mails im
WHERE im.is_draft = false
  AND im.sender_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM internal_mail_recipients r
    WHERE r.mail_id = im.id AND r.user_id = im.from_user_id
  );


-- ============================================================================
-- §7. 백업/복원 도메인 커버리지 — 테이블별 현재 행 수
--     (v1.9~1.10 수정으로 아래 전부가 backupController.js의 EXTRA_TABLES/명시 블록에
--      포함됨. 이 쿼리는 이제 "미커버 규모"가 아니라 "커버 대상 데이터가 실제로 존재하는지"
--      회귀 확인용으로 매 라운드 재실행한다 — 값이 이전 라운드보다 줄었다면 백업/복원 경로에
--      데이터 유실이 생겼다는 신호.)
-- ============================================================================

SELECT 'approval_documents' AS table_name, count(*) FROM approval_documents
UNION ALL SELECT 'approval_steps', count(*) FROM approval_steps
UNION ALL SELECT 'bbs_posts', count(*) FROM bbs_posts
UNION ALL SELECT 'internal_mails', count(*) FROM internal_mails
UNION ALL SELECT 'chat_rooms', count(*) FROM chat_rooms
UNION ALL SELECT 'chat_messages', count(*) FROM chat_messages
UNION ALL SELECT 'boards', count(*) FROM boards
UNION ALL SELECT 'board_cards', count(*) FROM board_cards
UNION ALL SELECT 'wiki_docs', count(*) FROM wiki_docs
UNION ALL SELECT 'meetings', count(*) FROM meetings
UNION ALL SELECT 'objectives', count(*) FROM objectives
UNION ALL SELECT 'automation_rules', count(*) FROM automation_rules
UNION ALL SELECT 'forms', count(*) FROM forms
UNION ALL SELECT 'playbooks', count(*) FROM playbooks
UNION ALL SELECT 'ledger_entries', count(*) FROM ledger_entries
UNION ALL SELECT 'schedule_events', count(*) FROM schedule_events
ORDER BY 2 DESC;


-- ============================================================================
-- §12. AutomationRule 하드 삭제로 인한 AutomationLog 고아 레코드 확인
-- ============================================================================

SELECT al.id, al.rule_id, al.event, al.status, al.created_at
FROM automation_logs al
WHERE NOT EXISTS (SELECT 1 FROM automation_rules r WHERE r.id = al.rule_id)
ORDER BY al.created_at DESC;


-- ============================================================================
-- §H1(2회차 수정 검증). automation.fire()를 새로 배선한 5개 이벤트 —
-- 이제 활성 규칙이 생기면 실제로 실행돼야 한다. 배선 직후에는 0건이 정상(아직 아무도
-- 규칙을 안 만듦). 다음 라운드부터는 이 중 하나라도 생겼는데 run_count=0으로 오래
-- 머물러 있으면 배선이 다시 끊어졌다는 신호.
-- ============================================================================

SELECT id, name, event, is_active, run_count, last_run_at, last_error
FROM automation_rules
WHERE event IN ('approval.approved', 'approval.rejected', 'bbs.post_created', 'okr.at_risk', 'meeting.finished')
ORDER BY created_at DESC;


-- ============================================================================
-- 사용 안내 (매 리뷰 라운드 공통)
-- ============================================================================
-- 1) 새로운 발견 사항 중 "DB 상태로 영향 범위를 확인할 수 있는 것"이 있으면
--    이 파일 하단에 §<보고서 섹션 번호> 형식으로 쿼리를 추가한다(기존 쿼리는
--    보존 — 다음 라운드에서도 재실행해 추세를 비교할 수 있어야 하므로 삭제 금지).
-- 2) 각 쿼리 실행 결과(건수)는 CODE_REVIEW_*.md의 해당 발견 항목에
--    "검증 쿼리 결과: N건 (YYYY-MM-DD 기준)" 형태로 반영한다.
-- 3) 이 SQL은 전부 읽기 전용이며 CI/운영 DB에는 절대 직접 실행하지 않는다
--    (로컬 개발 DB에서만 실행).
-- ============================================================================
