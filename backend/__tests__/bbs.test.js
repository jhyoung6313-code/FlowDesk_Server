/**
 * bbsPostController 단위 테스트 (F-53 게시판 + F-67 민감도 게이트)
 * 기밀 게시글 열람 게이트, 목록 민감도 필터, writeRole, 권한을 검증.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    bbsPost: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    bbsCategory: { findUnique: jest.fn() },
    bbsComment: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    bbsAttachment: { findUnique: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/bbsPostController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/bbs', ctrl.list);
  a.get('/bbs/:id', ctrl.get);
  a.post('/bbs', ctrl.create);
  a.put('/bbs/:id', ctrl.update);
  a.get('/bbs/:id/attachments/:aid/download', ctrl.downloadAttachment);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /bbs (목록 민감도 필터)', () => {
  test('비관리자는 기밀 제외/본인 것만 노출 where 적용', async () => {
    prisma.bbsPost.count.mockResolvedValue(0);
    prisma.bbsPost.findMany.mockResolvedValue([]);
    await request(app('member', 10)).get('/bbs');
    const where = prisma.bbsPost.count.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ NOT: { sensitivity: 'confidential' } }, { createdBy: 10 }]);
  });

  test('관리자는 민감도 필터 없음', async () => {
    prisma.bbsPost.count.mockResolvedValue(0);
    prisma.bbsPost.findMany.mockResolvedValue([]);
    await request(app('admin', 1)).get('/bbs');
    const where = prisma.bbsPost.count.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });
});

describe('GET /bbs/:id (기밀 열람 게이트)', () => {
  test('기밀 게시글, 타인 member → 403', async () => {
    prisma.bbsPost.findFirst.mockResolvedValue({ id: 1, sensitivity: 'confidential', createdBy: 99, viewCount: 0 });
    const res = await request(app('member', 10)).get('/bbs/1');
    expect(res.status).toBe(403);
  });

  test('기밀 게시글, 작성자 본인 → 200 + 조회수 증가', async () => {
    prisma.bbsPost.findFirst.mockResolvedValue({ id: 1, sensitivity: 'confidential', createdBy: 10, viewCount: 5 });
    prisma.bbsPost.update.mockResolvedValue({});
    const res = await request(app('member', 10)).get('/bbs/1');
    expect(res.status).toBe(200);
    expect(res.body.viewCount).toBe(6);
    expect(prisma.bbsPost.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { viewCount: { increment: 1 } } });
  });

  test('기밀 게시글, 관리자 → 200', async () => {
    prisma.bbsPost.findFirst.mockResolvedValue({ id: 1, sensitivity: 'confidential', createdBy: 99, viewCount: 0 });
    prisma.bbsPost.update.mockResolvedValue({});
    const res = await request(app('admin', 1)).get('/bbs/1');
    expect(res.status).toBe(200);
  });
});

describe('POST /bbs (writeRole)', () => {
  test('필수값 누락 → 400', async () => {
    const res = await request(app()).post('/bbs').send({ title: '제목만' });
    expect(res.status).toBe(400);
  });

  test('admin 전용 게시판에 member 작성 → 403', async () => {
    prisma.bbsCategory.findUnique.mockResolvedValue({ id: 1, writeRole: 'admin' });
    const res = await request(app('member', 10)).post('/bbs').send({ categoryId: 1, title: '공지', content: '내용' });
    expect(res.status).toBe(403);
  });

  test('잘못된 sensitivity 값은 public으로 강제', async () => {
    prisma.bbsCategory.findUnique.mockResolvedValue({ id: 1, writeRole: 'all' });
    prisma.bbsPost.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    const res = await request(app('member', 10)).post('/bbs').send({ categoryId: 1, title: '글', content: '내용', sensitivity: 'topsecret' });
    expect(res.status).toBe(201);
    expect(prisma.bbsPost.create.mock.calls[0][0].data.sensitivity).toBe('public');
  });
});

describe('PUT /bbs/:id (수정 권한)', () => {
  test('타인 글 수정 → 403', async () => {
    prisma.bbsPost.findFirst.mockResolvedValue({ id: 1, createdBy: 99 });
    const res = await request(app('member', 10)).put('/bbs/1').send({ title: '변경' });
    expect(res.status).toBe(403);
  });
});

describe('첨부 다운로드 기밀 게이트 (P1 회귀)', () => {
  test('기밀 게시글 첨부, 타인 member → 403 (파일 접근 전 차단)', async () => {
    prisma.bbsAttachment.findUnique.mockResolvedValue({
      id: 3, storedName: 'x.pdf', originalName: '기밀.pdf', mimeType: 'application/pdf',
      post: { sensitivity: 'confidential', createdBy: 99, delYn: '0' },
    });
    const res = await request(app('member', 10)).get('/bbs/1/attachments/3/download');
    expect(res.status).toBe(403);
  });

  test('작성자 본인은 게이트 통과 (파일 없으면 404 파일-미존재)', async () => {
    prisma.bbsAttachment.findUnique.mockResolvedValue({
      id: 3, storedName: 'missing.pdf', originalName: '기밀.pdf', mimeType: 'application/pdf',
      post: { sensitivity: 'confidential', createdBy: 10, delYn: '0' },
    });
    const res = await request(app('member', 10)).get('/bbs/1/attachments/3/download');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/서버에 존재하지 않/);
  });
});
