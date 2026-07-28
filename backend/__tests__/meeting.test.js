/**
 * meetingController 단위 테스트 (F-61)
 * 회의 생성(주최자 자동 참석), RSVP, 권한, 액션아이템→업무 전환을 검증.
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    meeting: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    meetingAttendee: { findFirst: jest.fn(), update: jest.fn() },
    meetingActionItem: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    task: { create: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../src/services/aiService', () => ({ isConfigured: () => false, summarizeMeeting: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ record: jest.fn(), getClientIp: () => '127.0.0.1' }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ctrl = require('../src/controllers/meetingController');

function app(role = 'member', uid = 10) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: uid, role }; next(); });
  a.post('/meetings', ctrl.create);
  a.post('/meetings/:id/rsvp', ctrl.rsvp);
  a.post('/meetings/:id/action-items', ctrl.addActionItem);
  a.post('/meetings/:id/action-items/:aid/to-task', ctrl.actionItemToTask);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /meetings (생성)', () => {
  test('제목 없음 → 400', async () => {
    const res = await request(app()).post('/meetings').send({ startAt: '2026-08-01T10:00:00Z' });
    expect(res.status).toBe(400);
  });
  test('시작일시 없음 → 400', async () => {
    const res = await request(app()).post('/meetings').send({ title: '주간회의' });
    expect(res.status).toBe(400);
  });
  test('주최자 자동 참석(accepted) + 초대자 중복 제거', async () => {
    prisma.meeting.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    const res = await request(app('member', 10)).post('/meetings').send({
      title: '주간회의', startAt: '2026-08-01T10:00:00Z', attendeeUserIds: [10, 20, 20],
    });
    expect(res.status).toBe(201);
    const created = prisma.meeting.create.mock.calls[0][0].data.attendees.create;
    const userRows = created.filter((r) => r.userId);
    expect(userRows.map((r) => r.userId).sort()).toEqual([10, 20]); // 중복 제거
    const organizer = userRows.find((r) => r.userId === 10);
    expect(organizer.role).toBe('organizer');
    expect(organizer.rsvp).toBe('accepted');
  });
});

describe('POST /meetings/:id/rsvp', () => {
  test('유효하지 않은 응답 → 400', async () => {
    const res = await request(app()).post('/meetings/1/rsvp').send({ rsvp: 'maybe' });
    expect(res.status).toBe(400);
  });
  test('참석자가 아니면 → 404', async () => {
    prisma.meetingAttendee.findFirst.mockResolvedValue(null);
    const res = await request(app()).post('/meetings/1/rsvp').send({ rsvp: 'accepted' });
    expect(res.status).toBe(404);
  });
  test('정상 응답 → 200', async () => {
    prisma.meetingAttendee.findFirst.mockResolvedValue({ id: 5 });
    prisma.meetingAttendee.update.mockResolvedValue({});
    const res = await request(app()).post('/meetings/1/rsvp').send({ rsvp: 'declined' });
    expect(res.status).toBe(200);
  });
});

describe('액션아이템 권한 및 업무 전환', () => {
  test('주최자/관리자 아님 → 403', async () => {
    prisma.meeting.findFirst.mockResolvedValue({ id: 1, organizerId: 99 });
    const res = await request(app('member', 10)).post('/meetings/1/action-items').send({ content: '할일' });
    expect(res.status).toBe(403);
  });

  test('이미 업무로 전환된 액션아이템 → 400', async () => {
    prisma.meeting.findFirst.mockResolvedValue({ id: 1, organizerId: 10, title: '회의' });
    prisma.meetingActionItem.findFirst.mockResolvedValue({ id: 7, taskId: 55 });
    const res = await request(app('member', 10)).post('/meetings/1/action-items/7/to-task').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/이미 업무/);
  });

  test('전환 → task 생성 + 액션아이템에 taskId 연결', async () => {
    prisma.meeting.findFirst.mockResolvedValue({ id: 1, organizerId: 10, title: '회의' });
    prisma.meetingActionItem.findFirst.mockResolvedValue({ id: 7, taskId: null, content: '보고서 작성', assigneeId: 20, dueDate: null });
    prisma.task.create.mockResolvedValue({ id: 88 });
    prisma.meetingActionItem.update.mockResolvedValue({});
    const res = await request(app('member', 10)).post('/meetings/1/action-items/7/to-task').send({});
    expect(res.status).toBe(200);
    expect(res.body.taskId).toBe(88);
    expect(prisma.meetingActionItem.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { taskId: 88 } });
    // 담당자가 task assignee로 연결
    expect(prisma.task.create.mock.calls[0][0].data.assignees.create.userId).toBe(20);
  });
});
