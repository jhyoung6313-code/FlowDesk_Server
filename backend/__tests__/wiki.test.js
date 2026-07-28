/**
 * wikiController (F-59 위키 + F-67 민감도) 테스트
 * 기밀 문서 열람 게이트, 스페이스 접근 필터, 본문 변경 시 버전 스냅샷.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    wikiSpace: { findMany: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    wikiDoc: { findFirst: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    wikiDocVersion: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    wikiDocComment: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/wikiController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/wiki/spaces', ctrl.listSpaces);
  a.get('/wiki/docs/:id', ctrl.getDoc);
  a.patch('/wiki/docs/:id', ctrl.updateDoc);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('listSpaces — 접근/기밀 필터', () => {
  test('private 스페이스는 작성자·admin만, 기밀 문서는 트리에서 제외', async () => {
    prisma.wikiSpace.findMany.mockResolvedValue([
      { id: 1, visibility: 'public', createdBy: 99, docs: [
        { id: 10, sensitivity: 'public', createdBy: 99 },
        { id: 11, sensitivity: 'confidential', createdBy: 99 }, // 타인 기밀 → 제외
        { id: 12, sensitivity: 'confidential', createdBy: 10 }, // 본인 기밀 → 포함
      ] },
      { id: 2, visibility: 'private', createdBy: 99, docs: [] }, // 타인 private → 제외
    ]);
    const res = await request(app('member', 10)).get('/wiki/spaces');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1); // private 스페이스 제외
    const docIds = res.body[0].docs.map((d) => d.id);
    expect(docIds).toEqual([10, 12]);
  });
});

describe('getDoc — 기밀 게이트', () => {
  test('public 스페이스의 타인 기밀 문서, member → 403', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue({
      id: 5, sensitivity: 'confidential', createdBy: 99, content: 'x',
      space: { visibility: 'public', createdBy: 1 },
    });
    const res = await request(app('member', 10)).get('/wiki/docs/5');
    expect(res.status).toBe(403);
  });
  test('작성자 본인 기밀 문서 → 200', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue({
      id: 5, sensitivity: 'confidential', createdBy: 10, content: 'x',
      space: { visibility: 'public', createdBy: 1 },
    });
    const res = await request(app('member', 10)).get('/wiki/docs/5');
    expect(res.status).toBe(200);
  });
});

describe('updateDoc — 버전 스냅샷', () => {
  test('본문 변경 시 직전 내용을 버전으로 저장', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue({
      id: 5, title: '문서', content: '이전 내용', sensitivity: 'public', createdBy: 10,
      space: { visibility: 'public', createdBy: 1 },
    });
    prisma.wikiDoc.update.mockResolvedValue({ id: 5, content: '새 내용' });
    const res = await request(app('member', 10)).patch('/wiki/docs/5').send({ content: '새 내용' });
    expect(res.status).toBe(200);
    expect(prisma.wikiDocVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: '이전 내용' }),
    }));
  });

  test('본문 동일하면 버전 스냅샷 생성 안 함', async () => {
    prisma.wikiDoc.findFirst.mockResolvedValue({
      id: 5, title: '문서', content: '같은 내용', sensitivity: 'public', createdBy: 10,
      space: { visibility: 'public', createdBy: 1 },
    });
    prisma.wikiDoc.update.mockResolvedValue({ id: 5 });
    await request(app('member', 10)).patch('/wiki/docs/5').send({ content: '같은 내용' });
    expect(prisma.wikiDocVersion.create).not.toHaveBeenCalled();
  });
});
