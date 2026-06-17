const jwt = require('jsonwebtoken');

const prisma = require('../lib/prisma');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, displayName: true, role: true, isActive: true, passwordChangedAt: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: '유효하지 않은 계정입니다.' });
    }

    // 비밀번호 변경 후 발급 이전 토큰은 무효화 (탈취 토큰 차단)
    const pwAt = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
    if (decoded.pwAt !== undefined && pwAt > decoded.pwAt) {
      return res.status(401).json({ error: '보안 정보가 변경되어 재로그인이 필요합니다.' });
    }

    req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isActive: user.isActive };
    next();
  } catch (err) {
    return res.status(401).json({ error: '토큰이 유효하지 않거나 만료되었습니다.' });
  }
};

module.exports = { authenticate };
