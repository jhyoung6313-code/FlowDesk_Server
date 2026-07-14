// 실시간 공동편집(F-69) — Yjs y-websocket 서버를 기존 http 서버에 임베드.
// Socket.IO(채팅)와 포트를 공유하되 path로 분리(/collab). Socket.IO의 upgrade는 건드리지 않는다.
// 방(room) 이름 = docName (예: wiki-doc-12, meeting-34). 인증: 핸드셰이크 쿼리의 JWT 검증.
// 영속화: 서버는 인메모리 릴레이만 담당. DB 저장은 클라이언트가 편집 종료/디바운스 시 HTML로 수행한다.

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { setupWSConnection } = require('y-websocket/bin/utils');

// 허용 방 접두사(다른 도메인 오남용 방지)
const ALLOWED_PREFIXES = ['wiki-doc-', 'meeting-'];

function setupCollab(server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (conn, req) => {
    // docName을 방 이름으로 사용(y-websocket 기본은 url path에서 추출하므로 옵션으로 명시)
    setupWSConnection(conn, req, { docName: req._docName, gc: true });
  });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return; }
    // /collab 이외(예: Socket.IO의 /socket.io)는 절대 건드리지 않는다
    if (!url.pathname.startsWith('/collab')) return;

    // 인증: token 쿼리
    const token = url.searchParams.get('token');
    try {
      if (!token) throw new Error('no token');
      jwt.verify(token, process.env.JWT_SECRET);
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
    req._docName = docName;

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  console.log('[실시간 공동편집] y-websocket 등록 완료 (path: /collab/<room>)');
}

module.exports = { setupCollab };
