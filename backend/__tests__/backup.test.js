/**
 * backupController (F-44) 테스트 — 복호화 검증 + 복원 범위 특성화(characterization).
 * ⚠️ 현재 restore는 backup이 내보내는 23개 중 10개만 복원한다(나머지 누락은 알려진 결함).
 *    이 테스트는 "현재 복원되는 것/안 되는 것"을 고정해 회귀 및 향후 수정의 기준점으로 둔다.
 */
const crypto = require('crypto');
const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test-secret-for-backup';

jest.mock('@prisma/client', () => {
  const upsert = () => jest.fn().mockResolvedValue({});
  const m = {
    department: { upsert: upsert() }, team: { upsert: upsert() }, tag: { upsert: upsert() },
    milestone: { upsert: upsert() }, task: { upsert: upsert() }, taskAssignee: { upsert: upsert() },
    taskDependency: { upsert: upsert() }, calendarNote: { upsert: upsert() },
    wbsProject: { upsert: upsert() }, appSetting: { upsert: upsert() },
    // 아래는 backup엔 있으나 restore가 건드리지 않는 모델 — 호출되지 않아야 함
    wbsTask: { upsert: upsert() }, wbsIssue: { upsert: upsert() }, taskComment: { upsert: upsert() },
    timeEntry: { upsert: upsert() }, recurringTask: { upsert: upsert() }, taskTag: { upsert: upsert() },
  };
  m.$transaction = jest.fn(async (cb) => cb(m));
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/backupController');

// 컨트롤러와 동일한 방식으로 암호화된 백업 버퍼 생성
function makeBackupBuffer(dataObj) {
  const MAGIC = Buffer.from('FLW1');
  const key = crypto.scryptSync(process.env.JWT_SECRET, 'flowdesk-backup-salt-v1', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify({ version: '1.8', data: dataObj });
  const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ct]);
}

function app(fileBuf) {
  const a = express();
  a.use((req, res, next) => { req.user = { id: 1, role: 'admin' }; if (fileBuf) req.file = { buffer: fileBuf }; next(); });
  a.post('/restore', ctrl.restore);
  a.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('restore — 입력 검증', () => {
  test('파일 없음 → 400', async () => {
    const res = await request(app(null)).post('/restore');
    expect(res.status).toBe(400);
  });
  test('매직/복호화 실패(잘못된 파일) → 400', async () => {
    const res = await request(app(Buffer.from('not-a-backup-file'))).post('/restore');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/복호화/);
  });
});

describe('restore — 복원 범위 특성화', () => {
  const payload = {
    departments: [{ id: 1, name: '개발부', order: 0 }],
    tasks: [{ id: 1, title: 'T', priority: 'normal', status: 'pending', delYn: '0', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    wbsProjects: [{ id: 1, name: 'P', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    // 아래는 복원 대상이 아님(알려진 결함)
    wbsTasks: [{ id: 1, projectId: 1, name: 'W', level: 0, order: 0 }],
    wbsIssues: [{ id: 1, projectId: 1, content: 'I' }],
    taskComments: [{ id: 1, taskId: 1, userId: 1, content: 'C' }],
    timeEntries: [{ id: 1, taskId: 1, userId: 1, minutes: 30 }],
    recurringTasks: [{ id: 1, title: 'R' }],
    taskTags: [{ taskId: 1, tagId: 1 }],
  };

  test('현재 복원되는 모델은 upsert 호출됨', async () => {
    const res = await request(app(makeBackupBuffer(payload))).post('/restore');
    expect(res.status).toBe(200);
    expect(prisma.department.upsert).toHaveBeenCalled();
    expect(prisma.task.upsert).toHaveBeenCalled();
    expect(prisma.wbsProject.upsert).toHaveBeenCalled();
  });

  test('⚠️ 누락 결함: wbsTasks/wbsIssues/taskComments/timeEntries/recurringTasks/taskTags는 복원 안 됨', async () => {
    await request(app(makeBackupBuffer(payload))).post('/restore');
    expect(prisma.wbsTask.upsert).not.toHaveBeenCalled();
    expect(prisma.wbsIssue.upsert).not.toHaveBeenCalled();
    expect(prisma.taskComment.upsert).not.toHaveBeenCalled();
    expect(prisma.timeEntry.upsert).not.toHaveBeenCalled();
    expect(prisma.recurringTask.upsert).not.toHaveBeenCalled();
    expect(prisma.taskTag.upsert).not.toHaveBeenCalled();
  });

  test('data 없는 페이로드 → 400', async () => {
    const res = await request(app(makeBackupBuffer(undefined))).post('/restore');
    expect(res.status).toBe(400);
  });
});
