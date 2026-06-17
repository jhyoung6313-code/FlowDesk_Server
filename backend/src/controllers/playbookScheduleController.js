const { pushNotification } = require('../services/sseService');

const prisma = require('../lib/prisma');

const SCHEDULE_INCLUDE = {
  creator: { select: { id: true, displayName: true } },
};

// 스케줄 목록
const list = async (req, res, next) => {
  try {
    const playbookId = Number(req.params.id);
    const schedules = await prisma.playbookSchedule.findMany({
      where: { playbookId },
      include: SCHEDULE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    res.json(schedules);
  } catch (err) { next(err); }
};

// 스케줄 생성
const create = async (req, res, next) => {
  try {
    const playbookId = Number(req.params.id);
    const { name, recurrenceType, recurrenceDay, recurrenceTime, variableValues, participantIds } = req.body;
    if (!name) return res.status(400).json({ error: '이름은 필수입니다.' });
    if (!recurrenceType) return res.status(400).json({ error: '반복 유형은 필수입니다.' });

    const pb = await prisma.playbook.findUnique({ where: { id: playbookId } });
    if (!pb) return res.status(404).json({ error: 'Playbook을 찾을 수 없습니다.' });

    const schedule = await prisma.playbookSchedule.create({
      data: {
        playbookId,
        name,
        recurrenceType,
        recurrenceDay: recurrenceDay ?? null,
        recurrenceTime: recurrenceTime || '09:00',
        variableValues: variableValues ? JSON.stringify(variableValues) : null,
        participantIds: participantIds ? JSON.stringify(participantIds) : null,
        createdBy: req.user.id,
      },
      include: SCHEDULE_INCLUDE,
    });
    res.status(201).json(schedule);
  } catch (err) { next(err); }
};

// 스케줄 수정
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.scheduleId);
    const existing = await prisma.playbookSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '스케줄을 찾을 수 없습니다.' });

    const { name, recurrenceType, recurrenceDay, recurrenceTime, variableValues, participantIds, isActive } = req.body;

    const schedule = await prisma.playbookSchedule.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(recurrenceType !== undefined && { recurrenceType }),
        ...(recurrenceDay !== undefined && { recurrenceDay: recurrenceDay ?? null }),
        ...(recurrenceTime !== undefined && { recurrenceTime }),
        ...(variableValues !== undefined && { variableValues: variableValues ? JSON.stringify(variableValues) : null }),
        ...(participantIds !== undefined && { participantIds: participantIds ? JSON.stringify(participantIds) : null }),
        ...(isActive !== undefined && { isActive }),
      },
      include: SCHEDULE_INCLUDE,
    });
    res.json(schedule);
  } catch (err) { next(err); }
};

// 스케줄 삭제
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.scheduleId);
    const existing = await prisma.playbookSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '스케줄을 찾을 수 없습니다.' });
    await prisma.playbookSchedule.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// 즉시 실행
const runNow = async (req, res, next) => {
  try {
    const scheduleId = Number(req.params.scheduleId);
    const schedule = await prisma.playbookSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) return res.status(404).json({ error: '스케줄을 찾을 수 없습니다.' });

    const run = await executeSchedule(schedule, req.user.id);
    res.status(201).json(run);
  } catch (err) { next(err); }
};

// ─── 내부 실행 함수 (cron + runNow 공유) ───────────────────────────────────────

async function executeSchedule(schedule, triggeredBy) {
  const pbSteps = await prisma.playbookStep.findMany({
    where: { playbookId: schedule.playbookId },
    orderBy: { order: 'asc' },
  });

  const varValues = schedule.variableValues ? JSON.parse(schedule.variableValues) : {};
  const participantIds = schedule.participantIds ? JSON.parse(schedule.participantIds) : [];

  const newRun = await prisma.$transaction(async (tx) => {
    const run = await tx.playbookRun.create({
      data: {
        playbookId: schedule.playbookId,
        name: `[자동] ${schedule.name}`,
        severity: 'none',
        variableValues: schedule.variableValues,
        ownerId: triggeredBy,
        createdBy: triggeredBy,
      },
    });

    for (const s of pbSteps) {
      const assigneeId = s.assigneeMode === 'specific' ? (s.assigneeUserId ?? null) : null;
      await tx.runStep.create({
        data: {
          runId: run.id,
          stepId: s.id,
          phaseId: s.phaseId,
          title: replaceVars(s.title, varValues),
          instructions: s.instructions ? replaceVars(s.instructions, varValues) : null,
          type: s.type,
          order: s.order,
          assigneeId,
          slaMins: s.slaMins,
          requireEvidence: s.requireEvidence,
          parallelGroup: s.parallelGroup ?? null,
        },
      });
    }

    await tx.runParticipant.create({ data: { runId: run.id, userId: triggeredBy, role: 'owner' } });

    for (const uid of participantIds) {
      if (uid !== triggeredBy) {
        await tx.runParticipant.upsert({
          where: { runId_userId: { runId: run.id, userId: uid } },
          create: { runId: run.id, userId: uid, role: 'participant' },
          update: {},
        });
      }
    }

    await tx.runTimeline.create({
      data: { runId: run.id, eventType: 'run_started', createdBy: triggeredBy },
    });

    await tx.playbookSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date() },
    });

    return run;
  });

  // 담당자 알림
  for (const s of pbSteps) {
    if (s.assigneeMode === 'specific' && s.assigneeUserId) {
      try {
        const notif = await prisma.notification.create({
          data: {
            userId: s.assigneeUserId,
            runId: newRun.id,
            type: 'step_assigned',
            message: `[자동실행] "${schedule.name}"에서 "${replaceVars(s.title, varValues)}" 스텝이 배정되었습니다.`,
          },
        });
        pushNotification(s.assigneeUserId, notif);
      } catch { /* ignore */ }
    }
  }

  return newRun;
}

function replaceVars(text, vars) {
  if (!text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

module.exports = { list, create, update, remove, runNow, executeSchedule };
