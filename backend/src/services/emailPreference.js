// 사용자별 "알림 이메일 받지 않기" 설정 — AppSetting 재사용(approval_lines_* 패턴과 동일).
// 결재 요청/리마인더/멘션 이메일(approvalController.js, notificationService.js)이 공유한다.
const prisma = require('../lib/prisma');

const key = (userId) => `email_opt_out_${userId}`;

async function isEmailOptedOut(userId) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(userId) } });
    return row?.value === 'true';
  } catch {
    return false; // 조회 실패 시 기본값(이메일 발송) — 끄기 설정은 "명시적 거부"만 존중
  }
}

async function setEmailOptOut(userId, optOut) {
  const value = optOut ? 'true' : 'false';
  await prisma.appSetting.upsert({
    where: { key: key(userId) },
    create: { key: key(userId), value },
    update: { value },
  });
}

module.exports = { isEmailOptedOut, setEmailOptOut };
