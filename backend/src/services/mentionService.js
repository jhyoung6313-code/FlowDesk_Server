const prisma = require('../lib/prisma');
const { pushNotification } = require('./sseService');

// 본문에서 @표시 토큰을 추출 (한글/영문/숫자/._- 허용)
function extractMentionTokens(text) {
  if (!text) return [];
  const stripped = text.replace(/<[^>]*>/g, ' ');
  const matches = stripped.match(/@([\w.\-가-힣]{1,50})/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

/**
 * 댓글 등 본문의 @멘션을 파싱해 해당 사용자에게 mention 알림을 생성한다.
 * @param {Object} opts
 * @param {string} opts.content   원문(@displayName / @username 포함)
 * @param {number} opts.actorId   멘션한 사람(본인 제외)
 * @param {string} opts.actorName 멘션한 사람 이름(메시지 표기용)
 * @param {string} opts.context   "업무" 등 위치 라벨
 * @param {string} opts.link      클릭 시 이동 경로 (예: /tasks?taskId=12)
 * @param {number} [opts.taskId]  연결 업무 id (선택)
 * @returns {Promise<number[]>}   알림이 생성된 사용자 id 목록
 */
async function notifyMentions({ content, actorId, actorName, context, link, taskId = null }) {
  const tokens = extractMentionTokens(content);
  if (tokens.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { displayName: { in: tokens } },
        { username: { in: tokens } },
      ],
    },
    select: { id: true, displayName: true, username: true },
  });

  const targets = users.filter((u) => u.id !== actorId);
  const notifiedIds = [];

  for (const u of targets) {
    const message = `${actorName}님이 ${context}에서 회원님을 언급했습니다.`;
    const notif = await prisma.notification.create({
      data: {
        userId: u.id,
        actorId,
        taskId,
        link,
        message,
        type: 'mention',
      },
      include: { task: { select: { id: true, title: true, dueDate: true } } },
    });
    pushNotification(u.id, notif);
    notifiedIds.push(u.id);
  }

  return notifiedIds;
}

module.exports = { notifyMentions, extractMentionTokens };
