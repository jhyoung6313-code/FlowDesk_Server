// ─────────────────────────────────────────────────────────────
// 비밀번호 정책 검증 (금융권 강화 기준)
//  - 최소 길이 / 문자 종류(영대·영소·숫자·특수) / 직전 N개 재사용 금지
// ─────────────────────────────────────────────────────────────

const bcrypt = require('bcrypt');
const settings = require('../services/securitySettingsService');

// 형식 검증. 통과하면 null, 실패하면 에러 메시지 반환.
function validateFormat(password, username) {
  const PW = settings.password();
  if (!password || password.length < PW.MIN_LENGTH) {
    return `비밀번호는 ${PW.MIN_LENGTH}자 이상이어야 합니다.`;
  }
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < PW.MIN_CHAR_CLASSES) {
    return `비밀번호는 영대문자·영소문자·숫자·특수문자 중 ${PW.MIN_CHAR_CLASSES}종류 이상을 포함해야 합니다.`;
  }
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) {
    return '비밀번호에 아이디를 포함할 수 없습니다.';
  }
  return null;
}

// 직전 N개 재사용 여부. 재사용이면 에러 메시지, 아니면 null.
async function checkReuse(prisma, userId, newPassword) {
  const { HISTORY_COUNT } = settings.password();
  if (HISTORY_COUNT <= 0) return null;
  const histories = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_COUNT,
  });
  for (const h of histories) {
    if (await bcrypt.compare(newPassword, h.passwordHash)) {
      return `최근 ${HISTORY_COUNT}회 이내 사용한 비밀번호는 다시 사용할 수 없습니다.`;
    }
  }
  return null;
}

// 새 해시를 이력에 추가하고 보관 개수 초과분 삭제.
async function pushHistory(prisma, userId, passwordHash) {
  const { HISTORY_COUNT } = settings.password();
  await prisma.passwordHistory.create({ data: { userId, passwordHash } });
  const old = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: Math.max(HISTORY_COUNT, 0),
    select: { id: true },
  });
  if (old.length) {
    await prisma.passwordHistory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

// 비밀번호 변경 주기 경과 여부
function isExpired(passwordChangedAt) {
  const { EXPIRE_DAYS } = settings.password();
  if (!passwordChangedAt || EXPIRE_DAYS <= 0) return false;
  const ageDays = (Date.now() - new Date(passwordChangedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays >= EXPIRE_DAYS;
}

module.exports = { validateFormat, checkReuse, pushHistory, isExpired };
