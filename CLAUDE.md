# FlowDesk 프로젝트

풀스택 업무관리 시스템 (소규모 팀 2~10명, 로컬 전용)
- 버전: v2.14.1 (디자인 스킨 후속 — 전자결재 결재종류 트리 네비게이션(`GET /api/approvals/tree`, 좌측 2-pane, 건수 롤업, 상세: F-52), 업무목록 담당팀 컬럼 분리, 전역 텍스트 크기 13px 통일(AntD 테이블/Descriptions/Tree 강제), 스킨 AntD 토큰 연결로 메일·게시판·전자결재까지 반영, 스킨 자연 모드 자동 전환. v2.14.0: 디자인 스킨 시스템 도입 — 색상 테마 선택 기능을 **디자인 스킨 8종**(기본·뉴브루탈·클레이·미니멀모노·아우로라글래스·소프트팝·슬릭다크·페이퍼)으로 대체. 스킨=형태(모서리·테두리·그림자·표면·폰트)+강조색+자연 모드. `utils/skins.js` 정의, `store/themeStore.js` 관리(localStorage+서버), `App.jsx` AntD 토큰을 스킨에 연결해 전 화면 반영. 상세: F-20. v2.13: 기능 F-01~F-69 구현 완료 — 위키 실시간 공동편집(Yjs CRDT + 협업 커서, /collab y-websocket 임베드, M365 Word 온라인 대응) 추가. v2.12: 통합 문서함(전 도메인 첨부 통합 검색, SharePoint 라이브러리 경량판). v2.11: 민감도 라벨(공개/사내한/기밀, 위키·게시판 기밀 접근 게이트, Purview 라벨 경량판). v2.10: Forms 설문/투표 엔진(문항·응답·집계, M365 Forms 경량판). v2.9: 회의 빈시간 찾기(Scheduling Assistant, 참석자 공통 가용시간 제안). v2.8: 개인 '내 하루' 통합 홈(업무·회의·액션아이템·결재대기·알림/메일 집계). v2.7: AI 질의응답(RAG)·채팅요약(사내 데이터 근거+출처인용). v2.6: 범용 자동화 규칙 엔진(이벤트→조건→액션: 알림·이메일·채팅·웹훅·업무생성, Power Automate 경량판). v2.5: OKR/목표 관리. v2.4: 회의 관리. v2.3: 협업 위키/문서. v2.2: AI 어시스턴트(Claude API). v2.1: 전자결재·게시판·사내메일·일정/공휴일·PII·보안강화, 다크모드 제거, 조직구조 부서·팀 개편)
- 기능정의서: `FEATURES.md`

## 접속 정보
| 항목 | 값 |
|------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| DB | PostgreSQL 17, localhost:5432, DB명: flowdesk_server, 계정: postgres / postgres1234 |
| Admin 계정 | admin / admin1234 |
| Member 계정 | member1~2 / member1234 |

## 기술 스택
- Frontend: React 18 + Vite + Zustand + Ant Design + FullCalendar v6 + gantt-task-react + Recharts + jspdf
- Backend: Node.js + Express.js + Prisma + JWT + bcrypt + node-cron + nodemailer + Socket.IO
- DB: PostgreSQL 17 (Prisma ORM)
- 인증: JWT 8시간, OTP(otplib v12)

## 주요 파일
- 스키마: `backend/prisma/schema.prisma`
- 환경변수: `backend/.env`
- 서버 시작: `bash restart.sh` (또는 `restart.bat`)
- 기능정의서: `FEATURES.md`
- **새 PC/다른 환경 세팅 가이드: `SETUP.md`**

## 새 PC에서 이어서 작업 (중요)
사용자가 "다른 PC에서 이어서 작업", "새 컴퓨터에서 세팅", "환경 옮기기", "이어받기" 등을 물으면 **`SETUP.md`를 읽고 그 내용으로 안내**한다. 핵심: 코드는 git으로 전부 공유되지만 ① `node_modules`(npm install) ② `backend/.env`(git 제외, `backend/.env.example` 복사 후 값 입력 — 특히 `DATA_ENCRYPTION_KEY`는 기존 DB 데이터를 옮기면 기존 PC와 **동일** 값 필요) ③ PostgreSQL 로컬 DB(`prisma migrate deploy` + 새 DB면 `npm run seed`, 기존 데이터면 `pg_dump`/복원)는 각 PC에서 새로 준비해야 한다. 현재 작업 브랜치는 `feat/m365-gap-features`.

## 디렉토리 구조
```
FlowDesk_Repo/
├── backend/
│   ├── prisma/schema.prisma      # DB 스키마
│   ├── src/
│   │   ├── app.js                # Express 앱 진입점
│   │   ├── socket.js             # Socket.IO 설정
│   │   ├── controllers/          # 비즈니스 로직
│   │   ├── routes/               # API 라우트
│   │   ├── middlewares/          # auth, adminOnly
│   │   └── services/             # notificationService, emailService, sseService
│   └── __tests__/                # 단위 테스트
├── frontend/
│   └── src/
│       ├── api/                  # axios API 함수
│       ├── components/           # 공통 컴포넌트
│       ├── pages/                # 페이지 컴포넌트
│       ├── store/                # Zustand 스토어
│       ├── hooks/                # 커스텀 훅
│       ├── utils/                # 유틸리티 함수
│       └── contexts/             # React Context
├── FEATURES.md                   # 기능정의서
├── README.md
└── MANUAL.md
```

## 버전 관리
- 버전 형식: `MAJOR.MINOR.PATCH` (시맨틱 버저닝)
- 커밋 컨벤션: `feat:` / `fix:` / `docs:` / `refactor:` / `chore:`
- **릴리즈 시**: `CHANGELOG.md` 업데이트 → `CLAUDE.md` 버전 수정 → 커밋 → `git tag -a vX.X.X`
- 롤백: `git reset --hard <태그명>`

## 코드 컨벤션
- 에러 처리: 모든 컨트롤러는 `next(err)` 패턴 사용, 4xx/5xx 에러 응답은 `{ error: '...' }` 필드로 통일 (성공 메시지는 `{ message }` 허용)
- PrismaClient: 싱글턴 사용 — 각 컨트롤러는 `require('../lib/prisma')`로 공유 인스턴스를 가져온다 (개별 `new PrismaClient()` 금지, 커넥션 풀 고갈 방지)
- 업무 소프트 삭제: `del_yn = '1'` (Char(1)) — Prisma 모델에서는 `delYn` 필드
- 비밀번호 정책: `backend/src/config/security.js`의 `PASSWORD` + `utils/passwordPolicy.js`가 **단일 기준**. 기본값 최소 8자·문자종류 4종 중 3종 이상(`.env`로 조정). 신규/변경/재설정·관리자 계정생성 모두 `passwordPolicy.validateFormat`를 사용한다 (별도 정규식 중복 정의 금지)

## 토큰 · 메모리 운영 규칙
작업 효율과 비용 절감을 위해 아래를 지킵니다.
1. **점진적 로드**: 시작 시 이 CLAUDE.md만 읽고, 작업과 직접 관련된 기능 Skill 1~2개만 추가로 호출한다. `FEATURES.md`(전체 기능정의서)·`MANUAL.md`는 정말 필요할 때만 부분 읽기(offset/limit)로 연다.
2. **단일 진실 원천**: 기능 상세는 각 `/tm-*` 문서에만 둔다. CLAUDE.md에는 "어디를 보면 되는지"(인덱스)만 두고 상세를 중복 기재하지 않는다.
3. **검색 우선**: 코드 위치를 찾을 때는 전체 파일 읽기 대신 Grep/Glob으로 좁힌 뒤 필요한 범위만 읽는다.
4. **문서 동기화**: 기능을 추가·변경하면 ① 해당 `/tm-*` 문서 ② `FEATURES.md` ③ 이 표를 함께 갱신한다. 새 기능 도메인이 생기면 `.claude/commands/tm-<name>.md`(repo 내부, 팀 공유·버전관리 대상)를 만들고 이 표에 한 줄 추가한다. Skill 문서는 프로젝트 스코프 슬래시 명령으로 로드되며 git으로 공유된다(개인 설정 `.claude/settings.local.json`은 gitignore 유지).

## 사용 가능한 Skill (기능별 문서)
**작업 시작 시 이 CLAUDE.md만 먼저 읽고, 아래 표에서 작업과 관련된 항목만 골라 해당 Skill을 호출하세요.** 전체 문서를 한꺼번에 읽지 마세요 — 토큰 절약의 핵심입니다.

### 기능 도메인
| 명령어 | 기능(F-번호) | 내용 |
|--------|-------------|------|
| `/tm-auth` | F-01, F-11, F-15, F-22, F-48 | 로그인, OTP 2단계 인증, 비밀번호 변경, 사용자 관리, 접속기록(감사로그) |
| `/tm-core` | F-02~F-07 | 업무 CRUD, 담당자, 기한, 우선순위, 상태 관리, 일괄 처리 |
| `/tm-views` | F-08·09·12·16·20·21·26~28·33 | 캘린더, 간트, 칸반, 대시보드, 다크모드, 마일스톤, 캘린더 메모 |
| `/tm-collab` | F-17, F-23, F-31, F-46 | 댓글, 첨부파일, 업무 히스토리, 타임트래킹 |
| `/tm-automation` | F-10·24·25·29·32 | 팝업 알림, 반복업무, 태그, 이메일 알림, 데스크탑 알림 |
| `/tm-data` | F-18, F-19, F-30, F-44 | Excel 내보내기/가져오기, PDF 출력, 백업/복원 |
| `/tm-wbs` | F-13, F-14 | WBS 프로젝트 관리, 이슈사항 관리, 산출물 파일 |
| `/tm-board` | F-34, F-35 | 보드(Board) 시스템 — 멀티뷰 칸반, 커스텀 속성, 카드, 자동화 |
| `/tm-playbook` | F-36, F-37 | 플레이북(SOP) 엔진 — 정의/실행, 분기·병렬·SLA·버전·웹훅·통계 |
| `/tm-chat` | F-38, F-39 | 채팅 시스템 — DM/그룹/방, 스레드·리액션·핀·전달 |
| `/tm-ledger` | F-45 | 가계부 — 수입/지출/예산/반복거래 |
| `/tm-system` | F-40~F-43 | 시스템 관리 — 부서·팀(조직), 업무 템플릿, 활동 로그, 앱 설정 |
| `/tm-approval` | F-52 | 전자결재 — 결재양식종류·양식·결재선·상신/승인/반려/회수/재상신 |
| `/tm-bbs` | F-53 | 게시판(BBS) — 카테고리·공지/공문·핀·댓글·첨부·대시보드 노출 |
| `/tm-mail` | F-54 | 사내 메일 — 라벨·발송/회신/전달·별표·읽음·첨부·스레드 |
| `/tm-schedule` | F-55 | 일정·공휴일 — 자원(회의실/차량) 예약, 일정, 공휴일 |
| `/tm-security` | F-56, F-57 | 개인정보 보호(PII 입력차단·검출로그·직무분리) + 보안강화(단일세션·비번이력·이상탐지·보관정책) |
| `/tm-ai` | F-58 | AI 어시스턴트(Claude API) — 업무 자동 생성·주간 요약 (`backend/src/services/aiService.js`) |
| `/tm-wiki` | F-59 | 협업 위키/문서 — 스페이스·문서트리·버전이력·댓글 (`controllers/wikiController.js`, `pages/Wiki`) |
| `/tm-meeting` | F-61 | 회의 관리 — 안건·참석자(RSVP)·회의록·결정사항·액션아이템(→업무전환) (`controllers/meetingController.js`, `pages/Meetings`) |
| `/tm-okr` | F-60 | OKR/목표 관리 — 주기·목표·핵심결과·체크인·진척 자동계산 (`controllers/okrController.js`, `pages/Okr`) |
| `/tm-automation-rules` | F-62 | 범용 자동화 규칙 엔진 — 이벤트→조건→액션(알림·이메일·채팅·웹훅·업무생성), Power Automate 경량판 (`services/automationService.js`, `pages/Admin/Automations`) |
| `/tm-ai-search` | F-63 | AI 질의응답(RAG)·채팅요약 — 사내 데이터 근거+출처인용 (`services/ragService.js`, `aiService.js`, `components/ai/AiAsk.jsx`) |
| `/tm-myday` | F-64 | 개인 '내 하루' 통합 홈 — 업무·회의·액션아이템·결재대기·알림/메일 집계 (`controllers/meController.js`, `pages/MyDay`) |
| `/tm-scheduling` | F-65 | 회의 빈시간 찾기 — 참석자 공통 가용시간 제안(Scheduling Assistant) (`services/schedulingService.js`, `components/Schedule/FreeSlotFinder.jsx`) |
| `/tm-forms` | F-66 | Forms 설문/투표 — 문항·응답·집계(M365 Forms 경량판) (`controllers/formController.js`, `pages/Forms`) |
| `/tm-sensitivity` | F-67 | 민감도 라벨 — 공개/사내한/기밀, 위키·게시판 기밀 접근 게이트 (`wikiController.js`, `bbsPostController.js`) |
| `/tm-documents` | F-68 | 통합 문서함 — 전 도메인 첨부 통합 검색(SharePoint 라이브러리 경량판) (`controllers/documentController.js`, `pages/Documents`) |
| `/tm-collab-edit` | F-69 | 위키 실시간 공동편집 — Yjs CRDT+협업커서, /collab y-websocket 임베드 (`collabServer.js`, `components/CollaborativeEditor.jsx`) |

### 참조 문서
| 명령어 | 내용 |
|--------|------|
| `/tm-screens` | 화면 목록 S-01~S-17 및 화면별 개발 요건 |
| `/tm-db` | DB 테이블 스키마 전체 |
| `/tm-api` | REST API 엔드포인트 전체 목록 |
| `/tm-setup` | 기술스택 상세, 디렉토리 구조, 설치/실행 가이드 |
