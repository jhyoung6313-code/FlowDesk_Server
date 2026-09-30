// 실시간 공동편집(F-69) — Yjs y-websocket 서버를 기존 http 서버에 임베드.
// Socket.IO(채팅)와 포트를 공유하되 path로 분리(/collab). Socket.IO의 upgrade는 건드리지 않는다.
// 방(room) 이름 = docName (예: wiki-doc-12, meeting-34). 인증: 핸드셰이크 쿼리의 JWT 검증.
// 영속화: 서버는 인메모리 릴레이만 담당. DB 저장은 클라이언트가 편집 종료/디바운스 시 HTML로 수행한다.

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');
const prisma = require('./lib/prisma');

// DB 저장은 클라이언트가 담당하므로 서버측 영속화는 no-op이면 충분하다. 하지만 persistence가
// null이면 y-websocket의 closeConn()이 "마지막 연결 종료 시 문서를 메모리에서 제거"하는 분기를
// 절대 타지 않아(203행 부근: `if (doc.conns.size === 0 && persistence !== null)`), 문서를 한 번이라도
// 연 적 있는 모든 wiki/meeting에 대해 Y.Doc+Awareness가 프로세스 종료까지 영구 누적된다.
// no-op이라도 등록해 기존 퇴출 로직이 정상 작동하게 한다.
setPersistence({
  bindState: async () => {},
  writeState: async () => {},
});

// 허용 방 접두사(다른 도메인 오남용 방지)
const ALLOWED_PREFIXES = ['wiki-doc-', 'meeting-'];

// 방(docName)이 가리키는 실제 문서에 대해 해당 사용자가 REST API(GET)와 동일한 권한을
// 갖는지 확인한다. wikiController.canAccessSpace/canSeeSensitive, meetingController의
// organizer/attendee 규칙과 동일한 기준 — REST에서 403인 문서는 여기서도 거부해야 한다.
async function canJoinRoom(docName, user) {
  const isAdmin = user.role === 'admin';

  if (docName.startsWith('wiki-doc-')) {
    const id = Number(docName.slice('wiki-doc-'.length));
    if (!Number.isInteger(id)) return false;
    const doc = await prisma.wikiDoc.findFirst({
      where: { id, delYn: '0' },
      select: { createdBy: true, sensitivity: true, space: { select: { visibility: true, createdBy: true } } },
    });
    if (!doc) return false;
    const canAccessSpace = doc.space.visibility === 'public' || isAdmin || doc.space.createdBy === user.id;
    if (!canAccessSpace) return false;
    const canSeeSensitive = doc.sensitivity !== 'confidential' || isAdmin || doc.createdBy === user.id;
    return canSeeSensitive;
  }

  if (docName.startsWith('meeting-')) {
    const id = Number(docName.slice('meeting-'.length));
    if (!Number.isInteger(id)) return false;
    const meeting = await prisma.meeting.findFirst({
      where: { id, delYn: '0' },
      select: { organizerId: true, attendees: { select: { userId: true } } },
    });
    if (!meeting) return false;
    if (isAdmin || meeting.organizerId === user.id) return true;
    return meeting.attendees.some((a) => a.userId === user.id);
  }

  return false;
}

function setupCollab(server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (conn, req) => {
    // docName을 방 이름으로 사용(y-websocket 기본은 url path에서 추출하므로 옵션으로 명시)
    setupWSConnection(conn, req, { docName: req._docName, gc: true });
  });

  server.on('upgrade', async (req, socket, head) => {
    // upgrade 핸들러가 async라 DB 조회로 실제 대기 구간이 생겼다 — 그 사이 클라이언트가
    // 연결을 끊으면(탭 닫기 등) 이후 socket.write/destroy가 이미 죽은 소켓에 쓰기를 시도해
    // 'error' 이벤트가 발생한다. 리스너가 없으면 Node가 이를 uncaught exception으로 승격시켜
    // 프로세스 전체가 죽는다 — 반드시 가장 먼저 등록한다.
    socket.on('error', () => {});

    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return; }
    // /collab 이외(예: Socket.IO의 /socket.io)는 절대 건드리지 않는다
    if (!url.pathname.startsWith('/collab')) return;

    // 인증: token 쿼리
    const token = url.searchParams.get('token');
    let decoded;
    try {
      if (!token) throw new Error('no token');
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // 방 이름: /collab/<docName>
    const docName = decodeURIComponent(url.pathname.slice('/collab/'.length)) || '';
    if (!ALLOWED_PREFIXES.some((p) => docName.startsWith(p))) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // 문서 단위 권한 검증(REST API와 동일 규칙) — 비공개 스페이스·기밀 문서·비참석 회의는 거부
    try {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, role: true, isActive: true, passwordChangedAt: true, sessionNonce: true },
      });
      if (!user || !user.isActive) throw new Error('inactive');
      // REST의 authenticate 미들웨어와 동일하게 비밀번호 변경(탈취 토큰 차단)·중복 로그인(단일세션,
      // F-57) 무효화를 여기서도 검증한다 — 이게 없으면 REST에서는 즉시 401로 끊기는 토큰이
      // /collab에서는 계속 유효해, 비밀번호를 바꾸거나 다른 기기에서 로그인해 세션을 끊어도
      // 예전 토큰으로 실시간 편집에 계속 접속할 수 있었다.
      const pwAt = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
      if (decoded.pwAt !== undefined && pwAt > decoded.pwAt) throw new Error('stale password');
      if (user.sessionNonce && decoded.sn !== user.sessionNonce) throw new Error('session replaced');
      const allowed = await canJoinRoom(docName, user);
      if (!allowed) throw new Error('forbidden');
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    req._docName = docName;

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  console.log('[실시간 공동편집] y-websocket 등록 완료 (path: /collab/<room>)');
}

module.exports = { setupCollab };
