# tm-setup — 기술스택 · 디렉토리 · 실행

## 기술 스택
- **Frontend**: React 18 + Vite + Zustand + Ant Design + FullCalendar v6 + gantt-task-react + Recharts + jspdf
- **Backend**: Node.js + Express.js + Prisma + JWT + bcrypt + node-cron + nodemailer + Socket.IO
- **DB**: PostgreSQL 17 (Prisma ORM)
- **인증**: JWT 8시간, OTP(otplib v12)

## 접속 정보
| 항목 | 값 |
|------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| DB | PostgreSQL 17, localhost:5432, DB `flowdesk_server`, 계정 postgres / postgres1234 |
| Admin | admin / admin1234 |
| Member | member1~2 / member1234 |

## 실행
- 서버 시작: `bash restart.sh` (또는 `restart.bat`)

## 디렉토리 구조
```
FlowDesk_Repo/
├── backend/
│   ├── prisma/schema.prisma      # DB 스키마 ([tm-db])
│   ├── .env                      # 환경변수
│   └── src/
│       ├── app.js                # Express 진입점
│       ├── socket.js             # Socket.IO
│       ├── lib/prisma.js         # PrismaClient 싱글턴
│       ├── config/security.js    # 비밀번호·감사 상수
│       ├── controllers/          # 비즈니스 로직
│       ├── routes/               # API 라우트 ([tm-api])
│       ├── middlewares/          # auth, adminOnly, piiGuard, requirePermission
│       ├── services/             # notification/email/sse/mention/audit/pii/anomaly 등
│       └── utils/passwordPolicy.js
└── frontend/
    └── src/
        ├── api/       # axios API 함수
        ├── components/
        ├── pages/     # 페이지 ([tm-screens])
        ├── store/     # Zustand
        ├── hooks/
        ├── utils/
        └── contexts/
```

## 핵심 컨벤션
- 에러: `next(err)`, `{ error }` 필드 통일
- Prisma: `require('../lib/prisma')` 싱글턴 (개별 `new PrismaClient()` 금지)
- 소프트 삭제: `del_yn='1'` → Prisma `delYn`
- 비밀번호 정책: `config/security.js` + `utils/passwordPolicy.js` 단일 기준
- 버전: 시맨틱 버저닝, 릴리즈 시 CHANGELOG.md → CLAUDE.md 버전 → 커밋 → `git tag`
