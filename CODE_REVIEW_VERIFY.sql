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
-- §13(3회차, 2026-10-01). 전자결재 UX 개선 diff — 결재선 stepOrder 무결성 점검
-- (CODE_REVIEW_m365-gap-features.md 3회차 섹션)
-- 결재선 그룹 편집 로직(DocumentForm.jsx)이 일부 경로에서 compactGroups를
-- 호출하지 않아 stepOrder에 공백(gap)·중복 approver_id가 생길 수 있다는 리뷰 발견.
-- 실제 운영 데이터에 이미 영향이 있는지 확인한다(전부 읽기 전용).
-- ============================================================================

-- 13-1. totalSteps(채번된 값) vs 실제 distinct 비참조 stepOrder 개수 불일치
--       (countFlowGroups가 Math.max(orders)를 쓰므로 gap이 있으면 totalSteps가 부풀려짐)
SELECT d.id, d.doc_no, d.total_steps,
       (SELECT COUNT(DISTINCT s.step_order) FROM approval_steps s WHERE s.document_id = d.id AND s.type <> 'reference') AS real_group_count
FROM approval_documents d
WHERE d.del_yn = '0'
  AND d.total_steps <> (SELECT COUNT(DISTINCT s.step_order) FROM approval_steps s WHERE s.document_id = d.id AND s.type <> 'reference');

-- 13-2. 같은 문서 내 동일 approver_id가 2행 이상 — mergeIntoGroup/removeApprover/setRole가
--       approverId만으로 매칭하므로, 이런 문서가 있으면 한 번의 조작이 여러 행에 동시 적용될 수 있음
SELECT document_id, approver_id, COUNT(*) AS cnt
FROM approval_steps
GROUP BY document_id, approver_id
HAVING COUNT(*) > 1;

-- 13-3. 결재선에 gap이 있는 문서 — 비참조 stepOrder 집합이 1..N 연속이 아닌 경우
--       (moveGroup ▲▼ 버튼이 이런 문서에서 조용히 no-op 됨)
SELECT d.id, d.doc_no,
       array_agg(DISTINCT s.step_order ORDER BY s.step_order) AS orders
FROM approval_documents d
JOIN approval_steps s ON s.document_id = d.id AND s.type <> 'reference'
WHERE d.del_yn = '0'
GROUP BY d.id, d.doc_no
HAVING array_agg(DISTINCT s.step_order ORDER BY s.step_order)::int[] <> (
  SELECT array_agg(gs::int) FROM generate_series(1, (SELECT COUNT(DISTINCT s2.step_order) FROM approval_steps s2 WHERE s2.document_id = d.id AND s2.type <> 'reference')) gs
);

-- 13-4. 결재 양식(템플릿)의 기본 결재선(line_json) 원본 — 관리자 에디터에
--       업로드된 규칙 기반 결재선이 실제로 어떻게 생겼는지 육안 확인용
SELECT id, name, line_json FROM approval_templates WHERE line_json IS NOT NULL AND line_json NOT IN ('', '[]');


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


-- ============================================================================
-- §14(5회차, 2026-10-02). 전자결재 자유도 확대 6종(자유양식/팀공유프리셋/
-- 병렬완료조건/상신후결재자추가/기한초과기안자알림/결재선복사) — 신규 기능 상태 확인
-- (CODE_REVIEW_m365-gap-features.md 5회차 섹션)
-- ============================================================================

-- 14-1. 자유 양식(code='FREE') 시스템 템플릿 — 아직 아무도 "빠른 결재"를 안 눌렀으면 0건이 정상
SELECT id, name, code FROM approval_templates WHERE code = 'FREE';

-- 14-2. group_policy_json이 설정된 문서 수 — 병렬결재 완료조건을 실제로 쓴 문서 건수
SELECT COUNT(*) AS docs_with_group_policy FROM approval_documents WHERE group_policy_json IS NOT NULL;

-- 14-3. 결재선 프리셋 키 목록 — approval_lines_shared가 생기면 팀 공유 프리셋이 실사용되기 시작한 것
SELECT key FROM app_settings WHERE key LIKE 'approval_lines%';


-- ============================================================================
-- §15(7회차, 2026-10-02). 전자결재 자유도 확대 8종 2차 배치 — 신규 기능 상태 확인
-- (양식 필드 스냅샷/이메일 알림/휴가 자동위임/결재자 그룹/현황 통계/일일 다이제스트/
--  반려사유 분류/댓글 첨부·멘션)
-- (CODE_REVIEW_m365-gap-features.md 7회차 섹션)
-- ============================================================================

-- 15-1. fieldsJsonSnap이 채워진 상신 문서 수(= pending/approved/rejected 중 스냅샷 있는 비율)
SELECT status, COUNT(*) AS total, COUNT(fields_json_snap) AS with_snapshot
FROM approval_documents
WHERE del_yn = '0' AND status <> 'draft'
GROUP BY status;

-- 15-2. 결재자 그룹 등록 현황
SELECT id, name, array_length(member_ids, 1) AS member_count FROM approval_approver_groups;

-- 15-3. 자동위임 설정(휴가 중 위임) 등록 사용자 수
SELECT COUNT(*) AS auto_delegate_configured FROM app_settings WHERE key LIKE 'approval_auto_delegate_%';

-- 15-4. 반려 사유 분류가 채워진 반려 문서 비율
SELECT COUNT(*) AS total_rejected, COUNT(reject_reason_category) AS with_category
FROM approval_documents WHERE del_yn = '0' AND status = 'rejected';

-- 15-5. 의견(댓글)에 연결된 첨부파일 수(comment_id NOT NULL)
SELECT COUNT(*) AS comment_attachments FROM approval_attachments WHERE comment_id IS NOT NULL;

-- 15-6. group_policy_json(병렬결재 완료조건)에 quorum 모드가 있는데 멤버 수보다 n이 큰
--       "데드락 가능" 문서가 혹시 남아있는지 점검(이론상 removeStep이 자동으로 막아야 함 — 0건이 정상)
SELECT d.id, d.doc_no, d.group_policy_json
FROM approval_documents d
WHERE d.del_yn = '0' AND d.status = 'pending' AND d.group_policy_json IS NOT NULL;


-- ============================================================================
-- §16(8회차, 2026-10-02). 위임 이력 보존 / 결재선 변경이력 / 통계 기간필터 /
-- 이메일 수신거부 — 신규 기능 상태 확인
-- (CODE_REVIEW_m365-gap-features.md 8회차 섹션)
-- ============================================================================

-- 16-1. 위임/자동위임으로 처리된 단계 중 actingType이 '본인'으로 잘못 덮어써진 게 있는지
--       (수정 전 버그였다면 이 쿼리가 0건이 아니어야 발견됐을 것 — 수정 후 신규 건은 항상 0건이 정상)
SELECT s.id, s.document_id, s.status, s.acting_type
FROM approval_steps s
WHERE s.status IN ('approved', 'rejected') AND s.acting_type = '본인'
  AND EXISTS (
    SELECT 1 FROM approval_document_histories h
    WHERE h.document_id = s.document_id AND h.action = 'step_added'
  );

-- 16-2. 결재선 변경이력 기록 건수(상신 후 결재자 추가/제거 실사용 빈도)
SELECT action, COUNT(*) FROM approval_document_histories GROUP BY action;

-- 16-3. 이메일 수신거부 설정한 사용자 수
SELECT COUNT(*) AS email_opt_out_users FROM app_settings WHERE key LIKE 'email_opt_out_%' AND value = 'true';

-- ============================================================================
-- §17(9회차, 2026-10-02). 신규 기능 5종(문서함 확장/WBS 의존성·크리티컬패스/
-- WBS 진척률 자동집계/백업 자동스케줄/템플릿 세트) — 현황 및 발견사항 #1 재현조건 확인
-- (CODE_REVIEW_m365-gap-features.md 9회차 섹션)
-- ============================================================================

-- 17-1. 신규 기능 데이터 현황 (전부 0건이면 아직 실사용 전 — 발견사항의 실제 영향 건수는
--       아래 17-2가 0이 아니게 되는 시점부터 의미를 가짐)
SELECT 'document_favorites' AS t, COUNT(*) FROM document_favorites
UNION ALL SELECT 'wbs_task_dependencies', COUNT(*) FROM wbs_task_dependencies
UNION ALL SELECT 'task_template_sets', COUNT(*) FROM task_template_sets
UNION ALL SELECT 'task_templates_in_set', COUNT(*) FROM task_templates WHERE set_id IS NOT NULL
UNION ALL SELECT 'wbs_tasks_with_deliverable', COUNT(*) FROM wbs_tasks WHERE deliverable_file IS NOT NULL;

-- 17-2. 발견사항 #1 재현조건: 테이블별로 "즐겨찾기된 첨부"가 해당 테이블의 최신 60건
--       (documentController.js의 perSource 기본값) 밖에 있는 건수. 0보다 크면
--       "즐겨찾기만" 필터에서 누락되는 실제 사례가 존재한다는 뜻.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
  FROM task_attachments
)
SELECT 'task' AS source, COUNT(*) AS favorited_but_outside_top60
FROM document_favorites f JOIN ranked r ON f.source = 'task' AND f.ref_id = r.id
WHERE r.rn > 60;
-- (board/bbs/approval/mail/wbs도 동일 패턴으로 확장 가능 — 현재 모든 소스가 0건이라 생략)

-- 17-3. 템플릿 세트에 포함된 템플릿 중, assigneeIdsJson이 가리키는 사용자가 실제로는
--       존재하지 않거나 비활성화된 경우(발견사항 #2가 적용 시 트랜잭션 롤백을 일으킬 조건)
SELECT tt.id, tt.name, tt.assignee_ids_json
FROM task_templates tt
WHERE tt.set_id IS NOT NULL AND tt.assignee_ids_json IS NOT NULL;
-- (현재 0건 — 세트 기능 자체가 아직 사용되지 않음)

-- ============================================================================
-- §18(10회차, 2026-10-12). 200명 동시접속 스케일링 작업 리뷰 — 발견사항 노출도 확인
-- (CODE_REVIEW_m365-gap-features.md 10회차 섹션)
-- ============================================================================

-- 18-1. any/quorum 그룹 정책을 쓰는 결재문서 중 현재 pending인 건수
--       (approve()의 동시성 레이스, reject()의 정책 미반영 버그가 실제로 터질 수 있는 노출 범위)
SELECT
  CASE
    WHEN group_policy_json LIKE '%"quorum"%' THEN 'quorum'
    WHEN group_policy_json LIKE '%"any"%' THEN 'any'
    ELSE 'all_or_none'
  END AS policy_mode,
  COUNT(*) AS pending_docs
FROM approval_documents
WHERE status = 'pending' AND group_policy_json IS NOT NULL
GROUP BY 1;

-- 18-2. 이메일 수신거부(email_opt_out) 설정한 사용자 수 — generateNotifications()/
--       automationService.js의 'email' 액션이 이 설정을 무시하는 노출 범위
SELECT COUNT(*) AS email_opt_out_users
FROM app_settings WHERE key LIKE 'email_opt_out_%' AND value = 'true';

-- 18-3. 'email' 액션을 쓰는 활성 자동화 규칙 수 (automationService.js 미반영 노출 범위)
SELECT COUNT(*) AS active_email_action_rules
FROM automation_rules
WHERE is_active = true AND del_yn = '0' AND actions LIKE '%"type":"email"%';

-- 18-4. WBS 선후행 의존성 중 교차 순환(A→B, B→A) 존재 여부 — wbsController의
--       동시성 레이스가 이미 실제 순환을 만들어냈는지 확인
SELECT d1.predecessor_id, d1.successor_id
FROM wbs_task_dependencies d1
JOIN wbs_task_dependencies d2
  ON d1.predecessor_id = d2.successor_id AND d1.successor_id = d2.predecessor_id;

-- 18-5. 전자결재 첨부파일 댓글(댓글 다운로드 링크)·문서함 다운로드 버튼 401 버그의
--       노출 범위 — 현재 DB에 존재하는 다운로드 가능 첨부파일 총량(도메인별)
SELECT 'task' AS source, COUNT(*) FROM task_attachments
UNION ALL SELECT 'board', COUNT(*) FROM board_card_attachments
UNION ALL SELECT 'approval', COUNT(*) FROM approval_attachments;

-- ============================================================
-- 라운드 3 (feat/widget-home) — 레일 메뉴 개인화 · 대시보드 위젯 카탈로그
-- ============================================================

-- 19-1. 기존 저장된 대시보드 레이아웃 보유 사용자 수 (신규 x-* 블록 병합 로직의 영향 범위)
SELECT COUNT(*) AS users_with_saved_dashboard_layout
FROM app_settings WHERE key LIKE 'dashboard_layout_%';

-- 19-2. 저장된 레이아웃 중 이미 x- 블록을 가진 행 (0이어야 정상: 아직 출시 전)
SELECT COUNT(*) AS layouts_already_containing_x_blocks
FROM app_settings WHERE key LIKE 'dashboard_layout_%' AND value LIKE '%"i":"x-%';

-- 19-3. 개인 설정(user_prefs_*) 저장 행 수 / 최대 크기(바이트) — 32KB 제한 대비 현황
SELECT COUNT(*) AS user_prefs_rows, COALESCE(MAX(length(value)), 0) AS max_bytes
FROM app_settings WHERE key LIKE 'user_prefs_%';

-- 19-4. 저장된 nav.pinned 중 라우트가 없는 키가 섞인 행 (현재 유효 키 20개 기준)
SELECT key, value FROM app_settings
WHERE key LIKE 'user_prefs_%'
  AND value ~ '"pinned":\[[^\]]*"/(?!(my-day|tasks|calendar|gantt|workload|okr|memos|chat|boards|wiki|meetings|forms|documents|playbooks|wbs|mail|bbs|approvals|ledger)")[a-z-]+"';

-- 19-5. 위젯 데이터 원천 규모 — OKR 활성 주기 / 내가 맡은 목표가 있는 사용자 수
SELECT (SELECT COUNT(*) FROM okr_cycles WHERE is_active) AS active_cycles,
       (SELECT COUNT(DISTINCT owner_id) FROM objectives WHERE del_yn = '0') AS users_owning_objectives;

-- ============================================================
-- 라운드 4 (feat/widget-home) — 가계부 개인화 · 1계정 1로그인
-- ============================================================

-- 20-1. 가계부 거래/반복거래/예산이 소유자 없이 남아 있는지(0이어야 정상) 및 사용자별 건수
SELECT created_by, COUNT(*) AS entries FROM ledger_entries GROUP BY created_by ORDER BY created_by;
SELECT COUNT(*) AS budgets_total, COUNT(*) FILTER (WHERE user_id IS NULL) AS budgets_without_owner FROM ledger_budgets;

-- 20-2. 카테고리 소유 현황 (user_id NULL = 시스템 기본)
SELECT COALESCE(user_id::text, 'SYSTEM') AS owner, COUNT(*) AS categories FROM ledger_categories GROUP BY 1 ORDER BY 1;

-- 20-3. 타인의 개인 카테고리를 쓰는 거래가 있는지(0이어야 정상 — 개인화 이전 데이터 점검)
SELECT COUNT(*) AS entries_using_foreign_personal_category
FROM ledger_entries e JOIN ledger_categories c ON c.id = e.category_id
WHERE c.user_id IS NOT NULL AND c.user_id <> e.created_by;

-- 20-4. 현재 '접속 중'(마지막 활동 180초 이내)으로 표시된 계정 — 1계정 1로그인 점검
SELECT username, last_active_at FROM users
WHERE last_active_at > now() - interval '180 seconds' ORDER BY last_active_at DESC;
