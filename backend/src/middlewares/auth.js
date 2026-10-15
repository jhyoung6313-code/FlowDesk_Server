const jwt = require('jsonwebtoken');

const userCache = require('../lib/userCache');
const prisma = require('../lib/prisma');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userCache.getUser(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: '유효하지 않은 계정입니다.' });
    }

    // 비밀번호 변경 후 발급 이전 토큰은 무효화 (탈취 토큰 차단)
    const pwAt = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
    if (decoded.pwAt !== undefined && pwAt > decoded.pwAt) {
      return res.status(401).json({ error: '보안 정보가 변경되어 재로그인이 필요합니다.' });
    }

    // 중복 로그인 차단: 토큰의 세션 nonce가 DB와 다르면 더 최근 로그인이 발생한 것
    if (user.sessionNonce && decoded.sn !== user.sessionNonce) {
      return res.status(401).json({ error: '다른 기기에서 로그인되어 현재 세션이 종료되었습니다.', code: 'SESSION_REPLACED' });
    }

    userCache.touchActivity(user.id);   // 1계정 1로그인: 접속 중 표시 갱신

    req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isActive: user.isActive, permissions: user.permissions || [] };
    next();
  } catch (err) {
    // 1계정 1로그인: 만료된 토큰 = 그 세션은 이미 끝난 것이므로 '접속 중' 표시를 바로 지워
    // 만료로 로그인 화면에 돌아온 사용자가 윈도우 시간만큼 로그인이 막히지 않게 한다.
    // (sessionNonce 가 같을 때만 — 이미 다른 세션이 새로 로그인했다면 건드리지 않는다)
    if (err && err.name === 'TokenExpiredError') {
      const d = jwt.decode(token);
      if (d && Number.isInteger(d.userId) && d.sn) {
        prisma.user
          .updateMany({ where: { id: d.userId, sessionNonce: d.sn }, data: { lastActiveAt: null } })
          .then(() => userCache.invalidate(d.userId))
          .catch(() => {});
      }
    }
    return res.status(401).json({ error: '토큰이 유효하지 않거나 만료되었습니다.' });
  }
};

module.exports = { authenticate };
