/**
 * 민감도 라벨(F-67) 접근 게이트 테스트 — 위키 문서 / 게시글 (mock prisma)
 * 기밀(confidential)은 작성자·관리자만 열람.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    wikiDoc: { findFirst: jest.fn() },
    wikiSpace: {},
    bbsPost: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const wiki = require('../src/controllers/wikiController');
const bbs = require('../src/controllers/bbsPostController');

function mkApp(handler, role = 'member', uid = 5) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/x/:id', handler);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

// 공개 스페이스 + 기밀 문서
const confidentialDoc = { id: 1, delYn: '0', sensitivity: 'confidential', createdBy: 9, space: { visibility: 'public', createdBy: 9 }, creator: {} };

describe('위키 getDoc 기밀 게이트', () => {
  beforeEach(() => jest.clearAllMocks());

  test('기밀 문서 + 비작성자 멤버 → 403', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue(confidentialDoc);
    const res = await request(mkApp(wiki.getDoc, 'member', 5)).get('/x/1');
    expect(res.status).toBe(403);
  });

  test('기밀 문서 + 작성자 → 200', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue({ ...confidentialDoc, createdBy: 5 });
    const res = await request(mkApp(wiki.getDoc, 'member', 5)).get('/x/1');
    expect(res.status).toBe(200);
  });

  test('기밀 문서 + 관리자 → 200', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue(confidentialDoc);
    const res = await request(mkApp(wiki.getDoc, 'admin', 1)).get('/x/1');
    expect(res.status).toBe(200);
  });

  test('공개 문서는 누구나 → 200', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue({ ...confidentialDoc, sensitivity: 'public' });
    const res = await request(mkApp(wiki.getDoc, 'member', 5)).get('/x/1');
    expect(res.status).toBe(200);
  });
});

describe('게시글 get 기밀 게이트', () => {
  beforeEach(() => jest.clearAllMocks());

  test('기밀 게시글 + 비작성자 → 403 (조회수 증가 안 함)', async () => {
    prisma.bbsPost.findFirst.mockResolvedValue({ id: 1, delYn: '0', sensitivity: 'confidential', createdBy: 9, viewCount: 3 });
    const res = await request(mkApp(bbs.get, 'member', 5)).get('/x/1');
    expect(res.status).toBe(403);
    expect(prisma.bbsPost.update).not.toHaveBeenCalled();
  });

  test('기밀 게시글 + 작성자 → 200 (조회수 증가)', async () => {
    prisma.bbsPost.findFirst.mockResolvedValue({ id: 1, delYn: '0', sensitivity: 'confidential', createdBy: 5, viewCount: 3 });
    const res = await request(mkApp(bbs.get, 'member', 5)).get('/x/1');
    expect(res.status).toBe(200);
    expect(prisma.bbsPost.update).toHaveBeenCalled();
  });
});

describe('게시글 목록 기밀 필터', () => {
  beforeEach(() => jest.clearAllMocks());

  test('비관리자 목록은 기밀 제외 where(OR) 적용', async () => {
    const app = express();
    app.use((req, res, next) => { req.user = { id: 5, role: 'member' }; next(); });
    app.get('/bbs', bbs.list);
    await request(app).get('/bbs');
    const whereArg = prisma.bbsPost.count.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined(); // 기밀 필터 OR 존재
  });

  test('관리자 목록은 기밀 필터 없음', async () => {
    const app = express();
    app.use((req, res, next) => { req.user = { id: 1, role: 'admin' }; next(); });
    app.get('/bbs', bbs.list);
    await request(app).get('/bbs');
    const whereArg = prisma.bbsPost.count.mock.calls[0][0].where;
    expect(whereArg.OR).toBeUndefined();
  });
});
