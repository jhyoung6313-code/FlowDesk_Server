# FlowDesk 프로젝트

풀스택 업무관리 시스템 (소규모 팀 2~10명, 로컬 전용)
- 버전: v1.9.2 (기능 F-01~F-48 구현 완료 + Playbook 9대 개선 — SLA알림·PDF·분기·체크리스트·실시간·버전이력·통계·병렬·웹훅, 다크모드 전면 적용)
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
4. **문서 동기화**: 기능을 추가·변경하면 ① 해당 `/tm-*` 문서 ② `FEATURES.md` ③ 이 표를 함께 갱신한다. 새 기능 도메인이 생기면 `~/.claude/commands/tm-<name>.md`를 만들고 이 표에 한 줄 추가한다.

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
| `/tm-system` | F-40~F-43 | 시스템 관리 — 파트, 업무 템플릿, 활동 로그, 앱 설정 |

### 참조 문서
| 명령어 | 내용 |
|--------|------|
| `/tm-screens` | 화면 목록 S-01~S-17 및 화면별 개발 요건 |
| `/tm-db` | DB 테이블 스키마 전체 |
| `/tm-api` | REST API 엔드포인트 전체 목록 |
| `/tm-setup` | 기술스택 상세, 디렉토리 구조, 설치/실행 가이드 |
