/**
 * 개인정보 입력 차단 (F-56) 심층 테스트
 * detectPii 패턴 정확도(탐지/오탐 방지), scan 재귀 순회, piiGuard 미들웨어 400 차단.
 */
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/piiBlockService', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const request = require('supertest');
const express = require('express');
const { detectPii } = require('../src/utils/piiPatterns');
const { piiGuard, scan } = require('../src/middlewares/piiGuard');
const piiBlock = require('../src/services/piiBlockService');

describe('detectPii — 탐지', () => {
  test('주민등록번호', () => {
    expect(detectPii('제 번호는 900101-1234567 입니다')?.type).toBe('주민등록번호');
    expect(detectPii('9001011234567')?.type).toBe('주민등록번호'); // 구분자 없이도
  });
  test('신용카드번호', () => {
    expect(detectPii('4123-5678-9012-3456')?.type).toBe('신용카드번호');
  });
  test('연락처(010)', () => {
    expect(detectPii('연락처 010-1234-5678')?.type).toBe('연락처');
    expect(detectPii('01012345678')?.type).toBe('연락처');
  });
  test('계좌번호(10자리 이상 + 구분자)', () => {
    expect(detectPii('국민 123-4567-89012')?.type).toBe('계좌번호');
  });
});

describe('detectPii — 오탐 방지', () => {
  test('일반 날짜(YYYY-MM-DD)는 계좌로 오탐하지 않음', () => {
    expect(detectPii('회의일 2026-07-28')).toBeNull();
  });
  test('짧은 숫자/문자는 무시', () => {
    expect(detectPii('123')).toBeNull();
    expect(detectPii('안녕하세요 반갑습니다')).toBeNull();
  });
  test('이메일은 허용(업무상 필요)', () => {
    expect(detectPii('user@example.com 으로 연락주세요')).toBeNull();
  });
  test('02 지역번호 전화는 정책상 미차단(010만)', () => {
    expect(detectPii('02-123-4567')).toBeNull();
  });
});

describe('scan — 재귀 순회', () => {
  test('중첩 객체/배열에서 PII 탐지 + 경로 반환', () => {
    const hit = scan({ user: { memos: ['정상', '내 폰 010-9999-8888'] } }, '');
    expect(hit.type).toBe('연락처');
    expect(hit.path).toBe('user.memos[1]');
  });
  test('PII 없으면 null', () => {
    expect(scan({ a: '평범한 텍스트', b: [1, 2, 3] }, '')).toBeNull();
  });
});

describe('piiGuard 미들웨어', () => {
  function app() {
    const a = express();
    a.use(express.json());
    a.use(piiGuard);
    a.post('/x', (req, res) => res.json({ ok: true }));
    a.get('/x', (req, res) => res.json({ ok: true }));
    return a;
  }
  beforeEach(() => jest.clearAllMocks());

  test('쓰기 요청에 PII 포함 → 400 PII_BLOCKED + 기록', async () => {
    const res = await request(app()).post('/x').send({ content: '주민번호 900101-1234567' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PII_BLOCKED');
    expect(piiBlock.record).toHaveBeenCalled();
  });
  test('정상 본문 → 통과', async () => {
    const res = await request(app()).post('/x').send({ content: '정상 업무 내용' });
    expect(res.status).toBe(200);
  });
  test('GET 요청은 스캔하지 않음', async () => {
    const res = await request(app()).get('/x');
    expect(res.status).toBe(200);
  });
  test('로그인 경로는 스캔 제외', async () => {
    const a = express();
    a.use(express.json());
    a.use(piiGuard);
    a.post('/api/auth/login', (req, res) => res.json({ ok: true }));
    const res = await request(a).post('/api/auth/login').send({ password: '010-1234-5678' });
    expect(res.status).toBe(200);
  });
});
