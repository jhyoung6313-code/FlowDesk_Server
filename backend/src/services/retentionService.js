// ─────────────────────────────────────────────────────────────
// 데이터 보유기간 자동 파기 (개인정보보호법 파기 의무)
//  - 매일 새벽 cron 실행. 파기 행위 자체를 DATA_PURGE 감사로그(파기대장)에 기록.
//
// ⚠️ 금융거래기록(전자금융거래법 5년 보관) 등 법정 보관의무 데이터는
//    이 서비스의 파기 대상에서 제외한다. 보유기간은 config/security.js 에서 관리.
// ─────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const audit = require('./auditService');
const { RETENTION, AUDIT_ACTION } = require('../config/security');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);

// 파기 1건을 대장에 기록
async function logPurge(target, count, detail) {
  if (count > 0) {
    await audit.record({ action: AUDIT_ACTION.DATA_PURGE, resource: target, detail: detail || `purged=${count}` });
    console.log(`[retention] ${target}: ${count}건 파기`);
  }
}

// 1) 감사로그: 보유기간(기본 3년) 경과분 삭제
async function purgeAuditLogs() {
  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: daysAgo(RETENTION.AUDIT_LOG_DAYS) }, action: { not: AUDIT_ACTION.DATA_PURGE } },
  });
  await logPurge('audit_logs', count, `older_than=${RETENTION.AUDIT_LOG_DAYS}d`);
}

// 2) 소프트삭제 업무(del_yn=1): 유예기간 경과 시 물리 삭제 (+ 첨부파일 동반)
async function purgeSoftDeletedTasks() {
  const cutoff = daysAgo(RETENTION.SOFT_DELETED_TASK_DAYS);
  const tasks = await prisma.task.findMany({
    where: { delYn: '1', updatedAt: { lt: cutoff } },
    select: { id: true, attachments: { select: { storedName: true } } },
  });
  if (!tasks.length) return;

  // 첨부 실제 파일부터 정리
  for (const t of tasks) {
    for (const att of t.attachments) {
      const filePath = path.join(UPLOAD_DIR, att.storedName);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { console.error('[retention] 파일 삭제 실패:', e.message); }
    }
  }
  // 관계는 onDelete: Cascade 로 함께 삭제됨
  const { count } = await prisma.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
  await logPurge('tasks(soft-deleted)', count, `grace=${RETENTION.SOFT_DELETED_TASK_DAYS}d`);
}

// 3) 읽은 알림: 보유기간 경과분 삭제
async function purgeReadNotifications() {
  const { count } = await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: daysAgo(RETENTION.READ_NOTIFICATION_DAYS) } },
  });
  await logPurge('notifications(read)', count, `older_than=${RETENTION.READ_NOTIFICATION_DAYS}d`);
}

// 4) Orphan 첨부파일: DB에 없는 업로드 파일 정리
async function purgeOrphanFiles() {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  const dbNames = new Set((await prisma.taskAttachment.findMany({ select: { storedName: true } })).map((a) => a.storedName));
  const files = fs.readdirSync(UPLOAD_DIR);
  let count = 0;
  for (const f of files) {
    if (dbNames.has(f)) continue;
    // 24시간 이내 생성 파일은 업로드 진행 중일 수 있어 제외
    const stat = fs.statSync(path.join(UPLOAD_DIR, f));
    if (Date.now() - stat.mtimeMs < DAY) continue;
    try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); count++; } catch (e) { console.error('[retention] orphan 삭제 실패:', e.message); }
  }
  await logPurge('uploads(orphan)', count);
}

// 전체 파기 1회 실행
async function runPurge() {
  console.log('[retention] 자동 파기 시작:', new Date().toISOString());
  try {
    await purgeAuditLogs();
    await purgeSoftDeletedTasks();
    await purgeReadNotifications();
    await purgeOrphanFiles();
  } catch (err) {
    console.error('[retention] 파기 오류:', err.message);
  }
}

function scheduleRetention() {
  cron.schedule(RETENTION.PURGE_CRON, runPurge);
  console.log(`[retention] 자동 파기 스케줄 등록: ${RETENTION.PURGE_CRON}`);
}

module.exports = { scheduleRetention, runPurge };
