/**
 * 통합 문서/첨부 허브(F-68) 테스트 — documentController.list (mock prisma)
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    taskAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    boardCardAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    bbsAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    approvalAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    internalMailAttachment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/documentController');

function app(role = 'member', uid = 5) {
  const a = express();
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/documents', ctrl.list);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

describe('GET /documents (통합 문서 허브)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const t of ['taskAttachment', 'boardCardAttachment', 'bbsAttachment', 'approvalAttachment', 'internalMailAttachment']) {
      prisma[t].findMany.mockResolvedValue([]);
    }
  });

  test('여러 도메인 첨부를 최신순 병합 + source별 카운트', async () => {
    prisma.taskAttachment.findMany.mockResolvedValue([
      { id: 1, originalName: '기획서.pdf', mimeType: 'application/pdf', size: 100, createdAt: new Date('2026-01-01'), uploadedBy: 5, taskId: 3, task: { title: '기획' }, uploader: { displayName: '홍길동' } },
    ]);
    prisma.bbsAttachment.findMany.mockResolvedValue([
      { id: 2, originalName: '공지.docx', mimeType: 'application/msword', size: 200, createdAt: new Date('2026-02-01'), uploadedBy: 5, postId: 7, post: { title: '공지글' }, uploader: { displayName: '김철수' } },
    ]);
    const res = await request(app()).get('/documents');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    // 최신순: 게시판(2월)이 먼저
    expect(res.body.items[0].source).toBe('bbs');
    expect(res.body.items[0].contextPath).toBe('/bbs?postId=7');
    expect(res.body.counts).toMatchObject({ task: 1, bbs: 1 });
  });

  test('q 필터 → originalName contains where 전달', async () => {
    await request(app()).get('/documents?q=계약');
    const taskWhere = prisma.taskAttachment.findMany.mock.calls[0][0].where;
    expect(taskWhere.originalName).toEqual({ contains: '계약', mode: 'insensitive' });
  });

  test('source=mail 이면 메일만 조회', async () => {
    await request(app()).get('/documents?source=mail');
    expect(prisma.internalMailAttachment.findMany).toHaveBeenCalled();
    expect(prisma.taskAttachment.findMany).not.toHaveBeenCalled();
  });

  test('메일은 관리자도 발신/수신자 제한(where에 fromUserId/recipients)', async () => {
    await request(app('admin', 1)).get('/documents?source=mail');
    const mailWhere = prisma.internalMailAttachment.findMany.mock.calls[0][0].where;
    expect(mailWhere.mail.OR).toEqual([{ fromUserId: 1 }, { recipients: { some: { userId: 1 } } }]);
  });

  test('비관리자 게시판 첨부는 기밀 게이트 where 적용', async () => {
    await request(app('member', 5)).get('/documents?source=bbs');
    const bbsWhere = prisma.bbsAttachment.findMany.mock.calls[0][0].where;
    expect(bbsWhere.post.OR).toBeDefined();
  });

  test('관리자 결재 첨부는 참여자 제한 없음', async () => {
    await request(app('admin', 1)).get('/documents?source=approval');
    const apWhere = prisma.approvalAttachment.findMany.mock.calls[0][0].where;
    expect(apWhere.document.OR).toBeUndefined();
  });
});
