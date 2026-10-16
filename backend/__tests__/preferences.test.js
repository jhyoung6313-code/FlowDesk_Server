/**
 * 개인 설정 저장소(GET/PUT /settings/preferences) 테스트 — mock prisma
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getPreferences, updatePreferences } = require('../src/controllers/settingsController');

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: 7, role: 'member' }; next(); });
  a.get('/prefs', getPreferences);
  a.put('/prefs', updatePreferences);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
  prisma.$executeRaw.mockResolvedValue(0);
  prisma.appSetting.findUnique.mockResolvedValue(null);
  prisma.appSetting.upsert.mockResolvedValue({});
});

describe('GET /settings/preferences', () => {
  test('저장값 없으면 {}', async () => {
    const r = await request(app()).get('/prefs');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({});
    expect(prisma.appSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'user_prefs_7' } });
  });

  test('손상된 JSON·배열이면 {}', async () => {
    prisma.appSetting.findUnique.mockResolvedValueOnce({ value: '{bad' });
    expect((await request(app()).get('/prefs')).body).toEqual({});
    prisma.appSetting.findUnique.mockResolvedValueOnce({ value: '[1,2]' });
    expect((await request(app()).get('/prefs')).body).toEqual({});
  });
});

describe('PUT /settings/preferences', () => {
  test('최상위 키만 병합하고 기존 키는 보존, advisory lock 획득', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ a: 1, nav: { pinned: ['/'] } }) });
    const r = await request(app()).put('/prefs').send({ nav: { pinned: ['/tasks'] } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ a: 1, nav: { pinned: ['/tasks'] } });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(1);
  });

  test('null 값은 키 삭제', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ a: 1, b: 2 }) });
    const r = await request(app()).put('/prefs').send({ a: null });
    expect(r.body).toEqual({ b: 2 });
  });

  test('빈 요청은 쓰기 없이 현재값 반환', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ a: 1 }) });
    const r = await request(app()).put('/prefs').send({});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ a: 1 });
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  test.each(['__proto__', 'constructor', 'prototype', 'bad-key', 'a.b'])('금지 키 %s → 400', async (k) => {
    const r = await request(app()).put('/prefs').set('Content-Type', 'application/json').send(`{"${k}": 1}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBeTruthy();
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  test('배열 본문 → 400', async () => {
    expect((await request(app()).put('/prefs').send([1])).status).toBe(400);
  });

  test('중첩 깊이 초과 → 400', async () => {
    let deep = 1;
    for (let i = 0; i < 8; i++) deep = { x: deep };
    const r = await request(app()).put('/prefs').send({ k: deep });
    expect(r.status).toBe(400);
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  test('크기 초과 → 413 (저장 안 함)', async () => {
    const r = await request(app()).put('/prefs').send({ big: 'x'.repeat(33 * 1024) });
    expect(r.status).toBe(413);
    expect(r.body.error).toBeTruthy();
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  test('키 개수 초과 → 413', async () => {
    const cur = {};
    for (let i = 0; i < 30; i++) cur[`k${i}`] = 1;
    prisma.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify(cur) });
    const r = await request(app()).put('/prefs').send({ extra: 1 });
    expect(r.status).toBe(413);
  });

  test('DB 오류는 next(err) 로 전달', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    const r = await request(app()).put('/prefs').send({ a: 1 });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('db down');
  });

  test.each([
    [{ home: { layout: 'evil' } }, '알 수 없는 메인 화면'],
    [{ home: { layout: 'focus', scope: 'everyone' } }, '알 수 없는 업무 범위'],
    [{ home: 'focus' }, 'home 설정 형식'],
    [{ nav: { pinned: 'x' } }, 'nav 설정 형식'],
    [{ nav: { pinned: [1, 2] } }, 'nav 설정 형식'],
  ])('알려진 키의 잘못된 값 %j → 400', async (body, msg) => {
    const r = await request(app()).put('/prefs').send(body);
    expect(r.status).toBe(400);
    expect(r.body.error).toContain(msg);
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  test('올바른 home·nav 값은 저장, null 은 삭제', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ home: { layout: 'focus' } }) });
    const r = await request(app()).put('/prefs').send({ home: { layout: 'board', scope: 'mine' }, nav: { pinned: ['/', '/tasks'] } });
    expect(r.status).toBe(200);
    expect(r.body.home).toEqual({ layout: 'board', scope: 'mine' });
    const d = await request(app()).put('/prefs').send({ home: null });
    expect(d.status).toBe(200);
  });
});
