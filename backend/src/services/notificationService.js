const cron = require('node-cron');
const { generateRecurringTasks } = require('../controllers/recurringTaskController');
const { sendDeadlineEmail } = require('./emailService');
const { pushNotification } = require('./sseService');
const { executeSchedule } = require('../controllers/playbookScheduleController');

const prisma = require('../lib/prisma');

const generateNotifications = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);

  // 진행 중인 업무만 대상 (삭제된 업무 제외)
  const tasks = await prisma.task.findMany({
    where: {
      delYn: '0',
      status: { in: ['pending', 'in_progress'] },
      dueDate: { not: null },
    },
    include: {
      assignees: {
        include: {
          user: { select: { id: true, displayName: true, username: true } },
        },
      },
    },
  });

  for (const task of tasks) {
    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);

    let type = null;
    if (due < today) {
      type = 'overdue';
    } else if (due.getTime() === today.getTime()) {
      type = 'due_today';
    } else if (due <= threeDaysLater) {
      type = 'due_soon';
    }

    if (!type) continue;

    for (const assignee of task.assignees) {
      // 오늘 이미 같은 알림이 있으면 중복 생성 방지
      const existing = await prisma.notification.findFirst({
        where: {
          userId: assignee.userId,
          taskId: task.id,
          type,
          createdAt: { gte: today },
        },
      });

      if (!existing) {
        const newNotif = await prisma.notification.create({
          data: { userId: assignee.userId, taskId: task.id, type },
          include: { task: { select: { id: true, title: true, dueDate: true } } },
        });
        pushNotification(assignee.userId, newNotif);

        // 이메일 알림 발송 (설정이 활성화된 경우)
        try {
          const userWithEmail = await prisma.user.findUnique({
            where: { id: assignee.userId },
            select: { displayName: true, username: true },
          });
          if (userWithEmail) {
            // username을 이메일로 사용 (설정에 따라 별도 email 필드가 없으므로 username 활용)
            await sendDeadlineEmail(
              userWithEmail.username,
              userWithEmail.displayName,
              { title: task.title, dueDate: task.dueDate, type }
            );
          }
        } catch (emailErr) {
          // 이메일 발송 실패는 무시 (알림 저장은 성공)
          console.error('[이메일 알림] 발송 실패:', emailErr.message);
        }
      }
    }
  }

  console.log(`[알림 스케줄러] ${new Date().toLocaleString()} 알림 생성 완료`);
};

// ── SLA 위반 알림 ──────────────────────────────────────────────

const checkSlaBreaches = async () => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  // in_progress 상태인 런 스텝 조회 후 JS에서 slaMins/startedAt null 필터링
  const allSteps = await prisma.runStep.findMany({
    where: {
      status: 'in_progress',
      run: { status: 'active' },
    },
    include: {
      run: {
        select: {
          id: true, name: true, ownerId: true,
          participants: { select: { userId: true } },
        },
      },
    },
  });

  const steps = allSteps.filter((s) => s.slaMins && s.startedAt);
  for (const step of steps) {
    const elapsedMins = Math.floor((now - new Date(step.startedAt)) / 60000);
    const pct = elapsedMins / step.slaMins;
    if (pct < 0.8) continue; // 80% 미만이면 스킵

    const type = pct >= 1 ? 'sla_breach' : 'sla_warning';
    const message = pct >= 1
      ? `SLA 초과: "${step.title}" (${elapsedMins}분 경과 / ${step.slaMins}분)`
      : `SLA 임박: "${step.title}" (${elapsedMins}/${step.slaMins}분, ${Math.round(pct * 100)}%)`;

    // 알림 대상: owner + 참여자
    const targetIds = new Set([step.run.ownerId, ...step.run.participants.map((p) => p.userId)]);
    if (step.assigneeId) targetIds.add(step.assigneeId);

    for (const userId of targetIds) {
      const existing = await prisma.notification.findFirst({
        where: { userId, runStepId: step.id, type, createdAt: { gte: today } },
      });
      if (existing) continue;

      const notif = await prisma.notification.create({
        data: { userId, runId: step.runId, runStepId: step.id, type, message },
      });
      pushNotification(userId, notif);
    }
  }

  console.log(`[SLA 체커] ${new Date().toLocaleString()} SLA 점검 완료`);
};

// ── 스텝 리마인더 ──────────────────────────────────────────────

const checkStepReminders = async () => {
  const now = new Date();
  const hoursAgo24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const daysAgo7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // active 런에서 24시간 이상 대기 중인 pending 스텝 (담당자 있음)
  const stuckSteps = await prisma.runStep.findMany({
    where: {
      status: 'pending',
      assigneeId: { not: null },
      createdAt: { lt: hoursAgo24 },
      run: { status: 'active' },
    },
    include: { run: { select: { id: true, name: true } } },
  });

  for (const step of stuckSteps) {
    // 7일 이내에 같은 스텝 알림이 있으면 스킵 (매일 누적 방지)
    const existing = await prisma.notification.findFirst({
      where: { userId: step.assigneeId, runStepId: step.id, type: 'step_reminder', createdAt: { gte: daysAgo7 } },
    });
    if (existing) continue;

    const notif = await prisma.notification.create({
      data: {
        userId: step.assigneeId,
        runId: step.runId,
        runStepId: step.id,
        type: 'step_reminder',
        message: `"${step.title}" 스텝이 24시간 이상 대기 중입니다. (런: ${step.run.name})`,
      },
    });
    pushNotification(step.assigneeId, notif);
  }

  console.log(`[스텝 리마인더] ${new Date().toLocaleString()} 확인 완료`);
};

// ── 플레이북 스케줄 자동 실행 ──────────────────────────────────────────────

const checkAndRunSchedules = async () => {
  const now = new Date();
  const dayOfWeek = now.getDay();    // 0=일 ~ 6=토
  const dayOfMonth = now.getDate();
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const schedules = await prisma.playbookSchedule.findMany({
    where: { isActive: true, recurrenceTime: currentHHMM },
  });

  for (const schedule of schedules) {
    // 오늘 이미 실행됐으면 스킵
    if (schedule.lastRunAt && new Date(schedule.lastRunAt) >= todayStart) continue;

    let shouldRun = false;
    if (schedule.recurrenceType === 'daily') {
      shouldRun = true;
    } else if (schedule.recurrenceType === 'weekly') {
      shouldRun = schedule.recurrenceDay === dayOfWeek;
    } else if (schedule.recurrenceType === 'monthly') {
      shouldRun = schedule.recurrenceDay === dayOfMonth;
    }

    if (!shouldRun) continue;

    try {
      await executeSchedule(schedule, schedule.createdBy);
      console.log(`[플레이북 스케줄] "${schedule.name}" 자동 실행 완료`);
    } catch (err) {
      console.error(`[플레이북 스케줄] "${schedule.name}" 실행 실패:`, err.message);
    }
  }
};

const scheduleNotifications = () => {
  // 매일 오전 9시: 마감 알림 생성 + 반복 업무 자동 생성
  cron.schedule('0 9 * * *', async () => {
    await generateNotifications();
    await generateRecurringTasks().catch(console.error);
  });
  // 15분마다: SLA 위반 체크
  cron.schedule('*/15 * * * *', () => checkSlaBreaches().catch(console.error));
  // 1시간마다: 스텝 리마인더
  cron.schedule('0 * * * *', () => checkStepReminders().catch(console.error));
  // 매분: 플레이북 스케줄 자동 실행 체크
  cron.schedule('* * * * *', () => checkAndRunSchedules().catch(console.error));

  // 서버 시작 시 반복업무만 즉시 생성 (알림은 09:00 크론에서만 생성)
  generateRecurringTasks().catch(console.error);
  console.log('[알림 스케줄러] 등록 완료 (매일 09:00 실행)');
  console.log('[SLA 스케줄러] 등록 완료 (15분마다 실행)');
  console.log('[스텝 리마인더] 등록 완료 (1시간마다 실행)');
  console.log('[반복업무 스케줄러] 등록 완료 (매일 09:00 실행)');
  console.log('[플레이북 스케줄러] 등록 완료 (매분 실행)');
};

module.exports = { scheduleNotifications, generateNotifications, checkSlaBreaches, checkStepReminders };
