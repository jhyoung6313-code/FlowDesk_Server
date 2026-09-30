# 코드리뷰 결과 — feat/m365-gap-features (main 대비)

- **리뷰 회차**: 2회차 (2026-09-28) — 1회차 대비 심화(로컬 max, 10개 관점 병렬 에이전트 + 직접 코드/스키마 교차검증)
- 리뷰 범위: `main...feat/m365-gap-features`
- 리뷰 방식: 로컬 다각도 리뷰. 10개 관점(A~J: 라인별 스캔/회귀 감사/크로스파일 추적/언어 함정/래퍼-게이트 우회/reuse/simplification/efficiency/altitude/CLAUDE.md 컨벤션)을 서브에이전트로 병렬 수행 → 교차 중복 확인된 항목 우선순위 상향 → 핵심 Critical/High 항목은 이 세션에서 파일·스키마를 직접 Read/Grep으로 재검증. **클라우드 과금 없는 로컬 리뷰(ultra 아님, 서브에이전트도 동일 세션 내 로컬 실행).**
- 검증 SQL: `CODE_REVIEW_VERIFY.sql` (같은 리포지토리 루트) — 아래 각 항목에서 관련 쿼리 번호를 표기. 매 리뷰 라운드마다 이 SQL을 실제 DB(`flowdesk_server`)에 실행해 영향 범위(건수)를 확인한다.
- **수정 진행 상황 (2026-09-29, 전 항목 완료)**: 1단계(즉시수정)~3단계(백업/복원)를 거쳐 High 5건, Medium 14건, Low 5건까지 **보고서상 모든 발견 사항을 조치 완료**. 처음엔 ApprovalAdmin 결재선 에디터 통합·시간겹침 통합·sentinel 재설계·AutomationRule 소프트삭제 4건을 회귀 위험 대비 보류했으나, 사용자 요청으로 이어서 진행 — sentinel은 `null` 마커로, AutomationRule은 스키마 마이그레이션(`delYn` 추가, `prisma migrate dev` 적용)으로, 결재선 에디터는 공유 컴포넌트 추출로, 시간겹침은 표현 통일로 각각 마무리(단, 성격이 근본적으로 다른 부분은 "의도적 비통합"으로 명시 — 아래 참조). 수정 후 백엔드 전체 테스트(31 스위트/315건) 통과, 프론트 프로덕션 빌드 성공, 실제 DB 백업→복원 라운드트립 검증, `CODE_REVIEW_VERIFY.sql` 재실행. 적용 중 Dashboard의 useMemo 위치가 조건부 반환보다 뒤에 있어 Hooks 규칙을 위반할 뻔한 것을 직접 발견해 함께 수정함(§8).

## 요약 (우선순위)

| 우선순위 | 건수 | 조치 시급도 |
|---|---|---|
| 🔴 Critical (보안/데이터유실/크래시/핵심기능 불능) | 8 (✅완료 8) | 배포 전 필수 수정 |
| 🟠 High (관리자 신뢰 훼손/정보노출/무결성) | 5 (✅완료 5) | 이번 스프린트 내 |
| 🟡 Medium (품질/일관성/성능) | 14 (✅완료 14) | 다음 스프린트 내 정리 권장 |
| 🟢 Low (설계 취약점/사소) | 5 (✅완료 5) | 여유 있을 때 |

---

## 1. 실시간 공동편집 (Collab, F-69) — 신규 도메인, 최고 위험도

### ✅ 수정완료 — 🔴 Critical — `/collab` 웹소켓이 위키 접근제어(비공개 스페이스·F-67 기밀)를 완전히 우회 (4개 독립 관점 확인 + 직접 코드 검증)
> **조치 내역**: `collabServer.js`의 upgrade 핸들러에 `canJoinRoom(docName, user)` 검증 추가 — wiki-doc-*는 `canAccessSpace`/`canSeeSensitive`와 동일 규칙, meeting-*는 organizer/attendee/admin 여부를 DB 조회로 확인 후 거부 시 403.
- **파일**: `backend/src/collabServer.js:21-47`
- **직접 검증 완료**: `server.on('upgrade', ...)` 핸들러는 ① JWT가 *유효한 서명*인지(`jwt.verify`, 31행), ② room 이름이 `wiki-doc-`/`meeting-` 접두사로 시작하는지(40행)만 확인한다. 문서 단위 권한(비공개 스페이스, `sensitivity==='confidential'`)은 전혀 조회하지 않는다.
- **비교**: 같은 브랜치에서 `wikiController.js`가 REST 계층에 추가한 `canAccessSpace()`(비공개 스페이스 게이트)·`canSeeSensitive()`(F-67 기밀 게이트)는 `/collab` 경로에 전혀 적용되지 않음.
- **재현**: room 이름은 `frontend/src/pages/Wiki/index.jsx:279`에서 `wiki-doc-${doc.id}` (순차 정수 ID, 추측 가능). `GET /api/wiki/docs/<id>`가 403을 반환하는 문서라도, 동일 사용자가 자신의 유효한 JWT로 `wss://host/collab/wiki-doc-<id>?token=...`에 직접 접속하면 y-websocket sync가 즉시 전체 문서 내용을 스트리밍하고, 양방향 CRDT 특성상 편집(쓰기)도 그대로 반영됨 — 읽기+쓰기 완전 우회.
- **조치**: upgrade 핸들러에서 `docName`으로 실제 wikiDoc/meeting을 조회해 `canAccessSpace`/`canSeeSensitive`/회의 참석자 여부를 검증한 뒤에만 upgrade 허용.

### ✅ 수정완료 — 🟡 Medium — Yjs 문서가 프로세스 메모리에서 영구 누적(퇴출 없음)
> **조치 내역**: `collabServer.js`에 no-op `setPersistence({ bindState, writeState })` 등록 — y-websocket의 기존 퇴출 분기(`closeConn()`의 `persistence !== null` 체크)가 정상 동작해 마지막 연결이 끊긴 문서가 메모리에서 제거되도록 함.
- **파일**: `backend/src/collabServer.js:18` (`setupWSConnection(..., { gc: true })`, persistence 미설정)
- **내용**: `y-websocket/bin/utils.js`의 `getYDoc()`은 문서별로 전역 `Map`에 `WSSharedDoc`을 담아두고, `closeConn()`의 퇴출 로직은 `persistence !== null`일 때만 실행됨. `setPersistence()`를 호출하지 않아 `persistence`가 항상 `null` → 퇴출 분기가 절대 실행되지 않음. 동시 편집자 수가 아니라 **누적 문서 종류 수**만큼 메모리가 영구 증가(재시작 전까지 해제 안 됨).

### ✅ 수정완료 — 🟡 Medium — `CollaborativeEditor.jsx`의 `useMemo`가 부수효과(WebSocket 연결)를 생성 — StrictMode에서 소켓 누수
> **조치 내역**: `useMemo` 대신 `clientRef`(useRef) 가드로 전환 — 같은 커밋 내 StrictMode 이중 렌더에서는 재생성하지 않고, room이 실제로 바뀔 때만 새 `Y.Doc`/`WebsocketProvider`를 생성. 정리(destroy)는 기존 `useEffect`의 cleanup이 그대로 전담(이중 destroy 방지를 위해 render 바디에서는 destroy하지 않음).
- **파일**: `frontend/src/components/CollaborativeEditor.jsx:37`
- **내용**: `useMemo(() => { new Y.Doc(); new WebsocketProvider(...) }, [room])` — `WebsocketProvider` 생성자가 즉시 `connect()`를 호출함. React `StrictMode`(개발 모드, `main.jsx`에서 적용)는 memo 팩토리를 2회 실행하므로 소켓 2개가 열리고, 첫 번째는 참조를 잃어 정리되지 않음(누수).

---

## 2. AI 질의응답 / RAG (F-63)

### ✅ 수정완료 — 🔴 Critical — RAG 컨텍스트 수집이 F-67 기밀 게이트를 완전히 우회 (5개 독립 관점 확인 + 직접 코드 검증)
> **조치 내역**: `ragService.gatherContexts`에 `isAdmin` 파라미터 추가, bbsPost에 sensitivity 게이트, wikiDoc에 sensitivity 게이트(스페이스 공개여부와 별도), boardCard에 보드 멤버십(`board.members.some`) 필터 추가. `aiController.js`가 `req.user.role==='admin'`을 전달하도록 연결.
- **파일**: `backend/src/services/ragService.js:55-59`(boardCard), `:60-67`(wikiDoc), `:79-83`(bbsPost)
- **직접 검증 완료**:
  - `bbsPost` 쿼리(80행): `{ delYn: '0', ...orText([...]) }` — sensitivity 필터 **전혀 없음**.
  - `wikiDoc` 쿼리(63행): 스페이스 공개 여부만 체크, `sensitivity: 'confidential'` 체크 없음.
  - `boardCard` 쿼리(56행): `orText(...)`만 — 보드 멤버십 체크 자체가 없음.
- **비교**: 동일 PR에서 `searchController.js`/`bbsPostController.js`/`wikiController.js`/`documentController.js`는 모두 sensitivity 게이트를 올바르게 적용함(직접 확인). `ragService.js` 파일 헤더 주석은 "searchController의 신뢰모델을 따른다"고 명시하지만 실제로는 안 따름.
- **재현**: `POST /api/ai/ask`(인증만 필요, 관리자 제한 없음 — `routes/ai.js` 확인)로 기밀 게시글/위키문서/비공개 보드카드 키워드를 질문하면, AI 답변이 원문 내용 요약+출처링크와 함께 그대로 노출. 다른 모든 화면에서 막힌 접근을 AI 경로 하나가 완전히 우회.
- **조치**: `gatherContexts`의 3개 쿼리에 각각 sensitivity/멤버십 필터 추가. 5곳(bbs×3+search+rag) + wiki + board에 중복된 게이트 로직을 공유 헬퍼(`sensitivityGate.js`)로 통합 권장(§9 참조).
- **검증 쿼리**: `CODE_REVIEW_VERIFY.sql` §2 — 기밀 라벨 게시글/문서 건수로 노출 범위 파악.

---

## 3. 자동화 규칙 엔진 (Automation, F-62)

### ✅ 수정완료 — 🔴 Critical — 이메일 액션 100% 무동작 (`sendGenericEmail` 미export) — 직접 검증 완료
> **조치 내역**: `emailService.js`의 `module.exports`에 `sendGenericEmail` 추가.
- **파일**: `backend/src/services/emailService.js:88-105`(정의) vs `120`(export)
- **직접 검증**: `module.exports = { sendDeadlineEmail, testSmtpConnection };` — `sendGenericEmail`이 빠져 있음. `automationService.js:122`가 `emailService.sendGenericEmail(...)`을 호출하면 `TypeError`. `runAction`의 try/catch가 조용히 삼켜 `AutomationLog`에 실패만 기록, 이메일은 영구 미발송.
- **주의**: 유일한 테스트(`backend/__tests__/automationEngine.test.js`)가 `jest.mock`으로 이 함수를 통째로 모킹해서 테스트가 통과하고 있음 — 버그가 테스트로도 안 걸러짐.
- **조치**: `module.exports`에 `sendGenericEmail` 추가.

### ✅ 수정완료 — 🔴 Critical — 자동화 이벤트 카탈로그 7개 중 5개가 실제로 배선되지 않음 (4개 독립 관점 확인 + 직접 검증)
> **조치 내역**: 5개 컨트롤러에 `automation.fire(...)` 호출 추가 — `approvalController.approve/reject`(`approval.approved`/`approval.rejected`, 최종승인/반려 시점), `bbsPostController.create`(`bbs.post_created`), `okrController.updateObjective`(`okr.at_risk`, 상태가 새로 `at_risk`로 바뀔 때만), `meetingController.update`(`meeting.finished`, 상태가 새로 `done`으로 바뀔 때만). 각 이벤트 컨텍스트는 `EVENT_CATALOG`가 선언한 `fields`에 맞춤.
- **파일**: `backend/src/services/automationService.js`(`EVENT_CATALOG`, 14-21행) vs 전체 컨트롤러
- **직접 검증**: `automation.fire(`를 호출하는 곳은 `taskController.js` 136행(`task.created`)·301행(`task.status_changed`) **뿐**. `approvalController.js`/`bbsPostController.js`/`okrController.js`/`meetingController.js`에는 `automation`/`fire(` 참조가 전혀 없음(grep 확인).
- **재현**: 관리자가 "결재 반려 시 이메일" 같은 규칙을 만들면 저장은 성공하지만 실제 반려 시 아무 일도 일어나지 않음. `runCount`/`lastRunAt`이 영구히 null이라 "아직 안 일어남"과 "절대 못 일어남"을 구분할 방법이 없어 신뢰 훼손이 큼.
- **검증 쿼리**: `CODE_REVIEW_VERIFY.sql` §3, §H1 — 수정 직후 재실행 결과 0건(아직 아무도 해당 이벤트로 규칙을 만들지 않음, 정상). 다음 라운드부터 `run_count`가 0으로 오래 머무는 규칙이 있는지 추적.

### ✅ 수정완료 — 🟠 High — "테스트 실행" 버튼이 같은 이벤트의 다른 활성 규칙까지 실제로 실행(부수효과 포함)
> **조치 내역**: `emit(event, context, { onlyRuleId })` 옵션 추가 — 지정 시 `where`에 `id: onlyRuleId`를 더해 해당 규칙만 조회/실행. `automationController.testRun`이 `{ onlyRuleId: rule.id }`를 전달하도록 수정해 같은 이벤트의 다른 활성 규칙은 절대 건드리지 않음.
- **파일**: `backend/src/controllers/automationController.js:82-90`(`testRun`) → `automationService.js:176-181`(`emit`)
- **내용**: `testRun`은 `automation.emit(rule.event, {...ctx, __test:true})`를 호출하지만 `emit()`은 `event`가 같은 **모든** `isActive` 규칙을 조회해 실행함(대상 규칙만 실행하는 게 아님). `__test` 플래그는 어디서도 읽지 않아 dry-run이 아님.
- **재현**: 관리자가 규칙 A를 "테스트 실행"했을 때 같은 이벤트를 쓰는 규칙 B·C도 함께 전부 실행 — 실제 이메일 발송, 실제 웹훅 호출, 실제 업무 생성이 관리자 의도와 무관하게 발생.

### ✅ 수정완료 — 🟡 Medium — `evalCondition`의 `case 'changed_to':` 도달 불가 (dead code)
> **조치 내역**: 도달 불가 case를 삭제하고 조기 return이 유일한 처리 지점임을 명시하는 주석으로 대체.
- **파일**: `automationService.js:44-46`(조기 return) vs `60`(switch case) — 3개 독립 관점 확인.

### ✅ 수정완료 — 🟡 Medium — 순차 await로 인한 불필요한 지연 (알림/이메일 다건 발송 순차 처리)
> **조치 내역**: `notify` 액션은 대상자별 create+push를 `Promise.all`로 병렬화, `email` 액션도 `Promise.all`로 병렬화. `emit()` 자체도 규칙 목록을 `Promise.all(rules.map(runRule))`로 병렬 실행하도록 분리(`runRule` 헬퍼 신설), `runRule` 내부의 액션들도 `Promise.allSettled`로 병렬 실행 — 한 규칙의 느린 webhook(8초 타임아웃)이 같은 규칙의 다른 액션이나 다른 규칙 전체를 지연시키지 않음.
- **파일**: `automationService.js:108-113`(notify), `:121-124`(email), `:183-211`(`emit()` 자체도 규칙/액션 순차 처리)
- **영향**: webhook 액션은 8초 abort 타임아웃이 있어, 느린/다운된 웹훅 하나가 뒤에 대기 중인 모든 액션/규칙 실행을 최대 8초 이상 지연시킴.

### 🟢 Low — `AutomationRule.delete()` 하드 삭제로 `AutomationLog` 고아 레코드 발생
- **파일**: `automationController.js:63-66`. 다른 신규 도메인(Form 등)은 `delYn` 소프트 삭제를 올바르게 구현한 것과 대비됨. (기존 `BoardAutomation` 패턴과는 일치 — 브랜치 내부 일관성은 있음.)

---

## 4. 전자결재 (Approval, F-52)

### ✅ 수정완료 — 🔴 Critical — 위임 시 `actingType` VarChar(10) 초과로 500 에러 — 직접 검증 완료
> **조치 내역**: `actingType`을 표시이름 삽입 없이 고정 문자열 `'위임'`으로 저장(기존 `'본인'`/`'전결'` 패턴과 동일). 위임자 정보는 기존처럼 알림 메시지에만 포함.
- **파일**: `backend/src/controllers/approvalController.js:590` / 스키마: `backend/prisma/schema.prisma:1591`
- **직접 검증**: `actingType String? @db.VarChar(10)`. 컨트롤러는 `` `위임(${displayName})` ``을 기록 — "위임()" 4자 + displayName. displayName이 7자 이상이면 10자 초과.
- **조치**: 컬럼 확장 또는 `'위임'` 고정 코드로 축약 + 위임자 상세는 별도 필드/로그.

### ✅ 수정완료 — 🔴 Critical (신규 발견) — 위임 코멘트로 `Notification.message` VarChar(500) 초과 시 **무음(silent) 실패**
> **조치 내역**: 프론트 `delegateComment` TextArea에 `maxLength={150}`+`showCount` 추가, 백엔드에서도 조합된 메시지가 500자를 넘으면 `.slice(0,497)+'...'`로 방어.
- **파일**: `approvalController.js:595` 부근(위임 알림 생성), 프론트 `DocumentDetail.jsx`의 `delegateComment` 입력(TextArea, `maxLength` 없음)
- **내용**: `` `${displayName}님이 "${doc.title}" 결재를 위임했습니다. — ${comment}` ``를 그대로 알림 메시지로 저장. displayName(최대100)+title(최대200)+고정텍스트(~20)로 이미 ~320자 소진 → comment가 약 180자만 넘어도 초과. `actingType`과 달리 이 알림 생성은 `sendApprovalNotification` 내부에서 `console.error`만 하는 try/catch로 감싸여 있어 **API 응답은 200 성공, 위임은 실제로 처리되지만 위임받은 사람에게 알림이 영구히 안 감**.
- **조치**: 프론트 `delegateComment`에 `maxLength` 부여 + 백엔드에서 메시지 조합 시 `.slice()`로 방어.
- **검증 쿼리**: `CODE_REVIEW_VERIFY.sql` §4 — 기존 알림 중 450자 이상 근접 사례 확인.

### ✅ 수정완료 — 🔴 Critical — `approvals/tree`와 `list`의 가시성 where절 중복 (다수 관점 독립 확인)
> **조치 내역**: `buildApprovalWhere({ tab, status, q, from, to, userId, role })` 공통 함수로 추출, `list`/`tree` 모두 이 함수를 호출하도록 변경(list는 그 위에 templateId/formTypeId 필터만 추가로 얹음).
- **파일**: `approvalController.js:60-94`(list) vs `134-165`(tree, 신규)
- **내용**: tab(mine/pending/reference/all)·상태·검색어·기간 필터 + 결재 가시성 규칙(보안 관련)을 tree()가 그대로 복붙. 코드 주석(133행)에 "목록과 동일한 가시성/필터 조건"이라고 스스로 명시하면서도 추출하지 않음.

### ✅ 수정완료 — 🟠 High — "내 차례 결재대기" 판단 로직 4중 구현 divergence
> **조치 내역**: `backend/src/services/approvalAccess.js`에 `myPendingStepWhere(userId)`(Prisma where 조각)·`isMyTurnNow(document, steps)`(판정 함수)를 신설해 `approvalController.pendingCount`와 `meController.today`가 공유하도록 수정(meController는 기존에 `type!=='reference'` 필터가 아예 없이 stepOrder=0 불변식에만 의존했던 취약점도 함께 해소). 프론트는 `frontend/src/pages/Approval/index.jsx`의 `pendingCount`·`renderDoc`의 `isMyTurn`을 기존 `isMyPendingTurn(doc)` 호출로 통일(기존 `pendingCount`는 `status==='pending'`·`type!=='reference'` 단계 필터가 빠져있던 별도 버그였는데 이번에 함께 고쳐짐).
- **파일**: `frontend/src/pages/Approval/index.jsx`(`isMyPendingTurn` 63-64행, `pendingCount` 인라인 167행, `renderDoc`의 로컬 `isMyTurn` 200행) + `backend/src/controllers/meController.js:34-58`(MyDay) vs `approvalController.js:859-882`(`pendingCount`)
- **내용**: 프론트 3곳 + 백엔드 2곳, 총 5개소가 "병렬/순차, reference 제외" 규칙을 각자 재구현. meController는 `type` 필터 없이 `stepOrder===currentStep` 부수 효과에 의존 — `normalizeSteps`가 reference를 `stepOrder:0`으로 고정하는 불변식이 깨지면 조용히 어긋남.

### ✅ 수정완료 — 🟠 High — 결재 가시성 predicate 3중 중복 (교차 도메인)
> **조치 내역**: `approvalAccess.js`에 `approvalVisibilityWhere(userId)`(Prisma where 조각)·`canViewApprovalDoc(doc, userId)`(boolean 판정)를 신설. `approvalController.get`/`downloadAttachment`의 post-fetch JS 체크, `documentController.js`의 approval 첨부 필터, `searchController.js`의 전역검색 결재문서 필터 3곳 모두 이 헬퍼를 사용하도록 교체.
- **파일**: `documentController.js:44`, `searchController.js:79`, `approvalController.js:232-236`(canonical)
- **내용**: "누가 이 결재문서를 볼 수 있는가"(작성자/결재자/admin) 규칙이 3곳에 독립 재구현.

### ✅ 수정완료 — 🟡 Medium — 결재선 드래그 재정렬이 병렬결재 그룹을 조용히 파괴
> **조치 내역**: `moveApprover`의 renumber 로직을 "개별 행마다 ++c" 대신 "원래 stepOrder → 새 그룹번호" 매핑(Map)으로 교체 — 같은 stepOrder를 가졌던 행들은 재정렬 후에도(배열상 인접하지 않더라도) 계속 같은 새 번호를 공유해 병렬 그룹이 보존됨.
- **파일**: `frontend/src/pages/Approval/DocumentForm.jsx:199-207`(`moveApprover`)
- **내용**: 재정렬 후 reference가 아닌 모든 스텝을 `++c`로 강제 순차 renumber. `setGroup()`으로 동일 `stepOrder`를 부여해 만든 병렬결재 그룹(같은 차수 = 병렬)이 무관한 행을 드래그하기만 해도 사라짐.
- **재현**: A(1차)·B(2차)·C(2차,병렬)·D(3차) 구성 후 D만 드래그해도 B/C의 병렬 관계가 순차(2,3차)로 바뀜 — 사용자가 각 행의 "차수"를 재확인하지 않으면 의도와 다른 흐름으로 상신됨.

### ✅ 수정완료 — 🟡 Medium — `ApprovalAdmin.jsx` FormTypeTab ↔ TemplateTab ↔ `DocumentForm.jsx` 결재선 에디터 3중 복제
> **조치 내역**: `frontend/src/pages/Admin/ApprovalLineEditor.jsx` 신설 — `useApprovalLine()` 훅(add/remove/setRole/setGroup/toggleCondition/setCondition 상태 로직)과 `parseApprovalLine`/`serializeApprovalLine`(JSON 직렬화), `<ApprovalLineEditor>` 렌더 컴포넌트(`withCondition` prop으로 FormTypeTab은 조건 UI 숨김, TemplateTab은 노출)로 분리. `ApprovalAdmin.jsx`는 이 모듈을 import해서 쓰도록 교체(221줄 삭제/27줄 추가). **`DocumentForm.jsx`는 의도적으로 통합 대상에서 제외**했다 — 그쪽은 이미 확정된 실제 사용자만 다루는 별개의(더 단순한) 데이터 모양이라 억지로 합치면 옵셔널 분기만 늘어난다(조치 우선순위 제안 하단 "의도적 비통합" 참조).
- **파일**: `ApprovalAdmin.jsx:119-159,269-301`(FormTypeTab) vs `455-489,639-677`(TemplateTab) vs `DocumentForm.jsx:310-341`
- **내용**: JSON 파싱→배열 상태→그룹번호 계산→직렬화까지 동일 로직 3벌. FormTypeTab에는 TemplateTab의 조건부 미리보기(evalCondition)가 없어 이미 기능 격차 발생.

### ✅ 수정완료 — 🟢 Low — `automationController.js` 하드 삭제 관행 불일치 (§3 참조)
> **조치 내역**: `AutomationRule`에 `delYn` 컬럼 추가(`prisma migrate dev`로 마이그레이션 생성·적용), `remove()`를 `delYn:'1', isActive:false` 업데이트로 전환. `list`/`detail`/`update`/`testRun`/`automationService.emit()` 전부 `delYn:'0'` 필터 추가(또는 `findFirst`로 존재+비삭제 확인 후 진행). `AutomationLog`는 이제 고아가 되지 않음.

### ✅ 수정완료 — 🟢 Low — 비밀번호 재설정 sentinel(`userId: 0`) 설계 취약성
> **조치 내역**: 무효 계정 마커를 `0`(실제 id와 이론상 충돌 가능한 값) 대신 `null`(실제 id와 절대 충돌 불가능한 전용 마커)로 변경. `verifyResetOtp`도 `!payload.userId`면 DB 조회 없이 즉시 401을 반환하도록 방어를 한 겹 더함. 관련 테스트(`authFlow.test.js`) 갱신.
- **파일**: `authController.js:533` — 계정 열거 방지용 sentinel이 전용 마커가 아니라 실제 ID와 충돌 가능한 값에 의존.

---

## 5. 사내 메일 (Mail, F-54)

### ✅ 수정완료 — 🔴 Critical (신규 발견) — 보낸편지함 메일 삭제가 실제로는 여전히 동작하지 않음 (`deleteSent`가 라우트에 연결 안 됨) — 직접 검증 완료
> **조치 내역**: `trash()`가 recipient row를 못 찾으면(=본인이 CC 안 한 발신 메일) `deleteSent()`로 위임하도록 수정. `bulkAction`의 `'trash'` 케이스도 수신자 레코드가 없는 mailId는 발신자 기준 `senderDeleted:true` 처리로 분기 추가. SQL 검증(§5)으로 확인된 실 데이터 1건(id=2) 재확인 완료.
- **파일**: `backend/src/controllers/mailController.js:424-439`(`deleteSent`, 미사용) vs `backend/src/routes/mail.js:64`(`router.delete('/:id', mailCtrl.trash)`) vs `:406-438`(`trash`)
- **직접 검증**:
  1. `deleteSent`는 이번 브랜치에서 새로 추가된 것으로 보이지만, `routes/mail.js`에 어떤 라우트도 이 함수를 참조하지 않음(`__tests__/mail.test.js`의 자체 테스트 전용 라우터에서만 참조됨 — 실제 앱 라우팅 아님).
  2. 실제로 삭제 버튼이 호출하는 `DELETE /mail/:id`는 `trash()`가 처리하며, `trash()`는 `prisma.internalMailRecipient.findFirst({ mailId, userId: me })`가 없으면 404(`'수신 메일이 아닙니다.'`)를 반환.
  3. `compose()`(227-292행)는 발신자를 자기 메일의 recipient로 추가하지 않음(확인 완료) — 즉 자신에게 CC하지 않은 일반 발신 메일은 recipient row가 없음.
- **재현**: 사용자가 (자신에게 CC 안 하고) 메일을 보낸 뒤 "보낸편지함"에서 휴지통 아이콘 클릭 → `trash()` 404 → 프론트(`Mail/index.jsx`의 `handleTrash`)가 `.catch(()=>{})`로 에러를 삼키고 무조건 "휴지통으로 이동했습니다" 성공 메시지 표시 → 메일은 그대로 남음, 영구 미삭제. 다건선택(`POST /mail/bulk`, `case 'trash'`)도 동일하게 0건 매칭되면서 `{ ok:true, count: mailIds.length }`로 허위 성공 반환.
- **참고**: 이 브랜치가 `senderDeleted` 필드와 `deleteSent()` 로직을 추가해 "발신 메일 삭제 버그를 고친 것"처럼 보이지만, 실제로는 **연결되지 않은 죽은 코드**라 기존 버그가 그대로 남아있음 — 코드 리뷰상 "고친 것처럼 보이는 미해결 버그"로 특히 주의 필요.
- **조치**: `routes/mail.js`의 `DELETE /:id`를 발신 폴더 여부에 따라 `trash`/`deleteSent`로 분기하거나, `trash()` 자체에 "recipient row 없고 본인이 발신자인 경우 `senderDeleted:true` 처리" 분기를 추가.
- **검증 쿼리**: `CODE_REVIEW_VERIFY.sql` §5 — recipient row 없는 발신 메일 건수(=현재 삭제 불가능한 메일 수) 산출.

---

## 6. 통합 문서함 (Documents, F-68)

### ✅ 수정완료 — 🟠 High — 보드 카드 첨부파일이 보드 멤버십 체크 없이 노출
> **조치 내역**: `documentController.js`의 `want('board')` 분기에 `card.board.members.some({userId})` 필터 추가(관리자는 예외).
- **파일**: `backend/src/controllers/documentController.js:31-35`(`want('board')` 분기)
- **내용**: `bbs`(sensitivity 게이트)·`approval`(작성자/결재자 체크)·`mail`(발신/수신자 체크)은 모두 올바르게 필터링하지만 `board` 분기만 `boardCardAttachment.findMany({ where: { ...nameFilter } })` — 아무 권한 필터도 없음. 파일 헤더 주석이 "도메인별 접근제어를 존중"한다고 명시하면서 board만 누락.
- **재현**: `GET /api/documents?source=board` 호출 시 비멤버인 보드의 카드 첨부파일명·업로더·카드 제목·딥링크(`/boards/{id}?cardId=...`)가 그대로 노출.
- **조치**: `boardMember` 조인/`hasMinRole` 체크 추가.

---

## 7. 백업/복원 (Backup, F-44)

### ✅ 수정완료(핵심 도메인 전체) — 🔴 Critical (신규 발견) — 백업/복원이 이 브랜치에서 추가된 10개 이상 신규 도메인을 전혀 커버하지 않음
> **조치 내역 (2단계 진행)**:
> 1차: 우선순위 1군(전자결재·게시판·사내메일·채팅) 4개 도메인을 `backup()`/`restore()`에 명시적 블록으로 추가(v1.8→1.9). 자기참조 트리(결재종류/게시판카테고리/게시판댓글/채팅메시지 스레드)는 부모가 먼저 생성되지 않아도 안전하도록 재시도(`upsertTree`, 최대 5패스) 방식.
> 2차: 나머지 9개 도메인(보드 14모델·위키 4·회의 5·OKR 5·자동화 2·폼 4·가계부 4·일정/자원 6·플레이북 핵심 6 = 총 50모델)을 `EXTRA_TABLES` 선언적 목록 + 범용 upsert 헬퍼로 일괄 추가(v1.9→1.10). 48개 모델을 손으로 반복 작성하는 대신 `{key, model, pk, dates, self}` 스펙 배열 하나로 처리 — 코드량·오타 위험을 줄이면서 동시에 `backupController.js` 자체의 "반복 패턴" Medium 지적(부록 A)도 함께 해소.
> **의도적으로 제외한 범위**: 플레이북의 `PlaybookVersion`/`PlaybookWebhook`/`PlaybookSchedule`/`RunUpdate`/`RunTimeline`/`RunStepChecklist` — 버전이력·웹훅설정·활동로그 성격(기존 `AutomationLog`와 같은 급)이라 이번 라운드에서는 후순위로 미룸. 필요 시 `EXTRA_TABLES`에 동일 패턴으로 추가하면 됨.
> **검증**: 백업→복원 라운드트립을 실제 로컬 DB(시드+실사용 데이터, 전 도메인 합계 40여 건)에 대해 스크립트로 직접 실행 — 에러 없이 완료, 복원 전후 테이블별 행 수 동일(중복/손상 없음, additive upsert 정상 동작) 확인.
- **파일**: `backend/src/controllers/backupController.js` — `backup()`(export 대상)과 `restore()`(이번 브랜치에서 대폭 확장) 둘 다 확인.
- **내용**: `restore()`는 이번 PR에서 `recurringTasks`/`taskTemplates`/`taskExtraAssignees`/`taskTags`/`taskComments`/`taskAttachments`/`taskHistories`/`timeEntries`/`wbsProjectMembers`/`wbsTasks`/`wbsIssues` 처리를 크게 확장했지만, 이들은 모두 **기존에 `backup()`이 이미 export하던 테이블**임. 반면 이 브랜치 전체가 추가한 신규 도메인 — 전자결재(`ApprovalDocument`/`ApprovalStep`), 게시판(`BbsPost`), 사내메일(`InternalMail`), 채팅(`ChatRoom`/`ChatMessage`), 보드(`Board`/`BoardCard`), 위키(`WikiDoc`), 회의(`Meeting`), OKR(`Objective`/`KeyResult`), 자동화(`AutomationRule`), Forms(`Form`), 플레이북(`Playbook*`), 가계부(`LedgerEntry`), 일정/자원(`ScheduleEvent`/`ScheduleResource`) — **어느 것도 `backup()`/`restore()`에 포함되지 않음** (grep으로 `data\.[a-zA-Z]+` 패턴 확인 시 0건).
- **재현**: `CLAUDE.md`의 "새 PC에서 이어서 작업" 가이드가 안내하는 백업→복원 절차(또는 재해복구)를 그대로 따르면, 모든 전자결재 문서·게시글·사내메일·채팅·보드/카드·위키·회의록·OKR·자동화규칙·설문·플레이북·가계부·예약이 백업 파일에서 조용히 누락되고 복원 시 영구 소실됨 — 아무 경고도 없음.
- **조치**: `backup()`/`restore()`에 신규 도메인 테이블 export/import 추가. 우선순위: 결재/게시판/메일/채팅처럼 업무 데이터 성격이 강한 것부터.
- **검증 쿼리**: `CODE_REVIEW_VERIFY.sql` §7 — 백업 미커버 테이블별 현재 행 수(=현재 시점 잠재적 유실 데이터 규모).

---

## 8. 대시보드 (Dashboard)

### ✅ 수정완료 — 🟡 Medium — 파생 상태 `useMemo` 누락 + 드래그 중 매프레임 재계산
> **조치 내역**: `todayPriorities`/`dueTodayCount`/`atRisk`를 `useMemo(..., [active])`로 감쌈. **Hooks 규칙상 이 useMemo는 반드시 `if (loading) return` 조건부 반환보다 앞에 있어야 해서** `cols` useMemo 바로 다음으로 위치를 옮김(원래 위치에 그대로 useMemo만 씌우면 조건부 hook 호출이 되어 "Rendered fewer hooks than expected" 런타임 에러가 났을 것 — 적용 중 직접 발견해 함께 수정).
- **파일**: `frontend/src/pages/Dashboard/index.jsx:401-411`. `react-grid-layout`의 `onLayoutChange`가 드래그/리사이즈 프레임마다 `setDashLayout` 호출 → 매 프레임 리렌더+재필터링.

### ✅ 수정완료 — 🟡 Medium — 중첩 setState로 최신 상태 읽기 (ref 사용 권장)
> **조치 내역**: `dashLayoutRef`/`dashEnabledRef`(useRef)로 최신 상태를 항상 미러링하도록 하고, `toggleDashBlock`/`finishDashEdit`은 이 ref를 직접 읽어 `persistDash`를 호출하도록 변경 — setState updater 중첩 제거.
- **파일**: `Dashboard/index.jsx:175-192`(`toggleDashBlock`, `finishDashEdit`) — 2단 depth setState updater 중첩.

### ✅ 수정완료 — 🟡 Medium — KPI_MODE 분기 5중 중복 + skins.js와 값 drift
> **조치 내역**: `KPI_MODE`를 하드코딩 테이블 대신 `SKINS[skin][isDark?'dark':'light']['kpi-mode']`에서 직접 파생하도록 변경(skins.js를 유일한 소스로 통일).
- **파일**: `Dashboard/index.jsx:420`(`KPI_MODE`)가 `skins.js`가 이미 CSS변수(`--fd-sk-kpi-mode`, "대시보드가 분기"라는 주석까지 있음)로 노출한 값을 손으로 재복사. 신규 스킨 추가 시 이 파일만 누락되면 `|| 'tint'` 폴백으로 조용히 어긋남.

---

## 9. 디자인 스킨 시스템 (F-20)

### ✅ 수정완료 — 🟡 Medium — App.jsx 반경/선굵기 값이 skins.js 원본과 이미 drift
> **조치 내역**: 하드코딩 테이블(`SKIN_RADII`/`SKIN_LINEW`) 삭제, `skinSet['radius'/'radius-lg'/'radius-sm'/'border-w']`에서 `parseInt()`로 직접 파생하도록 변경. 이 변경이 §10의 "매 렌더 재생성"(Low) 항목도 함께 해소함 — 애초에 별도 테이블 자체가 없어짐.
- **파일**: `frontend/src/App.jsx:96-106`(`SKIN_RADII`/`SKIN_LINEW`) — `skins.js`가 이미 갖고 있는 스킨별 radius 값을 손으로 재입력. **이미 값이 어긋나 있었음**(clay `radius-lg`=26px인데 App.jsx=24; default `radius`=9px인데 App.jsx=10).

### ✅ 수정완료 — 🟡 Medium — 다크모드에서 Modal/Dropdown/Select/DatePicker가 스킨을 따르지 않음
> **조치 내역**: `colorBgElevated`를 하드코딩 값 대신 `skinSet['card-bg']`로 연결.
- **파일**: `App.jsx:182-186` — `colorBgElevated`가 `skinSet['card-bg']`가 아니라 옛 기본 스킨의 다크값(`#2f3543`)으로 하드코딩. "슬릭다크" 등 다크 강제 스킨에서 Card는 스킨색인데 Modal/Dropdown만 어긋난 회청색으로 렌더.

### ✅ 수정완료(위 항목과 동시 해결) — 🟢 Low — `App.jsx`의 `SKIN_RADII`/`SKIN_LINEW`가 매 렌더 재생성
- **파일**: `App.jsx:94-110` — 하드코딩 테이블 자체를 제거했으므로 재생성 문제도 함께 사라짐.

---

## 10. 공통 컴포넌트 / UI

### ✅ 수정완료 — 🔴 Critical — `DocumentDetail.jsx` 렌더링 크래시 (`Tooltip` import 누락) — 직접 검증 완료
> **조치 내역**: antd import 목록에 `Tooltip` 추가.
- **파일**: `frontend/src/pages/Approval/DocumentDetail.jsx:441,443`
- **직접 검증**: antd import 목록(3-7행: `Breadcrumb, Button, Space, Typography, Tag, Divider, Avatar, Modal, Input, message, Spin, Popconfirm, Card, Descriptions, Select, theme`)에 `Tooltip`이 없음. 441행에서 `<Tooltip title="이 문서를 건너뛰고 다음 대기 문서로">` 사용 중.
- **재현**: 현재 승인자이고(`isCurrentApprover`) 대기 중인 다음 문서가 있을 때(`nextPendingId`) "다음 결재 →" 버튼이 렌더링되며 `ReferenceError: Tooltip is not defined` → 화면 전체 크래시.
- **조치**: `import { ..., Tooltip } from 'antd'` 추가.

### ✅ 수정완료 — 🟠 High — 아바타 색상 헬퍼 3중 중복, 커스텀 아바타 색 설정을 무시
> **조치 내역**: `Documents/index.jsx`·`Approval/index.jsx`·`CollaborativeEditor.jsx`·`Dashboard/index.jsx`(업무 담당자·받은메일 발신자) 전부 `getAvatarColor(id, avatarColor)`로 교체. id가 없는 대상(보드 외부담당자 등 계정이 없는 free-text 이름)만 기존 이름-해시 폴백을 유지(개념적으로 다른 케이스라 통합 대상이 아님). 이를 위해 `documentController.js`의 `uploaderSel`과 `mailController.js`의 `mailInclude.from`에 `avatarColor` select 추가, `CollaborativeEditor` 호출부(`Wiki/index.jsx`)에 `user.id`/`user.avatarColor` 전달 추가.
- **파일**: `CollaborativeEditor.jsx:19-23`(`colorFor`), `utils/listkit.js:8-19`(`avatarColor`), `Dashboard/index.jsx:27`(`nameColor`) — 모두 기존 `utils/colors.js`의 `getAvatarColor(userId, user.avatarColor)`(14개 파일에서 사용 중, 프로필에서 설정한 커스텀 색 반영)를 쓰지 않고 **이름 해시** 기반의 독자 팔레트 재구현.
- **재현**: 프로필에서 아바타 색을 커스텀 지정한 사용자가 업무/댓글/채팅/보드 등에서는 올바른 색으로 보이지만, 신규 Documents/Approval 목록에서는 다른(이름 해시) 색으로 보임 — 눈에 띄는 불일치.

### ✅ 수정완료 — 🟡 Medium — CommandPalette 필터링 시 activeIdx 불일치 + 오해 소지 있는 빈 결과 메시지
> **조치 내역**: `useEffect(() => setActiveIdx(0), [selectedCats, refine])` 추가로 클라이언트 필터링 시에도 하이라이트가 리셋되도록 함. 빈 결과 메시지도 `groups.length > 0`(필터로 전부 숨겨진 경우)와 `groups.length === 0`(진짜 검색 결과 없음)을 구분해 다른 문구 표시.
- **파일**: `CommandPalette.jsx:64-75,149-161`(activeIdx 리셋 누락), `225-226`.

### ✅ 수정완료 — 🟢 Low — StatusBar.jsx 버전 하드코딩 stale
> **조치 내역**: `APP_VERSION`을 `v2.14.1`로 갱신. (근본적으로는 `CLAUDE.md`의 버전 문자열을 빌드 타임에 주입하는 방식이 더 낫지만, 이번 라운드는 최소 수정만 진행 — 다음 릴리즈 때 또 벌어지지 않도록 자동화하는 것은 별도 후속 과제로 남김.)
- **파일**: `Layout/StatusBar.jsx:12` — `APP_VERSION='v2.13.0'`, CLAUDE.md 기준 현재 v2.14.1.

---

## 11. 일정/자원관리 (F-55)

### ✅ 부분 수정완료 — 🟡 Medium — 시간 겹침 판정 로직 3중 이원화(문자열/정수/Date 세 가지 표현)
> **조치 내역**: `findResourceConflict`의 "둘 다 시간 지정" 비교를 문자열 HH:MM 비교 대신 `schedulingService`의 `toMin()`으로 분 단위 정수 변환 후 비교하도록 통일 — 산술 결과는 동일하지만 향후 자정 관련 엣지케이스 수정이 한 곳(schedulingService)에만 반영해도 되도록 표현을 합쳤다. **`listEvents`의 Prisma `lte`/`gte` Date range는 통합 대상에서 제외** — 그건 이미 메모리에 있는 값끼리 비교하는 게 아니라 DB 쿼리 조건을 만드는 것이라 애초에 minute-of-day 정수로 바꿀 수 있는 종류의 코드가 아님(성격이 다름).
- **파일**: `scheduleController.js:86-104`(`findResourceConflict`, "HH:MM" 문자열 비교) vs `schedulingService.js`(분 단위 정수) vs `listEvents`의 Prisma `lte`/`gte` Date range. 3곳이 서로 다른 데이터 형태로 겹침을 계산 — 자정 넘는 이벤트 등 엣지케이스 수정이 한 곳에만 반영될 위험.

### ✅ 수정완료 — 🟢 Low — 빈시간 찾기가 `rsvp: 'declined'` 참석자도 여전히 "바쁨"으로 처리
> **조치 내역**: `scheduleController.freeSlots`가 회의 조회 시 `attendees.rsvp`도 함께 select하고, 조직자이거나 declined가 아닌 참석자가 있을 때만 그 시간대를 "바쁨"으로 집계하도록 필터 추가. `meController.js`의 "오늘 회의" 위젯도 쿼리 자체에 `rsvp: { not: 'declined' }` 조건 추가. `__tests__/scheduling.test.js`에 declined 케이스 검증 테스트 신규 추가(회귀 방지).
- **파일**: `scheduleController.js:449` — `MeetingAttendee.rsvp`를 필터하지 않음. `meController.js`의 "오늘 회의" 위젯도 동일 갭을 물려받음(기존 코드 관행, 이 브랜치가 새로 만든 문제는 아니지만 F-65가 신규 기능이므로 수정 가치 있음).

---

## 12. 문서 동기화 (CLAUDE.md 컨벤션, 규칙 5)

### ✅ 수정완료 — 🟡 Medium — 신규 기능 8종이 `/tm-*` 스킬 표에는 추가됐지만 실제 스킬 파일이 없음 (직접 검증 완료)
> **조치 내역**: `.claude/commands/tm-automation-rules.md`, `tm-ai-search.md`, `tm-myday.md`, `tm-scheduling.md`, `tm-forms.md`, `tm-sensitivity.md`, `tm-documents.md`, `tm-collab-edit.md` 8개 파일을 `FEATURES.md`의 해당 섹션 기반으로 신규 생성. 기존 `tm-okr.md` 형식(관련 파일 표·개념 구조·API·화면·미구현)을 따르되, 이번 리뷰에서 발견된 크로스 도메인 함정(예: sensitivity 게이트를 새 소비처에 추가할 때마다 빠뜨리기 쉬운 지점, automation 이벤트 추가 시 카탈로그만 등록하고 fire() 호출을 빠뜨리는 실수 등)을 "주의사항"으로 각 문서에 명시해 향후 세션이 같은 실수를 반복하지 않도록 함.
- **파일**: `CLAUDE.md` 105-112행에 `/tm-automation-rules`, `/tm-ai-search`, `/tm-myday`, `/tm-scheduling`, `/tm-forms`, `/tm-sensitivity`, `/tm-documents`, `/tm-collab-edit` 8개 행 추가됨(main 대비 신규, `git show main:CLAUDE.md` 대조 확인).
- **영향**: CLAUDE.md 자체의 "점진적 로드" 워크플로(작업 시작 시 CLAUDE.md만 읽고 관련 스킬 호출)를 따르는 모든 향후 세션이 이 8개 기능 중 하나를 다룰 때 죽은 링크를 호출하던 문제 해소.

---

## 13. 회귀 없음 확인 / 수정하지 않아도 되는 항목

전용 관점(Angle B)이 `git diff`의 모든 삭제(`-`) 라인을 추적한 결과, 아래는 **보안이 개선된 지점**으로 확인됨(조치 불필요):
- `chatController.js::searchMessages` — 비멤버가 임의 `roomId`로 메시지를 읽을 수 있던 구멍을 막는 멤버십 체크 **추가**.
- 테마/스킨 시스템 교체(`themeStore.js`) — 기존 사용자용 안전한 fallback(`DEFAULT_SKIN`) 확인, dangling import 없음.
- `RichEditor.jsx`의 신규 공유 `insertLink` — Cancel과 빈 문자열 제출을 구분 못 하던 기존 버그를 부수적으로 수정.

⚠️ **주의(정정)**: 1회차 리뷰에서 "`mailController.js::deleteSent` — 발신 메일 삭제 무동작 버그를 `senderDeleted` 필드로 수정"이라고 기재했던 항목은 **이번 2회차 직접 검증 결과 오판**이었음 — `deleteSent`가 실제로는 어떤 라우트에도 연결되지 않은 죽은 코드라 버그가 여전히 존재함(§5 참조). 향후 리뷰에서도 "새 코드가 추가됐다"와 "그 코드가 실제로 호출된다"를 반드시 분리 검증할 것.

---

## 부록 A. 재사용성/중복(Medium, 상세 근거는 각 도메인 섹션 참조) 총괄

| 영역 | 항목 | 파일 |
|---|---|---|
| 결재 가시성 | 3~5중 중복 | §4 |
| sensitivity 게이트 | bbs×3 + wiki + search + rag + document = 6중 | §2, §4, §6 |
| 아바타 색상 | 3중 (+ getInitial 별도 1개 더) | §10 |
| 결재선 에디터 | 3중 | §4 |
| KPI_MODE / 스킨 radius | skins.js와 별도 하드코딩 테이블 | §8, §9 |
| 자동화 notify/email | notificationService와 패턴 중복 | §3 |
| settingsController 유저별 JSON blob get/set | 4쌍 반복 | (신규 발견, formController 유사 패턴 §6 참조) |
| sensitivity enum 리터럴 | 백엔드 3곳 하드코딩, 공유 상수 없음 | §2, §4 |

## 부록 B. 효율성(Medium, 응답경로 아님 — 우선순위 낮음)

| 항목 | 파일 |
|---|---|
| automationService 순차 await(notify/email/emit 전체) | §3 |
| collabServer Yjs 문서 미퇴출(메모리 누적) | §1 |
| backupController.restore() 11개 신규 per-row 순차 upsert (트랜잭션 장기 점유) | `backupController.js` |
| notificationService.checkApprovalReminders 중첩 루프(일 1회 cron, 낮은 심각도) | `notificationService.js:242-262` |
| Dashboard/App.jsx 정적 객체 매 렌더 재생성 | §8, §9 |

---

## 조치 우선순위 제안 / 진행 현황

1. **즉시 수정 (배포 차단급, 8건)** — ✅ **전건 완료**(2026-09-28~29): collab 웹소켓 접근제어 우회 ✅, RAG 기밀 게이트 우회 ✅, `sendGenericEmail` export 누락 ✅, delegate `actingType` 길이 초과 ✅(+위임코멘트 알림 오버플로 ✅), `DocumentDetail.jsx` Tooltip import ✅, 보낸메일함 삭제 미동작 ✅, documentController board 멤버십 누락 ✅, 백업/복원 신규 도메인 미포함 ✅(4개 도메인 명시적 추가 + 나머지 9개 도메인 `EXTRA_TABLES` 방식으로 추가, 플레이북 일부 로그성 테이블만 의도적 제외).
2. **단기 (High, 5건)** — ✅ **전건 완료**(2026-09-29): 자동화 이벤트 배선 누락(5종) ✅, 자동화 testRun 부수효과 오염 ✅, approvalController tree/list 중복 ✅, "내 차례" 판단 5중 구현 통일 ✅, 결재 가시성 predicate 3중 중복 통일 ✅.
3. **중기 (Medium, 14건)** — ✅ **전건 완료**(2026-09-29): collab Yjs 미퇴출 ✅, CollaborativeEditor useMemo 누수 ✅, automationService 순차 await ✅, 결재선 드래그 병렬그룹 파괴 ✅, Dashboard useMemo 누락 ✅, Dashboard 중첩 setState ✅, Dashboard KPI_MODE drift ✅, App.jsx 스킨 radii drift ✅, 다크모드 Modal 색상 ✅, CommandPalette activeIdx ✅, CLAUDE.md 8개 스킬 문서 생성 ✅, evalCondition dead code ✅, **`ApprovalAdmin.jsx` FormTypeTab/TemplateTab 결재선 에디터 통합 ✅**(신규 `frontend/src/pages/Admin/ApprovalLineEditor.jsx`로 상태훅 `useApprovalLine`+렌더 컴포넌트 `<ApprovalLineEditor>` 추출, `ApprovalAdmin.jsx` 221줄 삭제/27줄 추가로 순감소, `DocumentForm.jsx`는 데이터 모양이 근본적으로 달라 의도적으로 통합 대상에서 제외 — 아래 설명 참조), **일정 시간겹침 판정 통합(부분) ✅**(`scheduleController.findResourceConflict`의 시간대 비교를 `schedulingService.toMin` 기반으로 전환해 시간 표현을 통일; Prisma 날짜범위 필터 부분은 성격이 달라 통합 대상에서 제외).
4. **여유 있을 때 (Low, 5건)** — ✅ **전건 완료**: 스킨 반경 값 소스 일원화 ✅, StatusBar 버전 문자열 갱신 ✅, 빈시간찾기 declined 처리 ✅, **sentinel(`userId: 0`→`null`) 재설계 ✅**(계정 열거 방지 토큰의 무효 마커를 실제 id와 충돌 불가능한 `null`로 변경, `verifyResetOtp`가 DB 조회 없이 즉시 401 처리하도록 방어 강화), **`AutomationRule` 하드삭제 → 소프트삭제 전환 ✅**(`delYn` 컬럼 추가 마이그레이션 적용, CRUD/emit() 전부 `delYn:'0'` 필터로 전환).

### 이번 라운드에서 "통합하지 않기로" 결정한 것 (의도적 비통합, 회귀 위험 대비)
- **`DocumentForm.jsx`의 결재선 에디터**: FormTypeTab/TemplateTab은 "직급/직책 규칙(미확정 kind:'rule')"과 "조건부 결재자"를 다루는 **템플릿 정의** 편집기인 반면, `DocumentForm.jsx`는 이미 확정된 실제 사용자만 다루는 **실제 문서 상신** 편집기라 데이터 모양 자체가 다르다(`kind`/`condition` 개념 없음). 억지로 합치면 옵셔널 분기만 늘어 오히려 더 헷갈릴 것으로 판단해 별개로 유지.
- **`scheduleController.listEvents`의 Prisma 날짜범위 필터**: `findResourceConflict`/`schedulingService`와 달리 이건 "이미 메모리에 올라온 이벤트 목록을 비교"하는 게 아니라 "DB에 어떤 조건으로 물어볼지"를 결정하는 쿼리 빌더라 minute-of-day 정수 표현으로 통합할 대상 자체가 아님(Prisma `lte`/`gte`는 Date 객체가 필요).

### 다음 라운드 제안
- **최우선 후보**: sensitivity 게이트 공유 헬퍼화(bbs×3+wiki+search+rag+document 6중 중복, 부록 A) — 이번에 `approvalAccess.js`(결재)·`ApprovalLineEditor.jsx`(결재선 UI)로 유사 패턴을 통합한 것과 동일한 접근. `tm-sensitivity.md`에도 이 부채를 명시해둠.
- 플레이북 백업 제외 테이블(PlaybookVersion/Webhook/Schedule/RunUpdate/RunTimeline/RunStepChecklist) 커버리지 후속 검토.
- 부록 A/B의 나머지 항목(settingsController 유저별 JSON blob 4쌍 반복, sensitivity enum 리터럴 공유상수화, notificationService.checkApprovalReminders 중첩루프, backupController의 신규 `EXTRA_TABLES` per-row upsert도 여전히 순차 — 데이터량이 커지면 `createMany`/`skipDuplicates` 배치로 전환 검토).
- **다음 리뷰 라운드에서 반드시 확인**: 이번 라운드에 새로 만든 코드 자체(`ApprovalLineEditor.jsx`의 상태 공유 로직, `automationRule.delYn` 마이그레이션이 기존 데이터/다른 조회 경로에 미치는 영향, sentinel `null` 변경이 프론트 어디선가 `userId: 0`을 특별 취급하고 있지 않은지)에 대한 회귀 여부.

---

## 검증 SQL 실행 결과 (2026-09-28, 로컬 개발 DB `flowdesk_server` 기준)

`CODE_REVIEW_VERIFY.sql` 전체를 로컬 DB에 실행한 실제 결과 요약(시드/테스트 데이터 위주라 건수는 적지만, 버그의 실재 여부 자체는 이것으로 확정됨):

| 검증 항목 | 결과 |
|---|---|
| §2-1 기밀 BBS 게시글 | 0건 (현재 시드 데이터에 없음 — 위험은 로직에 있으므로 실 운영 데이터 투입 시 재확인 필요) |
| §2-2 공개 스페이스 내 기밀 위키문서 | 0건 |
| §2-3 RAG에 필터없이 노출되는 board_cards 총량 | **1건** (멤버십 필터가 아예 없다는 것 자체가 문제 — 카드 수가 늘면 그대로 비례) |
| §3-1 죽은 이벤트로 등록된 활성 자동화 규칙 | 0건 (아직 아무도 안 만듦 — 지금 막아야 향후 관리자가 "안 되는 규칙"을 만드는 것을 예방) |
| §4-1 450자 이상 알림 메시지(과거 사례) | 0건 |
| §4-2 `acting_type` 현재 값 | `본인`(4), `전결`(1) — 아직 "위임(...)" 형태로 저장된 적 없음(=버그가 아직 실제로 터진 적은 없다는 뜻, 터지기 전에 선제 수정 필요) |
| §4-3 표시이름 6자 이상(위임 시 초과 유발 가능 사용자) | 0건(현재 시드 계정 기준) — 실사용자 등록 시 재확인 필요 |
| §5-1/5-2 **삭제 불가능한 발신 메일** | **1건 확인됨** (id=2, 관리자 발신, 2026-06-29) — 실제 데이터로 버그 재현 **확정** |
| §7 백업 미커버 도메인별 행 수 | chat_messages 10, approval_steps 9, bbs_posts 7, internal_mails 6, approval_documents 5, schedule_events 3, chat_rooms 3, meetings 3, board_cards 1, boards 1, forms 1, playbooks 1 (ledger_entries/wiki_docs/objectives/automation_rules는 현재 0이지만 **백업 로직 자체가 없다는 사실**이 문제) |
| §12 고아 `automation_logs` | 0건 |

**핵심 시사점**: 로컬 시드 데이터만으로도 §5(보낸메일함 삭제 불가)가 **실제로 재현**되고, §7(백업 미커버)은 이미 41건 이상의 실 데이터가 백업 대상에서 빠져 있음이 확인됨. §2/§3/§4는 아직 "잠재적" 상태이나 로직 결함 자체는 코드 검증으로 확정되어 있으므로, 실사용 데이터가 쌓이기 전(=지금)에 수정하는 것이 비용이 가장 낮음.

---

## 3회차 리뷰 — 2회차 수정 자체에 대한 재검증 (2026-09-30)

2회차(위 전체)에서 Critical~Low 32건을 모두 조치한 뒤, "새로 만든 코드 자체도 다시 리뷰하자"는 요청에 따라 **커밋 전 작업트리 diff**(main 대비가 아니라, 이 세션에서 실제로 변경한 파일들)를 대상으로 로컬 max 리뷰를 재실행했다. 10개 관점 중 8개가 완료됐고(A/D/E/G/H/I/J + reuse 관점) 2개(B: 회귀 감사, C: 크로스파일 추적)는 세션 사용량 한도로 중단됨 — 8/10 커버리지로도 충분한 신호가 모여 아래 항목들을 확정·수정함. 모든 발견은 실제 소스 재확인(diff만이 아니라 현재 파일 상태) 후 채택.

### 발견 및 조치

| # | 발견 (관점) | 심각도 | 조치 |
|---|---|---|---|
| 1 | 새로 배선한 4개 자동화 이벤트(`approval.approved/rejected`, `bbs.post_created`, `okr.at_risk`, `meeting.finished`)에서 `notify` 액션의 `toCreator` 옵션이 `ctx.createdBy`만 읽어 대상자 0명으로 무동작 — 이 이벤트들은 `authorId`/`ownerId`/`organizerId`를 씀 (Angle A) | 🔴 High(신규 배선 기능 자체가 죽어있음) | ✅ `resolveNotifyTargets`가 `createdBy ?? authorId ?? ownerId ?? organizerId` 순으로 폴백하도록 수정 |
| 2 | `collabServer.js` upgrade 핸들러가 async로 바뀌며 실제 대기 구간이 생겼는데 `socket.on('error', ...)` 리스너가 없어, 대기 중 클라이언트가 끊기면 죽은 소켓에 쓰기 시도 → 리스너 없는 'error' 이벤트가 프로세스 전체를 크래시시킬 수 있음 (Angle D) | 🔴 High(프로세스 전체 DoS) | ✅ upgrade 핸들러 최상단에 `socket.on('error', () => {})` 추가 |
| 3 | `collabServer.js`가 REST의 `authenticate` 미들웨어와 달리 JWT의 `pwAt`(비밀번호 변경)·`sn`(세션 nonce, 단일세션 F-57)을 재검증하지 않아, 비밀번호를 바꾸거나 다른 기기 로그인으로 세션이 끊겨도 예전 토큰으로 `/collab`에 계속 접속 가능 (Angle E) | 🟠 보안(REST 대비 방어 누락) | ✅ `passwordChangedAt`/`sessionNonce`를 select해 `authenticate`와 동일한 로직으로 검증, 실패 시 403 |
| 4 | `CollaborativeEditor.jsx`의 `clientRef` 가드가 room 일치 여부만 보고, React 18 **StrictMode의 mount→cleanup→remount** 시뮬레이션(개발모드)에서는 cleanup이 이미 destroy한 provider/ydoc을 remount가 그대로 재사용해 연결이 영구히 끊긴 상태로 남음 (Angle A + D 독립 확인) | 🟠 개발환경 UX(로컬 dev에서 첫 진입마다 재현 가능) | ✅ `destroyed` 플래그 추가 — cleanup에서 자신이 여전히 활성 인스턴스일 때만 표시, 렌더 가드가 `destroyed`도 함께 검사해 재생성 |
| 5 | `mailController.bulkAction`의 `trash` 케이스가 `deleteSent()`와 다른 규칙을 씀 — `isDraft:false`만 처리해 draft를 다른 메일과 함께 다건선택하면 조건에 안 걸려 조용히 무시(성공 응답은 그대로 옴). 프론트 Mail 목록의 휴지통 버튼이 임시보관함 폴더에서도 노출돼 **실제로 재현 가능** (다수 관점 독립 확인: G/I/A) | 🟠 실사용 가능 버그 | ✅ `recipients: { none: { userId: me } }` 관계형 필터로 단순화 + `deleteSent()`와 동일하게 draft는 하드삭제, 발송본은 `senderDeleted`로 분기. 회귀 테스트 추가(`mail.test.js`) |
| 6 | `ragService.gatherContexts`의 wikiDoc 쿼리에서 `isAdmin` 우회가 기밀(confidential) 게이트에만 적용되고 스페이스 비공개 게이트에는 안 걸림 — `wikiController.canAccessSpace`는 관리자에게 모든 비공개 스페이스 접근을 허용하는데 RAG만 예외적으로 막음(과소포함, 보안 사고 아님) (Angle E + A 독립 확인) | 🟡 Medium(일관성) | ✅ 스페이스 비공개 게이트에도 `isAdmin` 우회 추가 |
| 7 | `ApprovalLineEditor.jsx`로 통합하며 "직급/직책 입력 없이 규칙 추가" 시 뜨던 경고 토스트(`message.warning`)가 조용히 사라짐 — 관리자가 빈 값으로 버튼을 눌러도 아무 반응이 없어 보임 (Angle E) | 🟡 Medium(UX 회귀) | ✅ `handleAddRule`에서 실패 시 경고 토스트 복원 |
| 8 | `backupController.restore()`의 `upsertTree`가 5패스 재시도 후에도 실패한 행을 조용히 버림 — 응답은 항상 "복원이 완료되었습니다."만 반환. 또한 `EXTRA_TABLES`/기존 트리 upsert가 전부 트랜잭션 안에서 순차 실행되는데, Prisma 인터랙티브 트랜잭션 기본 타임아웃(5초)을 실사용 데이터 규모에서 초과해 복원 자체가 통째로 실패할 위험(2개 독립 관점 확인: G/H) | 🟠 데이터 유실/복원 실패 위험 | ✅ 실패 행을 `droppedRows`로 수집해 응답에 `warning`/`dropped`로 노출. `$transaction`에 `{ timeout: 120000 }` 지정해 소규모 팀 데이터 규모에서 타임아웃으로 중단되지 않도록 방어(근본 해결인 배치화는 후속 과제로 유지) |
| 9 | `Dashboard/index.jsx`의 `todayPriorities`/`atRisk` useMemo가 `[active]`에만 의존해, 브라우저 탭을 자정 넘게 열어두면 `active`가 그대로인 한 "오늘"이 예전 날짜로 고정됨(이전엔 useMemo 없이 매 렌더 재계산돼 자연히 갱신됐었음 — 이번 성능 개선의 부작용) (Angle D) | 🟡 Medium(장시간 방치 시 판정 오류) | ✅ 5분마다 갱신되는 `dayKey` state 추가, useMemo 의존성에 포함 |
| 10 | `App.jsx`의 `skinLineWidth`가 `parseInt(...) \|\| 1`이라 clay/pop처럼 의도적으로 `border-w: '0px'`인 스킨에서 `0 \|\| 1` falsy 버그로 1이 됨(현재는 해당 스킨들이 `border-color`도 `transparent`라 화면상 안 보여 무해하지만, "skins.js가 유일한 소스"라는 이번 수정의 목표에 어긋남) (Angle D) | 🟢 Low(현재 무해, 잠재적) | ✅ `Number.isNaN` 체크로 교체(파싱 실패시에만 1로 폴백) |
| 11 | `BoardMember`가 복합 PK `(boardId, userId)`만 있고 `userId` 단독 인덱스가 없어, 이번에 추가된 "내가 속한 보드의 카드"류 역방향 조회(`documentController.js`/`ragService.js`의 `board.members.some({ userId })`)가 인덱스 seek 없이 전체 스캔됨(현재 규모에서는 무해, 데이터가 늘면 조용히 느려짐) (Angle H) | 🟢 Low(성능, 예방적) | ✅ `@@index([userId])` 추가, 마이그레이션 적용 |

### 검토했지만 이번에 조치하지 않은 것 (후속 과제로 유지)
- `backupController.js`의 21개 BBS/Approval/Mail/Chat 테이블이 `EXTRA_TABLES` 선언적 목록과 별개로 손으로 작성돼 있음(같은 문제의 두 번째 구현) — 큰 리팩토링이라 별도 세션 권장.
- `automationService.emit()`의 순차 upsert/`upsertTree` 자체를 `Promise.allSettled`로 병렬화 — 트랜잭션 타임아웃은 이번에 늘려 방어했지만, 근본적으로는 배치(`createMany`) 전환이 맞음.
- `approve()`/`reject()`/`delegate()`가 새로 만든 `approvalAccess.js`의 공유 헬퍼 대신 자체 "내 차례" 판정을 씀 — 핵심 결재 트랜잭션이라 이번 라운드에서는 건드리지 않음(§4 참조).
- Mail 페이지(`AvatarListRow.jsx`)의 아바타 색상이 `getAvatarColor`로 마이그레이션되지 않고 옛 이름-해시 팔레트를 그대로 씀 — Documents/Approval/Dashboard/Wiki는 이미 마이그레이션됨. BBS와 공유하는 컴포넌트라 범위가 더 넓어 별도 검토 필요.
- `delegate()`의 `actingType`이 `'위임'` 고정값이 되며 결재란 배지에서 위임자 이름이 안 보이게 된 것(2회차의 VarChar(10) 오버플로 수정에 따른 의도된 트레이드오프) — 알림 메시지에는 이름이 남아있어 완전 유실은 아님.
- Angle B(회귀 감사)·C(크로스파일 추적)는 세션 한도로 미완료 — 다음 라운드에서 재시도 권장.

### 검증
백엔드 전체 테스트 31 스위트 **316건** 통과(신규 bulk-trash draft 회귀 테스트 포함), 프론트 프로덕션 빌드 성공, 백업→복원 실제 DB 라운드트립 재검증(무손실 확인), `AutomationRule.delYn`에 이은 `BoardMember.userId` 인덱스 마이그레이션도 정상 적용.

---

## 리뷰 프로세스 안내

이 리뷰는 **1회성이 아니라 매 반영(커밋/PR)마다 상시 수행**한다. 절차는 `CLAUDE.md`의 "코드 리뷰 · 검증 SQL 운영 규칙" 섹션을 따른다. **이번 3회차처럼, 수정 자체를 다시 리뷰하는 것도 같은 프로세스에 포함된다** — "새 코드가 추가됐다"와 "그 코드가 올바르다"는 항상 분리 검증할 것.
