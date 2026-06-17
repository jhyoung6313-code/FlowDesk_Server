# 업무 & 일정 관리 시스템

소규모 팀(2~10명)을 위한 로컬 기반 업무 관리 시스템입니다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18 + Vite + Zustand + Ant Design |
| 캘린더 | FullCalendar.js |
| 간트 차트 | Frappe Gantt |
| 차트 | Recharts |
| 백엔드 | Node.js + Express.js |
| ORM | Prisma |
| DB | MySQL 8.x 또는 PostgreSQL 15.x |
| 인증 | JWT + bcrypt |

---

## 빠른 시작

### 1. DB 준비

**MySQL 사용 시:**
```sql
CREATE DATABASE task_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**PostgreSQL 사용 시:**
```sql
CREATE DATABASE task_manager;
```

### 2. 백엔드 설정

```bash
cd backend

# 패키지 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 DATABASE_URL, JWT_SECRET 수정

# DB 스키마 적용
npx prisma migrate dev --name init

# Prisma 클라이언트 생성
npx prisma generate

# 시드 데이터 생성 (선택)
node prisma/seed.js

# 서버 실행
npm run dev
# → http://localhost:4000
```

### 3. 프론트엔드 설정

```bash
cd frontend

# 패키지 설치
npm install

# 개발 서버 실행
npm run dev
# → http://localhost:3000
```

### 4. 브라우저 접속

```
http://localhost:3000
```

---

## 기본 로그인 계정 (시드 실행 후)

| 역할 | 아이디 | 비밀번호 |
|------|--------|----------|
| 관리자 | admin | admin1234 |
| 팀원 | member1 | member1234 |
| 팀원 | member2 | member1234 |

---

## 주요 기능

### F-01. 사용자 관리 (Admin)
- 팀원 계정 생성/수정/비활성화
- 역할 설정: 관리자 / 팀원

### F-02. 담당파트 관리 (Admin)
- 파트 자유 텍스트 등록/수정/삭제

### F-03~07. 업무 관리
- 업무 CRUD (제목, 설명, 파트, 담당자, 기한, 우선순위, 상태, 의존관계)
- 복수 담당자 지정
- 우선순위: 높음(빨강) / 보통(노랑) / 낮음(회색)
- 진행상태: 대기 → 진행중 → 완료 → 보류
- D-day 자동 계산 및 색상 강조

### F-08. 캘린더 뷰
- FullCalendar 기반 월/주/일 뷰
- 업무 클릭 시 상세 팝업
- 드래그로 기한 변경

### F-09. 간트 차트
- Frappe Gantt 기반 기간 막대 표시
- 업무 의존관계 화살표 연결
- 일/주/월 축 전환
- 드래그로 기간 변경

### F-10. 팝업 알림
- 매일 09:00 자동 알림 생성 (서버)
  - 마감 3일 전 (due_soon)
  - 마감 당일 (due_today)
  - 마감 초과 (overdue)
- 프론트엔드 읽음/전체읽음 처리

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/auth/login | 로그인 |
| GET | /api/auth/me | 내 정보 |
| PUT | /api/auth/password | 비밀번호 변경 |
| GET | /api/users | 사용자 목록 |
| POST | /api/users | 사용자 생성 (Admin) |
| GET | /api/parts | 파트 목록 |
| GET | /api/tasks | 업무 목록 (필터/정렬) |
| POST | /api/tasks | 업무 생성 |
| PUT | /api/tasks/:id | 업무 수정 |
| PATCH | /api/tasks/:id/status | 상태 변경 |
| GET | /api/tasks/calendar | 캘린더 업무 목록 |
| GET | /api/tasks/gantt | 간트 업무+의존관계 |
| GET | /api/notifications | 알림 목록 |

---

## 디렉토리 구조

```
task-manager/
├── frontend/                  # React 앱 (Vite)
│   └── src/
│       ├── api/               # Axios API 함수
│       ├── components/        # 공통 컴포넌트
│       ├── pages/             # 화면 페이지
│       ├── store/             # Zustand 상태 관리
│       └── utils/             # D-day, 색상 등 유틸
│
└── backend/                   # Express API 서버
    ├── prisma/
    │   ├── schema.prisma      # DB 스키마
    │   └── seed.js            # 시드 데이터
    └── src/
        ├── controllers/       # 요청 핸들러
        ├── middlewares/       # 인증/권한 미들웨어
        ├── routes/            # API 라우트
        └── services/          # 알림 스케줄러
```
