/**
 * backupScheduler(F-44 자동 백업) 단위 테스트 — fs를 모킹해 실제 디스크에 쓰지 않는다.
 * 모든 설정값은 env에서 call-time에 읽으므로(모듈 캐시 리셋 불필요) 모듈을 한 번만 require한다.
 */
jest.mock('fs');
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/controllers/backupController', () => ({
  buildBackupBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-encrypted')),
}));
jest.mock('../src/services/auditService', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const fs = require('fs');
const cron = require('node-cron');
const { buildBackupBuffer } = require('../src/controllers/backupController');
const audit = require('../src/services/auditService');
const scheduler = require('../src/services/backupScheduler');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BACKUP_AUTO_ENABLED = 'true';
  process.env.BACKUP_AUTO_CRON = '30 3 * * *';
  process.env.BACKUP_RETENTION_COUNT = '3';
});

afterAll(() => { process.env = ORIGINAL_ENV; });

describe('설정 getter', () => {
  test('기본값 반환(env 미설정 시)', () => {
    delete process.env.BACKUP_AUTO_ENABLED;
    delete process.env.BACKUP_AUTO_CRON;
    delete process.env.BACKUP_RETENTION_COUNT;
    expect(scheduler.isEnabled()).toBe(true);
    expect(scheduler.getCron()).toBe('30 3 * * *');
    expect(scheduler.getRetentionCount()).toBe(14);
  });

  test('BACKUP_AUTO_ENABLED=false → 비활성화, 스케줄 등록 안 함', () => {
    process.env.BACKUP_AUTO_ENABLED = 'false';
    scheduler.scheduleAutoBackup();
    expect(cron.schedule).not.toHaveBeenCalled();
  });

  test('활성화 시 cron.schedule 호출', () => {
    process.env.BACKUP_AUTO_CRON = '0 4 * * *';
    scheduler.scheduleAutoBackup();
    expect(cron.schedule).toHaveBeenCalledWith('0 4 * * *', expect.any(Function));
  });
});

describe('pruneOldBackups', () => {
  test('보관개수(3) 초과분을 오래된 순으로 삭제', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([
      'flowdesk_auto_backup_A.enc', 'flowdesk_auto_backup_B.enc',
      'flowdesk_auto_backup_C.enc', 'flowdesk_auto_backup_D.enc',
      'other.txt',
    ]);
    const mtimes = { A: 400, B: 300, C: 200, D: 100 }; // A가 가장 최신
    fs.statSync.mockImplementation((p) => {
      const key = String(p).match(/_(\w)\.enc$/)[1];
      return { mtimeMs: mtimes[key] };
    });

    scheduler.pruneOldBackups();

    // 4개 중 최신 3개(A,B,C) 유지, 가장 오래된 D만 삭제
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync.mock.calls[0][0]).toMatch(/D\.enc$/);
  });

  test('디렉토리가 없으면 아무 것도 하지 않음', () => {
    fs.existsSync.mockReturnValue(false);
    scheduler.pruneOldBackups();
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });
});

describe('runAutoBackup', () => {
  test('buildBackupBuffer 결과를 파일로 쓰고 정리까지 수행', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);

    await scheduler.runAutoBackup();

    expect(buildBackupBuffer).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
    const [writtenPath, writtenBuf] = fs.writeFileSync.mock.calls[0];
    expect(writtenPath).toMatch(/flowdesk_auto_backup_.*\.enc$/);
    expect(writtenBuf.toString()).toBe('fake-encrypted');
    // 수동 백업과 동일하게 감사로그(DATA_EXPORT)에 기록되어야 한다 — 이게 없으면 매일
    // 전체 DB 덤프가 디스크에 쌓이는데 보안감사(F-57) 추적이 전혀 안 되는 공백이 있었다.
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DATA_EXPORT', resource: 'backup/auto' }));
  });

  test('buildBackupBuffer 실패해도 예외를 던지지 않음(로그만) — 실패도 감사로그에 success:false로 기록', async () => {
    fs.existsSync.mockReturnValue(true);
    buildBackupBuffer.mockRejectedValueOnce(new Error('db down'));
    await expect(scheduler.runAutoBackup()).resolves.toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ resource: 'backup/auto', success: false }));
  });
});

describe('listAutoBackups', () => {
  test('최신순 정렬된 파일 메타데이터 반환', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['flowdesk_auto_backup_old.enc', 'flowdesk_auto_backup_new.enc']);
    fs.statSync.mockImplementation((p) => ({
      size: 100,
      mtime: String(p).includes('new') ? new Date('2026-02-01') : new Date('2026-01-01'),
    }));

    const result = scheduler.listAutoBackups();
    expect(result[0].filename).toBe('flowdesk_auto_backup_new.enc');
    expect(result[1].filename).toBe('flowdesk_auto_backup_old.enc');
  });
});
