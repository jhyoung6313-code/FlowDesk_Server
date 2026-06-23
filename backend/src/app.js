require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const { scheduleNotifications } = require('./services/notificationService');
const { scheduleRetention } = require('./services/retentionService');
const { scheduleAnomalyScan } = require('./services/anomalyService');
const { auditForbidden } = require('./middlewares/auditLogger');
const { setupSocketIO } = require('./socket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const isDev = process.env.NODE_ENV === 'development';

// nginx 프록시 신뢰 (express-rate-limit X-Forwarded-For 오류 방지)
app.set('trust proxy', 1);

// 보안 헤더 (ISMS-P 2.10.3) — HSTS·X-Frame-Options·noSniff 등
// 본 서버는 JSON API + 업로드 파일 서빙만 담당(프론트는 별도 nginx/Vite).
// CSP는 프론트 정적 서버에서 적용하고, API 서버에서는 헤더 충돌을 피하기 위해 비활성.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // 다른 오리진(프론트)의 업로드 이미지 로드 허용
  // HSTS: 운영(HTTPS) 환경에서만 의미. 1년 + 서브도메인
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// 헬스체크 엔드포인트 (Docker healthcheck용)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 미들웨어
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost', 'https://localhost', 'https://localhost:5443'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting: 로그인 전용 — 5분에 최대 10회
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '로그인 시도가 너무 많습니다. 5분 후 다시 시도해주세요.' },
  skip: () => isDev, // 개발 환경에서는 제한 없음
});

// Rate Limiting: 전체 API — 1분에 최대 300회 (정상 사용 범위)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  skip: () => isDev,
});

// Rate Limiting: 미인증 웹훅 트리거 전용 — 외부 노출 엔드포인트라 더 엄격(1분에 30회)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '웹훅 호출이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  skip: () => isDev,
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/webhooks/trigger', webhookLimiter);
app.use('/api', apiLimiter);

// 업로드 파일 정적 서빙
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 권한거부(403) 자동 감사로깅 — 권한 탐색 시도 탐지용
app.use('/api', auditForbidden);

// API 라우터
app.use('/api', routes);

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  const status = err.status || 500;

  // 개발 환경: 상세 에러 출력 / 운영 환경: 내부 정보 숨김
  if (isDev) {
    console.error(err.stack);
    return res.status(status).json({ error: err.message });
  }

  console.error(`[${new Date().toISOString()}] ${status} ${req.method} ${req.path} — ${err.message}`);
  // 400번대는 클라이언트 오류이므로 메시지 그대로 반환, 500번대는 제네릭 메시지
  const message = status < 500 ? err.message : '서버 내부 오류가 발생했습니다.';
  res.status(status).json({ error: message });
});

const io = setupSocketIO(server);

// boardController에 socket.io 인스턴스 주입 (채팅방 알림용)
const boardController = require('./controllers/boardController');
boardController.setIO(io);

// playbookRunController에 socket.io 인스턴스 주입 (런 실시간 협업용)
const playbookRunController = require('./controllers/playbookRunController');
playbookRunController.setIO(io);

// chatController에 socket.io 인스턴스 주입 (채팅방 생성 알림용)
const chatController = require('./controllers/chatController');
chatController.setIO(io);

// linkedRoomService에 socket.io 인스턴스 주입 (보드/런 전용 채팅방 알림용)
const linkedRoomService = require('./services/linkedRoomService');
linkedRoomService.setIO(io);

server.listen(PORT, () => {
  console.log(`백엔드 서버 실행 중: http://localhost:${PORT}`);
  scheduleNotifications();
  scheduleRetention();    // 데이터 보유기간 자동 파기
  scheduleAnomalyScan();  // 비정상 접근 탐지
  startScheduledMessageSender(io);
});

// 예약 발송 cron (1분마다)
function startScheduledMessageSender(io) {
  const cron = require('node-cron');
  const db = require('./lib/prisma');
  cron.schedule('* * * * *', async () => {
    try {
      const due = await db.scheduledChatMessage.findMany({
        where: { sent: false, scheduledAt: { lte: new Date() } },
        include: { sender: { select: { id: true, displayName: true, avatarColor: true } } },
      });
      for (const m of due) {
        const MSG_INCLUDE = {
          sender: { select: { id: true, displayName: true, avatarColor: true } },
          reactions: { include: { user: { select: { id: true, displayName: true } } } },
          forwardedFrom: { select: { id: true, content: true, sender: { select: { id: true, displayName: true } } } },
          _count: { select: { replies: true } },
          room: { select: { type: true } },
        };
        const msg = await db.chatMessage.create({
          data: { roomId: m.roomId, senderId: m.senderId, content: m.content },
          include: MSG_INCLUDE,
        });
        await db.scheduledChatMessage.update({ where: { id: m.id }, data: { sent: true } });
        if (io) io.to(`room:${m.roomId}`).emit('new-message', msg);
      }
    } catch (err) { console.error('[scheduled-msg] 오류:', err.message); }
  });
}

module.exports = { app, server };
