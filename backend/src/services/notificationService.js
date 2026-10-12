const cron = require('node-cron');
const { generateRecurringTasks } = require('../controllers/recurringTaskController');
const { sendDeadlineEmail, sendApprovalStyledEmail } = require('./emailService');
const { isEmailOptedOut } = require('./emailPreference');
const { pushNotification } = require('./sseService');
const { executeSchedule } = require('../controllers/playbookScheduleController');

const prisma = require('../lib/prisma');

// "오늘/최근 기간 내 중복 여부 확인 → 알림 생성 → 실시간 push → (선택) 이메일" 패턴이
// generateNotifications/checkSlaBreaches/checkStepReminders/checkApprovalReminders(×2)/
// checkApprovalDailyDigest 총 5곳에 거의 같은 모양으로 반복돼 있었다. dedup 기준(where)과
// 이메일 발송 방식(이 결재 전용 템플릿을 쓰는 곳도 있고, 마감알림처럼 다른 템플릿을 쓰는 곳도
// 있음)만 호출부마다 다르므로 그 둘을 매개변수로 받는다.
// @returns 생성된 notification, 또는 이미 존재해 스킵했으면 null
async function notifyOnce({ dedupWhere, data, include, userId, sendEmail }) {
  const existing = await prisma.notification.findFirst({ where: dedupWhere });
  if (existing) return null;
  const notif = await prisma.notification.create({ data, ...(include && { include }) });
  pushNotification(userId, notif);
  if (sendEmail) {
    sendEmail().catch((e) => console.error('[이메일 알림] 발송 실패:', e.message));
  }
  return notif;
}

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
      await notifyOnce({
        dedupWhere: { userId: assignee.userId, taskId: task.id, type, createdAt: { gte: today } },
        data: { userId: assignee.userId, taskId: task.id, type },
        include: { task: { select: { id: true, title: true, dueDate: true } } },
        userId: assignee.userId,
        // 이메일 알림 발송 (설정이 활성화된 경우)
        sendEmail: async () => {
          if (await isEmailOptedOut(assignee.userId)) return;
          const userWithEmail = await prisma.user.findUnique({
            where: { id: assignee.userId },
            select: { displayName: true, username: true },
          });
          if (userWithEmail) {
            // username을 이메일로 사용 (설정에 따라 별도 email 필드가 없으므로 username 활용)
            await sendDeadlineEmail(userWithEmail.username, userWithEmail.displayName, { title: task.title, dueDate: task.dueDate, type });
          }
        },
      });
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
      await notifyOnce({
        dedupWhere: { userId, runStepId: step.id, type, createdAt: { gte: today } },
        data: { userId, runId: step.runId, runStepId: step.id, type, message },
        userId,
      });
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
    await notifyOnce({
      dedupWhere: { userId: step.assigneeId, runStepId: step.id, type: 'step_reminder', createdAt: { gte: daysAgo7 } },
      data: {
        userId: step.assigneeId,
        runId: step.runId,
        runStepId: step.id,
        type: 'step_reminder',
        message: `"${step.title}" 스텝이 24시간 이상 대기 중입니다. (런: ${step.run.name})`,
      },
      userId: step.assigneeId,
    });
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

// ── 전자결재 리마인더 (마감 초과 · 3일 이상 미처리) ────────────────────────
// 결재 리마인더(요청/지연) 이메일 — SMTP 미설정이면 sendApprovalStyledEmail이 조용히 false 반환
async function emailApprovalReminder(userId, message) {
  try {
    if (await isEmailOptedOut(userId)) return;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });
    if (!u) return;
    // username을 이메일로 사용 — 이 프로젝트의 기존 관례(별도 email 컬럼 없음)
    await sendApprovalStyledEmail(u.username, `[FlowDesk] ${message}`, u.displayName, message);
  } catch { /* 이메일 실패는 인앱 알림 성공에 영향을 주지 않는다 */ }
}

const checkApprovalReminders = async () => {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
  const dedupSince = new Date(now.getTime() - 20 * 3600 * 1000); // 20h 내 중복 발송 방지

  const docs = await prisma.approvalDocument.findMany({
    where: {
      status: 'pending',
      delYn: '0',
      OR: [
        { dueDate: { lt: now } },       // 마감기한 초과
        { updatedAt: { lt: threeDaysAgo } }, // 3일 이상 진행 없음
      ],
    },
    include: {
      steps: { where: { type: { not: 'reference' } } },
      creator: { select: { displayName: true } },
    },
  });

  let sent = 0;
  for (const doc of docs) {
    const overdue = doc.dueDate && new Date(doc.dueDate) < now;
    const current = doc.steps.filter(s => s.stepOrder === doc.currentStep && s.status === 'pending');
    for (const s of current) {
      const msg = overdue
        ? `[결재 지연] "${doc.title}" 결재 마감기한이 지났습니다. 처리 부탁드립니다.`
        : `[결재 대기] "${doc.title}" 결재가 3일 이상 대기 중입니다.`;
      const notif = await notifyOnce({
        dedupWhere: { userId: s.approverId, type: 'approval_requested', link: `/approvals/${doc.id}`, createdAt: { gte: dedupSince } },
        data: { userId: s.approverId, type: 'approval_requested', link: `/approvals/${doc.id}`, message: msg },
        userId: s.approverId,
        sendEmail: () => emailApprovalReminder(s.approverId, msg),
      });
      if (notif) sent++;
    }

    // 기한 초과 시 기안자에게도 알려 직접 독촉하거나 다른 조치를 취할 수 있게 한다
    // (기존에는 결재자만 재알림을 받고, 정작 지연을 체감해야 할 기안자는 모르고 있었음)
    if (overdue) {
      // approval_requested를 재사용 — 전용 enum 값을 새로 만들 정도로 다른 성격의 알림은 아니다.
      // 접두사는 결재자용 리마인더("[결재 지연]")와 겹치지 않는 별도 문구를 써서 중복방지 조회가
      // 서로의 알림을 오인하지 않게 한다 — 기안자가 자기 문서의 결재자이기도 한 경우(자가결재),
      // 같은 userId에 두 메시지가 모두 쌓일 수 있어 접두사가 같으면 한쪽이 다른 쪽 알림 존재만으로
      // 조용히 생략될 수 있었다.
      const ownerMsg = `[결재 지연·기안자] 내가 올린 "${doc.title}" 결재가 마감기한을 넘겼습니다. 결재자에게 직접 확인해보세요.`;
      const ownerNotif = await notifyOnce({
        dedupWhere: {
          userId: doc.createdBy, type: 'approval_requested',
          message: { startsWith: '[결재 지연·기안자]' },
          link: `/approvals/${doc.id}`, createdAt: { gte: dedupSince },
        },
        data: { userId: doc.createdBy, type: 'approval_requested', link: `/approvals/${doc.id}`, message: ownerMsg },
        userId: doc.createdBy,
        sendEmail: () => emailApprovalReminder(doc.createdBy, ownerMsg),
      });
      if (ownerNotif) sent++;
    }
  }
  console.log(`[결재 리마인더] ${new Date().toLocaleString()} 확인 완료 — ${sent}건 발송`);
};

// ── 결재 일일 다이제스트 ────────────────────────────────────────
// 건별 실시간 알림(요청 시점)은 그대로 유지하고, 매일 아침 "오늘 기준 내 차례인 결재가 N건"을
// 한 번만 더 묶어서 보낸다 — 지연·정체 리마인더(checkApprovalReminders)와 달리 기한/정체 여부와
// 무관하게 "현재 내 차례인 모든 문서"를 대상으로 한다.
const checkApprovalDailyDigest = async () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const docs = await prisma.approvalDocument.findMany({
    where: { status: 'pending', delYn: '0' },
    select: {
      id: true, currentStep: true,
      steps: { where: { type: { not: 'reference' } }, select: { approverId: true, stepOrder: true, status: true } },
    },
  });

  const byUser = {};
  for (const doc of docs) {
    const mine = doc.steps.filter(s => s.stepOrder === doc.currentStep && s.status === 'pending');
    for (const s of mine) (byUser[s.approverId] ||= []).push(doc.id);
  }

  let sent = 0;
  for (const [userIdStr, docIds] of Object.entries(byUser)) {
    const userId = Number(userIdStr);
    if (docIds.length === 0) continue;
    const msg = `[오늘의 결재 요약] 현재 내 차례인 결재 문서가 ${docIds.length}건 있습니다.`;
    // 같은 날 중복 발송 방지(서버 재시작 등으로 크론이 다시 돌아도 하루 1건만)
    const notif = await notifyOnce({
      dedupWhere: { userId, type: 'approval_requested', message: { startsWith: '[오늘의 결재 요약]' }, createdAt: { gte: today } },
      data: { userId, type: 'approval_requested', link: '/approvals', message: msg },
      userId,
      sendEmail: () => emailApprovalReminder(userId, msg),
    });
    if (notif) sent++;
  }
  console.log(`[결재 일일 다이제스트] ${new Date().toLocaleString()} 발송 완료 — ${sent}명`);
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
  // 매일 09:05: 전자결재 리마인더(마감초과·미처리)
  cron.schedule('5 9 * * *', () => checkApprovalReminders().catch(console.error));
  // 매일 08:50: 전자결재 일일 다이제스트(오늘 기준 내 차례인 결재 N건 요약, 리마인더보다 먼저)
  cron.schedule('50 8 * * *', () => checkApprovalDailyDigest().catch(console.error));
  // 매분: 플레이북 스케줄 자동 실행 체크
  cron.schedule('* * * * *', () => checkAndRunSchedules().catch(console.error));

  // 서버 시작 시 반복업무만 즉시 생성 (알림은 09:00 크론에서만 생성)
  generateRecurringTasks().catch(console.error);
  console.log('[알림 스케줄러] 등록 완료 (매일 09:00 실행)');
  console.log('[SLA 스케줄러] 등록 완료 (15분마다 실행)');
  console.log('[스텝 리마인더] 등록 완료 (1시간마다 실행)');
  console.log('[반복업무 스케줄러] 등록 완료 (매일 09:00 실행)');
  console.log('[결재 일일 다이제스트] 등록 완료 (매일 08:50 실행)');
  console.log('[플레이북 스케줄러] 등록 완료 (매분 실행)');
};

module.exports = { scheduleNotifications, generateNotifications, checkSlaBreaches, checkStepReminders, checkApprovalReminders, checkApprovalDailyDigest };
