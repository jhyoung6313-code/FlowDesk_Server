// 인증 미들웨어/소켓 연결마다 발생하는 User 재조회를 줄이기 위한 인메모리 TTL 캐시.
// 200명 동시접속 환경에서 매 요청마다 DB를 치는 것을 막는 게 목적이라, 보안에 영향을
// 주는 변경(로그인/로그아웃/비밀번호 변경/계정 활성화 토글)이 일어나는 지점에서는
// 반드시 invalidate()를 호출해 TTL 만료를 기다리지 않고 즉시 캐시를 비워야 한다.
const prisma = require('./prisma');

const TTL_MS = 15000;

const cache = new Map(); // userId -> { user, expires }

// auth 미들웨어와 socket 핸드셰이크가 공통으로 필요한 필드의 합집합.
// 호출부마다 select가 다르면 캐시 적중 시 일부 필드가 누락된 객체가 돌아올 수 있으므로
// 단일 select로 통일한다.
const SELECT_FIELDS = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  isActive: true,
  passwordChangedAt: true,
  sessionNonce: true,
  permissions: true,
  avatarColor: true,
};

async function getUser(userId) {
  const entry = cache.get(userId);
  if (entry && Date.now() <= entry.expires) {
    return entry.user;
  }
  cache.delete(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SELECT_FIELDS });
  if (user) cache.set(userId, { user, expires: Date.now() + TTL_MS });
  return user;
}

function invalidate(userId) {
  cache.delete(userId);
}

module.exports = { getUser, invalidate };
