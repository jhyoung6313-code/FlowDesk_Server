/**
 * 회의 빈시간 찾기(Scheduling Assistant, F-65) 테스트
 *  - schedulingService: 순수 계산(구간 병합·가용 슬롯)
 *  - scheduleController.freeSlots: mock prisma
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    meeting: { findMany: jest.fn().mockResolvedValue([]) },
    scheduleEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const svc = require('../src/services/schedulingService');
const scheduleController = require('../src/controllers/scheduleController');

// ─────────── 순수 계산 ───────────
describe('schedulingService.mergeIntervals', () => {
  test('겹치는/닿는 구간 병합', () => {
    const merged = svc.mergeIntervals([{ start: 540, end: 600 }, { start: 600, end: 660 }, { start: 800, end: 850 }]);
    expect(merged).toEqual([{ start: 540, end: 660 }, { start: 800, end: 850 }]);
  });
  test('순서 무관 정렬', () => {
    const merged = svc.mergeIntervals([{ start: 800, end: 850 }, { start: 540, end: 600 }]);
    expect(merged[0].start).toBe(540);
  });
});

describe('schedulingService.freeSlotsForDay', () => {
  test('바쁜 일정 없음 → 근무시간 전체에서 슬롯 생성', () => {
    const slots = svc.freeSlotsForDay({ workStart: 540, workEnd: 660, busy: [], durationMin: 60, stepMin: 60 });
    // 09:00~11:00, 60분 슬롯: 09:00, 10:00
    expect(slots).toEqual([{ startMin: 540, endMin: 600 }, { startMin: 600, endMin: 660 }]);
  });

  test('회의로 막힌 구간은 제외', () => {
    // 09:00~12:00 근무, 10:00~11:00 회의, 60분 슬롯 30분 간격
    const slots = svc.freeSlotsForDay({ workStart: 540, workEnd: 720, busy: [{ start: 600, end: 660 }], durationMin: 60, stepMin: 30 });
    const starts = slots.map((s) => svc.toHHMM(s.startMin));
    expect(starts).toContain('09:00');
    expect(starts).toContain('11:00');
    expect(starts).not.toContain('10:00'); // 회의 시간과 겹침
    expect(starts).not.toContain('10:30');
  });

  test('가용 구간이 duration보다 짧으면 슬롯 없음', () => {
    const slots = svc.freeSlotsForDay({ workStart: 540, workEnd: 570, busy: [], durationMin: 60, stepMin: 30 });
    expect(slots).toEqual([]);
  });
});

// ─────────── 컨트롤러 ───────────
function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: 1, role: 'member' }; next(); });
  a.post('/schedules/free-slots', scheduleController.freeSlots);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

describe('POST /schedules/free-slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.meeting.findMany.mockResolvedValue([]);
    prisma.scheduleEvent.findMany.mockResolvedValue([]);
  });

  test('참석자 없음 → 400', async () => {
    const res = await request(app()).post('/schedules/free-slots').send({ attendeeIds: [] });
    expect(res.status).toBe(400);
  });

  test('일정 없는 하루 → 09~18시 슬롯 반환', async () => {
    const res = await request(app()).post('/schedules/free-slots')
      .send({ attendeeIds: [1, 2], from: '2026-08-03', durationMin: 60, stepMin: 60 });
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].slots.length).toBeGreaterThan(0);
    expect(res.body.days[0].slots[0].start).toBe('09:00');
  });

  test('참석자 회의가 있는 시간대는 슬롯에서 제외', async () => {
    // 2026-08-03 10:00~11:00 회의 (로컬)
    const s = new Date('2026-08-03T10:00:00'); const e = new Date('2026-08-03T11:00:00');
    prisma.meeting.findMany.mockResolvedValue([{ startAt: s, endAt: e }]);
    const res = await request(app()).post('/schedules/free-slots')
      .send({ attendeeIds: [1], from: '2026-08-03', durationMin: 60, stepMin: 60 });
    const starts = res.body.days[0].slots.map((x) => x.start);
    expect(starts).not.toContain('10:00');
    expect(starts).toContain('09:00');
  });
});
