/**
 * 개인 "내 하루" 통합 홈(F-64) 테스트 — meController.today (mock prisma)
 */
const request = require('supertest');
const express = require('express');

jest.mock('@prisma/client', () => {
  const m = {
    task: { findMany: jest.fn() },
    meetingActionItem: { findMany: jest.fn() },
    approvalStep: { findMany: jest.fn() },
    meeting: { findMany: jest.fn() },
    notification: { count: jest.fn() },
    internalMailRecipient: { count: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const meController = require('../src/controllers/meController');

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { id: 1, role: 'member' }; next(); });
  a.get('/me/today', meController.today);
  a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return a;
}

const yesterday = new Date(Date.now() - 86400000);
const tomorrow = new Date(Date.now() + 86400000);

describe('GET /me/today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.task.findMany.mockResolvedValue([]);
    prisma.meetingActionItem.findMany.mockResolvedValue([]);
    prisma.approvalStep.findMany.mockResolvedValue([]);
    prisma.meeting.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    prisma.internalMailRecipient.count.mockResolvedValue(0);
  });

  test('빈 상태 → 모든 섹션 0', async () => {
    const res = await request(app()).get('/me/today');
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ tasks: 0, approvals: 0, meetings: 0, actionItems: 0 });
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('지연 업무 overdue 플래그 + overdueTasks 카운트', async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 1, title: '지연업무', status: 'in_progress', priority: 'high', dueDate: yesterday },
      { id: 2, title: '여유업무', status: 'pending', priority: 'normal', dueDate: tomorrow },
    ]);
    const res = await request(app()).get('/me/today');
    expect(res.body.tasks.find((t) => t.id === 1).overdue).toBe(true);
    expect(res.body.tasks.find((t) => t.id === 2).overdue).toBe(false);
    expect(res.body.counts.overdueTasks).toBe(1);
  });

  test('결재 대기: 현재 순번이 나인 문서만 포함', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([
      { stepOrder: 1, document: { id: 10, title: '휴가신청', docNo: 'DOC-1', currentStep: 1 } },   // 포함
      { stepOrder: 2, document: { id: 11, title: '지출결의', docNo: 'DOC-2', currentStep: 1 } },   // 제외(내 차례 아님)
    ]);
    const res = await request(app()).get('/me/today');
    expect(res.body.approvals).toHaveLength(1);
    expect(res.body.approvals[0].id).toBe(10);
    expect(res.body.counts.approvals).toBe(1);
  });

  test('액션아이템·회의·미확인 카운트 집계', async () => {
    prisma.meetingActionItem.findMany.mockResolvedValue([
      { id: 5, content: '보고서 작성', dueDate: yesterday, taskId: null, meetingId: 3, meeting: { title: '주간회의' } },
    ]);
    prisma.meeting.findMany.mockResolvedValue([{ id: 3, title: '주간회의', startAt: new Date(), endAt: null, location: '회의실' }]);
    prisma.notification.count.mockResolvedValue(4);
    prisma.internalMailRecipient.count.mockResolvedValue(2);
    const res = await request(app()).get('/me/today');
    expect(res.body.actionItems[0]).toMatchObject({ id: 5, meetingTitle: '주간회의', overdue: true });
    expect(res.body.counts).toMatchObject({ meetings: 1, actionItems: 1, unreadNotifications: 4, unreadMail: 2 });
  });
});
