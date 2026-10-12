// ─────────────────────────────────────────────────────────────
// 백업 자동 스케줄링(F-44 확장) — 관리자가 매번 수동으로 "백업 다운로드"를
// 누르지 않아도, cron 주기로 암호화 백업 파일을 서버 로컬 디스크에 보관한다.
// 외부 전송 없음(폐쇄망 전제) — 전부 로컬 디스크 읽기/쓰기로 끝난다.
// ─────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { buildBackupBuffer } = require('../controllers/backupController');
const audit = require('./auditService');
const { AUDIT_ACTION } = require('../config/security');

const BACKUP_DIR = path.join(__dirname, '../../backups');
const FILE_PREFIX = 'flowdesk_auto_backup_';

function isEnabled() {
  return (process.env.BACKUP_AUTO_ENABLED || 'true').toLowerCase() !== 'false';
}

function getCron() {
  return process.env.BACKUP_AUTO_CRON || '30 3 * * *';
}

function getRetentionCount() {
  const n = Number(process.env.BACKUP_RETENTION_COUNT);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

function timestampForFilename() {
  // 파일시스템 안전 + 하루 여러 번 실행돼도 충돌하지 않도록 분 단위까지 포함
  return new Date().toISOString().replace(/:/g, '-').slice(0, 19);
}

// 보관 개수를 초과하는 오래된 자동 백업 파일을 정리
function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith('.enc'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const retain = getRetentionCount();
  files.slice(retain).forEach((f) => {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch (e) { console.error('[backup-scheduler] 오래된 백업 삭제 실패:', e.message); }
  });
}

async function runAutoBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const encrypted = await buildBackupBuffer();
    const filename = `${FILE_PREFIX}${timestampForFilename()}.enc`;
    fs.writeFileSync(path.join(BACKUP_DIR, filename), encrypted);
    pruneOldBackups();
    // 수동 백업(GET /api/admin/backup)은 auditAction 미들웨어로 감사로그에 남는데,
    // cron에서 직접 도는 자동 백업은 Express 라우트를 거치지 않아 기록이 전혀 없었다 —
    // 매일 전체 DB 덤프가 디스크에 쌓이는데 감사로그엔 공백이 생기는 보안감사(F-57) 공백.
    await audit.record({ action: AUDIT_ACTION.DATA_EXPORT, resource: 'backup/auto', detail: filename });
    console.log(`[backup-scheduler] 자동 백업 완료: ${filename}`);
  } catch (err) {
    console.error('[backup-scheduler] 자동 백업 실패:', err.message);
    await audit.record({ action: AUDIT_ACTION.DATA_EXPORT, resource: 'backup/auto', detail: err.message, success: false });
  }
}

function scheduleAutoBackup() {
  if (!isEnabled()) {
    console.log('[backup-scheduler] BACKUP_AUTO_ENABLED=false — 자동 백업 비활성화');
    return;
  }
  cron.schedule(getCron(), runAutoBackup);
  console.log(`[backup-scheduler] 자동 백업 스케줄 등록: ${getCron()} (보관 ${getRetentionCount()}개)`);
}

// 관리자 화면에서 현재 설정·보관 파일 목록을 보여주기 위한 조회용
function listAutoBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith('.enc'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = {
  scheduleAutoBackup, runAutoBackup, pruneOldBackups, listAutoBackups,
  BACKUP_DIR, isEnabled, getCron, getRetentionCount,
};
