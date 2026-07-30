// 개인 "내 하루" 통합 홈(F-64) — 여러 도메인에 흩어진 내 할 일을 한 화면으로 집계.
// 순수 조회(additive), 기존 테이블만 사용. M365 To Do / My Day 대응.
const prisma = require('../lib/prisma');

const STATUS_LABEL = { pending: '대기', in_progress: '진행중', done: '완료', hold: '보류' };

// GET /api/me/today
const today = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

    const [tasks, actionRows, approvalStepRows, meetings, unreadNotif, unreadMail] = await Promise.all([
      // 내가 담당 또는 생성한 미완료 업무
      prisma.task.findMany({
        where: {
          delYn: '0',
          status: { in: ['pending', 'in_progress', 'hold'] },
          OR: [{ assignees: { some: { userId: uid } } }, { createdBy: uid }],
        },
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
        orderBy: [{ dueDate: 'asc' }],
        take: 30,
      }),
      // 내게 배정된 회의 액션아이템(미완료)
      prisma.meetingActionItem.findMany({
        where: { assigneeId: uid, status: 'open' },
        select: { id: true, content: true, dueDate: true, taskId: true, meetingId: true, meeting: { select: { title: true } } },
        orderBy: [{ dueDate: 'asc' }],
        take: 20,
      }),
      // 내 결재 대기(현재 결재 순번이 나인 상신 문서)
      prisma.approvalStep.findMany({
        where: { approverId: uid, status: 'pending', document: { status: 'pending', delYn: '0' } },
        select: { stepOrder: true, document: { select: { id: true, title: true, docNo: true, currentStep: true } } },
        take: 30,
      }),
      // 오늘 회의(주최자 또는 참석자)
      prisma.meeting.findMany({
        where: {
          delYn: '0',
          status: { not: 'cancelled' },
          startAt: { gte: dayStart, lt: dayEnd },
          OR: [{ organizerId: uid }, { attendees: { some: { userId: uid } } }],
        },
        select: { id: true, title: true, startAt: true, endAt: true, location: true },
        orderBy: { startAt: 'asc' },
      }),
      prisma.notification.count({ where: { userId: uid, isRead: false, delYn: '0' } }),
      prisma.internalMailRecipient.count({ where: { userId: uid, isRead: false, folder: 'inbox', deletedAt: null } }),
    ]);

    // 결재: 현재 순번이 나인 것만
    const approvals = approvalStepRows
      .filter((s) => s.document && s.stepOrder === s.document.currentStep)
      .map((s) => ({ id: s.document.id, title: s.document.title, docNo: s.document.docNo }));

    const isOverdue = (d) => d && new Date(d) < dayStart;
    const myTasks = tasks.map((t) => ({
      id: t.id, title: t.title, status: t.status, statusLabel: STATUS_LABEL[t.status],
      priority: t.priority, dueDate: t.dueDate, overdue: t.status !== 'done' && isOverdue(t.dueDate),
    }));

    res.json({
      date: dayStart.toISOString().slice(0, 10),
      tasks: myTasks,
      actionItems: actionRows.map((a) => ({
        id: a.id, content: a.content, dueDate: a.dueDate, taskId: a.taskId,
        meetingId: a.meetingId, meetingTitle: a.meeting?.title || '', overdue: isOverdue(a.dueDate),
      })),
      approvals,
      meetings: meetings.map((m) => ({ id: m.id, title: m.title, startAt: m.startAt, endAt: m.endAt, location: m.location })),
      counts: {
        tasks: myTasks.length,
        overdueTasks: myTasks.filter((t) => t.overdue).length,
        actionItems: actionRows.length,
        approvals: approvals.length,
        meetings: meetings.length,
        unreadNotifications: unreadNotif,
        unreadMail,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { today };
