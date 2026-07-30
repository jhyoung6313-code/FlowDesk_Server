/**
 * searchController (통합검색) 테스트 — 게시판 기밀 게이트(F-67)·결재 참여자 제한.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const empty = { findMany: jest.fn().mockResolvedValue([]) };
  const m = {
    task: { findMany: jest.fn().mockResolvedValue([]) },
    memo: { findMany: jest.fn().mockResolvedValue([]) },
    boardCard: { findMany: jest.fn().mockResolvedValue([]) },
    playbook: { findMany: jest.fn().mockResolvedValue([]) },
    wbsProject: { findMany: jest.fn().mockResolvedValue([]) },
    chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
    bbsPost: { findMany: jest.fn().mockResolvedValue([]) },
    approvalDocument: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { search } = require('../src/controllers/searchController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/search', search);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /search — 게시판 기밀 게이트', () => {
  test('비관리자: bbs 검색 where에 기밀 제외 조건(AND) 포함', async () => {
    await request(app('member', 10)).get('/search?q=계약');
    const where = prisma.bbsPost.findMany.mock.calls[0][0].where;
    // AND 배열 안에 sensitivity 게이트가 있어야 함
    const hasGate = where.AND.some((c) => JSON.stringify(c).includes('confidential'));
    expect(hasGate).toBe(true);
  });

  test('관리자: bbs 검색에 기밀 게이트 없음', async () => {
    await request(app('admin', 1)).get('/search?q=계약');
    const where = prisma.bbsPost.findMany.mock.calls[0][0].where;
    const hasGate = where.AND.some((c) => JSON.stringify(c).includes('confidential'));
    expect(hasGate).toBe(false);
  });

  test('결재 검색: 비관리자는 본인 기안/결재자만', async () => {
    await request(app('member', 10)).get('/search?q=휴가');
    const where = prisma.approvalDocument.findMany.mock.calls[0][0].where;
    const json = JSON.stringify(where.AND);
    expect(json).toContain('approverId');
    expect(json).toContain('createdBy');
  });

  test('빈 검색어 → 빈 그룹', async () => {
    const res = await request(app()).get('/search?q=');
    expect(res.body.groups).toEqual([]);
    expect(prisma.bbsPost.findMany).not.toHaveBeenCalled();
  });
});
