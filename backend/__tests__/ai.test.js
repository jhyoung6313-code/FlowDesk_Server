/**
 * AI 어시스턴트 RAG 질의응답 + 채팅 요약(F-63) 테스트
 *  - ragService: 키워드 추출(순수) + 컨텍스트 수집(mock prisma)
 *  - aiController: ask / chatSummary (aiService·ragService·audit mock)
 */

const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    task: { findMany: jest.fn().mockResolvedValue([]) },
    memo: { findMany: jest.fn().mockResolvedValue([]) },
    boardCard: { findMany: jest.fn().mockResolvedValue([]) },
    wikiDoc: { findMany: jest.fn().mockResolvedValue([]) },
    meeting: { findMany: jest.fn().mockResolvedValue([]) },
    bbsPost: { findMany: jest.fn().mockResolvedValue([]) },
    chatRoomMember: { findFirst: jest.fn() },
    chatRoom: { findUnique: jest.fn() },
    chatMessage: { findMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

// aiService·auditService는 외부호출/부작용 → mock
jest.mock('../src/services/aiService', () => ({
  isConfigured: jest.fn(() => true),
  answerFromContext: jest.fn().mockResolvedValue('배포는 완료되었습니다[1].'),
  summarizeChat: jest.fn().mockResolvedValue('요약 결과'),
  MODEL: 'claude-opus-4-8',
}));
jest.mock('../src/services/auditService', () => ({ record: jest.fn().mockResolvedValue() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ai = require('../src/services/aiService');
const rag = require('../src/services/ragService');
const aiController = require('../src/controllers/aiController');

// ───────────────────── ragService (순수/수집) ─────────────────────
describe('ragService.extractKeywords', () => {
  test('불용어·짧은 영단어 제거, 한글 키워드 유지', () => {
    const kws = rag.extractKeywords('배포 작업 상태 알려줘');
    expect(kws).toContain('배포');
    expect(kws).toContain('작업');
    expect(kws).not.toContain('알려줘'); // 불용어
  });
  test('최대 8개로 제한', () => {
    const kws = rag.extractKeywords('가1 나2 다3 라4 마5 바6 사7 아8 자9 차10');
    expect(kws.length).toBeLessThanOrEqual(8);
  });
});

describe('ragService.gatherContexts', () => {
  beforeEach(() => jest.clearAllMocks());

  test('키워드 없으면 빈 배열', async () => {
    const ctx = await rag.gatherContexts({ userId: 1, question: '?!.' });
    expect(ctx).toEqual([]);
  });

  test('업무·위키 결과를 컨텍스트로 변환', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 3, title: '배포 작업', description: '<p>운영 배포</p>', status: 'done' }]);
    prisma.wikiDoc.findMany.mockResolvedValue([{ id: 5, title: '배포 가이드', content: '<h1>절차</h1>' }]);
    const ctx = await rag.gatherContexts({ userId: 1, question: '배포 상태' });
    expect(ctx.length).toBeGreaterThanOrEqual(2);
    const task = ctx.find((c) => c.source === '업무');
    expect(task.title).toBe('배포 작업');
    expect(task.text).not.toMatch(/</); // HTML 제거 확인
    expect(ctx.some((c) => c.source === '위키')).toBe(true);
  });
});

// ───────────────────── aiController ─────────────────────
function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: 1, role: 'admin', displayName: '관리자' }; next(); });
  a.post('/ai/ask', aiController.ask);
  a.post('/ai/chat-summary', aiController.chatSummary);
  a.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return a;
}

describe('POST /ai/ask (RAG 질의응답)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('질문 누락 → 400', async () => {
    const res = await request(app()).post('/ai/ask').send({});
    expect(res.status).toBe(400);
  });

  test('AI 미설정 → 503', async () => {
    ai.isConfigured.mockReturnValueOnce(false);
    const res = await request(app()).post('/ai/ask').send({ question: '배포 상태?' });
    expect(res.status).toBe(503);
  });

  test('근거 없으면 안내 메시지 + 빈 sources', async () => {
    jest.spyOn(rag, 'gatherContexts').mockResolvedValueOnce([]);
    const res = await request(app()).post('/ai/ask').send({ question: '없는내용' });
    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual([]);
    expect(res.body.answer).toMatch(/찾지 못했습니다/);
  });

  test('근거 있으면 답변 + 번호 출처', async () => {
    jest.spyOn(rag, 'gatherContexts').mockResolvedValueOnce([
      { source: '업무', title: '배포 작업', path: '/tasks?taskId=3', text: '완료' },
    ]);
    const res = await request(app()).post('/ai/ask').send({ question: '배포 상태?' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/배포/);
    expect(res.body.sources[0]).toMatchObject({ n: 1, source: '업무', title: '배포 작업' });
    expect(ai.answerFromContext).toHaveBeenCalled();
  });
});

describe('POST /ai/chat-summary (채팅 요약)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('roomId 누락 → 400', async () => {
    const res = await request(app()).post('/ai/chat-summary').send({});
    expect(res.status).toBe(400);
  });

  test('방 멤버 아님 → 403', async () => {
    prisma.chatRoomMember.findFirst.mockResolvedValue(null);
    const res = await request(app()).post('/ai/chat-summary').send({ roomId: 7 });
    expect(res.status).toBe(403);
  });

  test('정상 → 요약 반환', async () => {
    prisma.chatRoomMember.findFirst.mockResolvedValue({ id: 1 });
    prisma.chatRoom.findUnique.mockResolvedValue({ name: '개발방' });
    prisma.chatMessage.findMany.mockResolvedValue([
      { content: '배포 언제?', sender: { displayName: '홍길동' } },
      { content: '오늘 저녁', sender: { displayName: '김철수' } },
    ]);
    const res = await request(app()).post('/ai/chat-summary').send({ roomId: 7 });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('요약 결과');
    expect(ai.summarizeChat).toHaveBeenCalled();
  });
});
