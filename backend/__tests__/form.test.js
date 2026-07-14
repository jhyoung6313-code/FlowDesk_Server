/**
 * Forms(설문) 엔진(F-66) 테스트 — formController (mock prisma)
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    form: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    formField: { deleteMany: jest.fn().mockResolvedValue({}) },
    formResponse: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/formController');

function app(role = 'member', uid = 5) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.get('/forms', ctrl.list);
  a.post('/forms', ctrl.create);
  a.put('/forms/:id', ctrl.update);
  a.patch('/forms/:id/status', ctrl.setStatus);
  a.post('/forms/:id/responses', ctrl.submit);
  a.get('/forms/:id/results', ctrl.results);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

describe('POST /forms (설문 생성)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('제목 누락 → 400', async () => {
    const res = await request(app()).post('/forms').send({ fields: [] });
    expect(res.status).toBe(400);
  });

  test('정상 생성 → 201, 선택형 옵션 JSON 저장', async () => {
    prisma.form.create.mockResolvedValue({
      id: 1, title: '만족도', createdBy: 5,
      fields: [{ id: 1, type: 'single', label: '만족?', options: '["예","아니오"]', required: true, order: 0 }],
    });
    const res = await request(app()).post('/forms').send({
      title: '만족도',
      fields: [{ type: 'single', label: '만족?', required: true, options: ['예', '아니오'] }],
    });
    expect(res.status).toBe(201);
    const createArg = prisma.form.create.mock.calls[0][0].data;
    expect(createArg.fields.create[0].type).toBe('single');
    expect(typeof createArg.fields.create[0].options).toBe('string'); // JSON 직렬화
    expect(res.body.fields[0].options).toEqual(['예', '아니오']); // 응답은 파싱
  });
});

describe('PATCH /forms/:id/status', () => {
  beforeEach(() => jest.clearAllMocks());

  test('유효하지 않은 상태 → 400', async () => {
    const res = await request(app()).patch('/forms/1/status').send({ status: 'bogus' });
    expect(res.status).toBe(400);
  });

  test('작성자 아님(멤버) → 403', async () => {
    prisma.form.findUnique.mockResolvedValue({ id: 1, createdBy: 99, delYn: '0' });
    const res = await request(app('member', 5)).patch('/forms/1/status').send({ status: 'open' });
    expect(res.status).toBe(403);
  });

  test('작성자 → 200 개시', async () => {
    prisma.form.findUnique.mockResolvedValue({ id: 1, createdBy: 5, delYn: '0' });
    prisma.form.update.mockResolvedValue({ id: 1, status: 'open' });
    const res = await request(app('member', 5)).patch('/forms/1/status').send({ status: 'open' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
  });
});

describe('POST /forms/:id/responses (응답 제출)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('마감 설문 → 409', async () => {
    prisma.form.findUnique.mockResolvedValue({ id: 1, status: 'closed', delYn: '0', anonymous: false, multiResponse: false, fields: [] });
    const res = await request(app()).post('/forms/1/responses').send({ answers: [] });
    expect(res.status).toBe(409);
  });

  test('필수 문항 누락 → 400', async () => {
    prisma.form.findUnique.mockResolvedValue({
      id: 1, status: 'open', delYn: '0', anonymous: true, multiResponse: true,
      fields: [{ id: 10, label: '이름', required: true, type: 'text' }],
    });
    const res = await request(app()).post('/forms/1/responses').send({ answers: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/필수/);
  });

  test('비익명·단일응답 중복 → 409', async () => {
    prisma.form.findUnique.mockResolvedValue({ id: 1, status: 'open', delYn: '0', anonymous: false, multiResponse: false, fields: [] });
    prisma.formResponse.findFirst.mockResolvedValue({ id: 7 });
    const res = await request(app('member', 5)).post('/forms/1/responses').send({ answers: [] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/이미 응답/);
  });

  test('정상 제출 → 201, 다중선택 값 JSON 저장', async () => {
    prisma.form.findUnique.mockResolvedValue({
      id: 1, status: 'open', delYn: '0', anonymous: true, multiResponse: true,
      fields: [{ id: 10, label: '관심분야', required: false, type: 'multiple' }],
    });
    const res = await request(app()).post('/forms/1/responses').send({ answers: [{ fieldId: 10, value: ['A', 'B'] }] });
    expect(res.status).toBe(201);
    const createArg = prisma.formResponse.create.mock.calls[0][0].data;
    expect(createArg.respondentId).toBeNull(); // 익명
    expect(createArg.answers.create[0].value).toBe('["A","B"]');
  });
});

describe('GET /forms/:id/results (집계)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('작성자 아님 → 403', async () => {
    prisma.form.findUnique.mockResolvedValue({ id: 1, createdBy: 99, delYn: '0', fields: [] });
    const res = await request(app('member', 5)).get('/forms/1/results');
    expect(res.status).toBe(403);
  });

  test('선택형 집계 카운트', async () => {
    prisma.form.findUnique.mockResolvedValue({
      id: 1, createdBy: 5, delYn: '0', title: '설문',
      fields: [{ id: 10, label: '만족?', type: 'single', options: '["예","아니오"]' }],
    });
    prisma.formResponse.findMany.mockResolvedValue([
      { id: 1, answers: [{ fieldId: 10, value: '예' }] },
      { id: 2, answers: [{ fieldId: 10, value: '예' }] },
      { id: 3, answers: [{ fieldId: 10, value: '아니오' }] },
    ]);
    const res = await request(app('admin', 1)).get('/forms/1/results');
    expect(res.status).toBe(200);
    expect(res.body.responseCount).toBe(3);
    expect(res.body.summary[0].counts).toEqual({ 예: 2, 아니오: 1 });
  });
});
