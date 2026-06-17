const { pushNotification } = require('../services/sseService');
const prisma = require('../lib/prisma');
const linkedRoomService = require('../services/linkedRoomService');

const USER_SELECT = { id: true, displayName: true, avatarColor: true };
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

let _io = null;
const setIO = (io) => { _io = io; };
const emitToRun = (runId, event, data) => { if (_io) _io.to(`run:${runId}`).emit(event, data); };
// 전역 broadcast: 모든 접속자에게 Playbook 활동 알림 (사이드바 안읽음 누적용)
const emitGlobal = (event, data) => { if (_io) _io.emit(event, data); };

// 런 전용 채팅방 보장 (없으면 런 이름으로 생성, 멤버=참여자). 반환: roomId
async function ensureRunRoom(runId) {
  const run = await prisma.playbookRun.findUnique({
    where: { id: runId },
    select: {
      linkedRoomId: true, name: true, ownerId: true, createdBy: true,
      participants: { select: { userId: true } },
    },
  });
  if (!run) return null;
  if (run.linkedRoomId) return run.linkedRoomId;
  const roomId = await linkedRoomService.createGroupRoom({
    name: run.name,
    memberIds: [run.ownerId, run.createdBy, ...run.participants.map((p) => p.userId)],
    createdBy: run.createdBy,
  });
  await prisma.playbookRun.update({ where: { id: runId }, data: { linkedRoomId: roomId } });
  return roomId;
}

// 런 전용 채팅방에 행위자 명의로 메시지 발송 (클릭 시 런 상세로 이동하는 링크 포함)
async function notifyRunRoom(runId, content, actorId) {
  try {
    const roomId = await ensureRunRoom(runId);
    if (!roomId) return;
    // 포트 무관 동작을 위해 상대경로 앵커로 발송 (프론트에서 SPA 네비게이션 처리)
    await linkedRoomService.postMessage({
      roomId,
      content: `${content} <a href="/runs/${runId}" data-chat-link style="color:#1677ff;text-decoration:underline">바로가기 ↗</a>`,
      senderId: actorId,
    });
  } catch { /* 조용히 실패 */ }
}

const RUN_INCLUDE = {
  playbook: {
    select: {
      id: true, name: true, category: true,
      phases: { orderBy: { order: 'asc' } },
    },
  },
  owner:   { select: USER_SELECT },
  creator: { select: USER_SELECT },
  steps: {
    orderBy: { order: 'asc' },
    include: {
      assignee:  { select: USER_SELECT },
      completer: { select: USER_SELECT },
      step: { select: { decisionOptions: true } },
    },
  },
  participants: {
    include: { user: { select: USER_SELECT } },
    orderBy: { joinedAt: 'asc' },
  },
  updates:  { include: { creator: { select: USER_SELECT } }, orderBy: { createdAt: 'desc' } },
  timeline: { include: { creator: { select: USER_SELECT } }, orderBy: { createdAt: 'asc' } },
};

// ─────────── Run CRUD ───────────

const listRuns = async (req, res, next) => {
  try {
    const { status, playbookId, severity } = req.query;
    const where = {};
    if (status) where.status = status;
    if (playbookId) where.playbookId = Number(playbookId);
    if (severity) where.severity = severity;

    const runs = await prisma.playbookRun.findMany({
      where,
      include: {
        playbook: { select: { id: true, name: true, category: true } },
        owner:   { select: USER_SELECT },
        steps:   { select: { id: true, status: true } },
        _count:  { select: { participants: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    res.json(runs);
  } catch (err) { next(err); }
};

const getRun = async (req, res, next) => {
  try {
    const run = await prisma.playbookRun.findUnique({
      where: { id: Number(req.params.id) },
      include: RUN_INCLUDE,
    });
    if (!run) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    res.json(run);
  } catch (err) { next(err); }
};

const createRun = async (req, res, next) => {
  try {
    const { playbookId, name, severity, variableValues, dueAt, participantIds } = req.body;
    if (!name) return res.status(400).json({ error: '이름은 필수입니다.' });

    const run = await prisma.$transaction(async (tx) => {
      const newRun = await tx.playbookRun.create({
        data: {
          playbookId: playbookId ?? null,
          name,
          severity: severity || 'none',
          variableValues: variableValues ? JSON.stringify(variableValues) : null,
          dueAt: dueAt ? new Date(dueAt) : null,
          ownerId: req.user.id,
          createdBy: req.user.id,
        },
      });

      // Playbook 스텝 복사
      if (playbookId) {
        const pbSteps = await tx.playbookStep.findMany({
          where: { playbookId: Number(playbookId) },
          orderBy: { order: 'asc' },
        });
        const varValues = variableValues || {};
        for (const s of pbSteps) {
          const assigneeId = s.assigneeMode === 'specific' ? (s.assigneeUserId ?? null) : null;
          await tx.runStep.create({
            data: {
              runId: newRun.id,
              stepId: s.id,
              phaseId: s.phaseId,
              title: replaceVars(s.title, varValues),
              instructions: s.instructions ? replaceVars(s.instructions, varValues) : null,
              type: s.type,
              order: s.order,
              assigneeId,
              slaMins: s.slaMins,
              dueAt: s.dueAt,
              requireEvidence: s.requireEvidence,
              parallelGroup: s.parallelGroup ?? null,
            },
          });
        }
      }

      // Owner 참여자 등록
      await tx.runParticipant.create({
        data: { runId: newRun.id, userId: req.user.id, role: 'owner' },
      });

      // 요청된 참여자 + Playbook 기본 참여자를 병합 (중복 제거)
      const mergedParticipantIds = new Set(participantIds || []);
      if (playbookId) {
        const pb = await tx.playbook.findUnique({
          where: { id: Number(playbookId) },
          select: { defaultParticipants: true },
        });
        if (pb?.defaultParticipants) {
          try {
            for (const uid of JSON.parse(pb.defaultParticipants)) mergedParticipantIds.add(uid);
          } catch { /* ignore malformed */ }
        }
      }

      for (const uid of mergedParticipantIds) {
        if (uid !== req.user.id) {
          await tx.runParticipant.upsert({
            where: { runId_userId: { runId: newRun.id, userId: uid } },
            create: { runId: newRun.id, userId: uid, role: 'participant' },
            update: {},
          });
        }
      }

      await tx.runTimeline.create({
        data: { runId: newRun.id, eventType: 'run_started', createdBy: req.user.id },
      });

      return tx.playbookRun.findUnique({ where: { id: newRun.id }, include: RUN_INCLUDE });
    });

    // 사전 배정된 스텝 담당자에게 알림
    if (playbookId) {
      for (const s of run.steps) {
        if (s.assigneeId && s.assigneeId !== req.user.id) {
          try {
            const notif = await prisma.notification.create({
              data: {
                userId: s.assigneeId,
                runId: run.id,
                runStepId: s.id,
                type: 'step_assigned',
                message: `"${run.name}"에서 "${s.title}" 스텝이 배정되었습니다.`,
              },
            });
            pushNotification(s.assigneeId, notif);
          } catch { /* ignore */ }
        }
      }
    }

    emitGlobal('playbook-activity', { type: 'run-created', actorId: req.user.id });
    await notifyRunRoom(run.id, `🚀 런 시작: **${run.name}**`, req.user.id);
    res.status(201).json(run);
  } catch (err) { next(err); }
};

const updateRun = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbookRun.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    const { name, severity, dueAt, summary } = req.body;
    const run = await prisma.playbookRun.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(severity !== undefined && { severity }),
        ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
        ...(summary !== undefined && { summary }),
      },
      include: RUN_INCLUDE,
    });
    res.json(run);
  } catch (err) { next(err); }
};

const finishRun = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbookRun.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    const { summary } = req.body || {};
    const run = await prisma.$transaction(async (tx) => {
      await tx.playbookRun.update({
        where: { id },
        data: { status: 'finished', endedAt: new Date(), ...(summary && { summary }) },
      });
      await tx.runTimeline.create({
        data: { runId: id, eventType: 'run_finished', createdBy: req.user.id },
      });
      return tx.playbookRun.findUnique({ where: { id }, include: RUN_INCLUDE });
    });
    emitToRun(id, 'run-status-changed', { runId: id, status: 'finished' });
    emitGlobal('playbook-activity', { type: 'run-status', actorId: req.user.id });
    await notifyRunRoom(id, `✅ 런 완료: **${run.name}**`, req.user.id);
    res.json(run);
  } catch (err) { next(err); }
};

const pauseRun = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbookRun.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    await prisma.playbookRun.update({ where: { id }, data: { status: 'paused' } });
    await prisma.runTimeline.create({ data: { runId: id, eventType: 'run_paused', createdBy: req.user.id } });
    emitGlobal('playbook-activity', { type: 'run-status', actorId: req.user.id });
    await notifyRunRoom(id, `⏸️ 런 일시정지: **${existing.name}**`, req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const resumeRun = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbookRun.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    await prisma.playbookRun.update({ where: { id }, data: { status: 'active' } });
    await prisma.runTimeline.create({ data: { runId: id, eventType: 'run_resumed', createdBy: req.user.id } });
    emitGlobal('playbook-activity', { type: 'run-status', actorId: req.user.id });
    await notifyRunRoom(id, `▶️ 런 재개: **${existing.name}**`, req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const archiveRun = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbookRun.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    await prisma.$transaction(async (tx) => {
      await tx.playbookRun.update({ where: { id }, data: { status: 'archived' } });
      await tx.runTimeline.create({ data: { runId: id, eventType: 'run_archived', createdBy: req.user.id } });
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const deleteRun = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbookRun.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id)
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    await prisma.playbookRun.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─────────── 스텝 실행 ───────────

const addStep = async (req, res, next) => {
  try {
    const runId = Number(req.params.id);
    const { title, phaseId } = req.body;
    const run = await prisma.playbookRun.findUnique({
      where: { id: runId },
      include: { steps: { select: { order: true } } },
    });
    if (!run) return res.status(404).json({ error: 'Run을 찾을 수 없습니다.' });
    const maxOrder = run.steps.length ? Math.max(...run.steps.map((s) => s.order)) : -1;
    const step = await prisma.runStep.create({
      data: {
        runId,
        phaseId: phaseId ?? null,
        title: title || '',
        type: 'task',
        order: maxOrder + 1,
      },
      include: { assignee: { select: USER_SELECT }, completer: { select: USER_SELECT } },
    });
    res.status(201).json(step);
  } catch (err) { next(err); }
};

const deleteStep = async (req, res, next) => {
  try {
    const runId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    const step = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
    if (!step) return res.status(404).json({ error: '스텝을 찾을 수 없습니다.' });
    await prisma.runStep.delete({ where: { id: stepId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const updateStep = async (req, res, next) => {
  try {
    const runId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    const { status, evidence, assigneeId, dueAt, decisionChosen, title, instructions } = req.body;

    const step = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
    if (!step) return res.status(404).json({ error: '스텝을 찾을 수 없습니다.' });

    const data = {};
    if (status !== undefined) {
      data.status = status;
      if (status === 'in_progress' && !step.startedAt) data.startedAt = new Date();
      if (['done', 'skipped', 'rejected'].includes(status)) {
        data.completedAt = new Date();
        data.completedBy = req.user.id;
      }
    }
    if (title !== undefined && title !== null) data.title = title;
    if (instructions !== undefined) data.instructions = instructions;
    if (evidence !== undefined) data.evidence = evidence;
    if (assigneeId !== undefined) {
      if (assigneeId !== null) {
        const userExists = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
        if (!userExists) return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
      }
      data.assigneeId = assigneeId || null;
    }
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    if (decisionChosen !== undefined) data.decisionChosen = decisionChosen;

    const updated = await prisma.runStep.update({
      where: { id: stepId },
      data,
      include: { assignee: { select: USER_SELECT }, completer: { select: USER_SELECT } },
    });

    if (status) {
      await prisma.runTimeline.create({
        data: {
          runId,
          eventType: `step_${status}`,
          eventData: JSON.stringify({ stepTitle: step.title, status }),
          createdBy: req.user.id,
        },
      });
    }

    // 조건부 분기: decision 스텝 완료 시 선택되지 않은 브랜치 스텝 스킵
    if (status === 'done' && step.type === 'decision' && decisionChosen) {
      const rawOpts = await prisma.runStep.findUnique({ where: { id: stepId }, select: { step: { select: { decisionOptions: true } } } });
      if (rawOpts?.step?.decisionOptions) {
        try {
          const opts = JSON.parse(rawOpts.step.decisionOptions);
          const chosen = opts.find((o) => o.label === decisionChosen);
          // nextStepOrder가 설정된 경우: 현재 스텝 order ~ nextStepOrder 사이의 스텝 스킵
          if (chosen?.nextStepOrder != null) {
            const skipSteps = await prisma.runStep.findMany({
              where: {
                runId,
                status: 'pending',
                order: { gt: step.order, lt: chosen.nextStepOrder },
              },
            });
            for (const sk of skipSteps) {
              await prisma.runStep.update({ where: { id: sk.id }, data: { status: 'skipped', completedAt: new Date(), completedBy: req.user.id } });
              await prisma.runTimeline.create({
                data: { runId, eventType: 'step_skipped', eventData: JSON.stringify({ stepTitle: sk.title, reason: `분기: ${decisionChosen}` }), createdBy: req.user.id },
              });
            }
          }
        } catch { /* 파싱 오류 무시 */ }
      }
    }

    // 전체 스텝 완료 시 Run 자동 완료
    if (['done', 'skipped', 'rejected'].includes(status)) {
      const allSteps = await prisma.runStep.findMany({ where: { runId } });
      const allFinished = allSteps.every((s) => ['done', 'skipped', 'rejected'].includes(s.status));
      if (allFinished) {
        await prisma.playbookRun.update({ where: { id: runId }, data: { status: 'finished', endedAt: new Date() } });
        await prisma.runTimeline.create({ data: { runId, eventType: 'run_auto_finished', createdBy: req.user.id } });
      }
    }

    // 담당자가 새로 지정된 경우 알림
    if (assigneeId !== undefined && assigneeId !== null && assigneeId !== step.assigneeId) {
      try {
        const run = await prisma.playbookRun.findUnique({ where: { id: runId }, select: { name: true } });
        const notif = await prisma.notification.create({
          data: {
            userId: assigneeId,
            runId,
            runStepId: stepId,
            type: 'step_assigned',
            message: `"${run?.name || ''}"에서 "${step.title}" 스텝이 배정되었습니다.`,
          },
        });
        pushNotification(assigneeId, notif);
      } catch { /* ignore */ }
    }

    emitToRun(runId, 'run-step-updated', { stepId, ...data });
    if (status === 'done') {
      emitGlobal('playbook-activity', { type: 'step-done', actorId: req.user.id });
      await notifyRunRoom(runId, `✔️ 스텝 완료: **${updated.title}**`, req.user.id);
    }
    res.json(updated);
  } catch (err) { next(err); }
};

// ─────────── 참여자 ───────────

const addParticipant = async (req, res, next) => {
  try {
    const runId = Number(req.params.id);
    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId는 필수입니다.' });
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) return res.status(400).json({ error: '존재하지 않는 사용자입니다.' });
    const p = await prisma.runParticipant.upsert({
      where: { runId_userId: { runId, userId } },
      create: { runId, userId, role: role || 'participant' },
      update: { role: role || 'participant' },
      include: { user: { select: USER_SELECT } },
    });
    await prisma.runTimeline.create({
      data: { runId, eventType: 'participant_added', eventData: JSON.stringify({ userId }), createdBy: req.user.id },
    });
    res.json(p);
  } catch (err) { next(err); }
};

const removeParticipant = async (req, res, next) => {
  try {
    const runId = Number(req.params.id);
    const userId = Number(req.params.userId);
    await prisma.runParticipant.deleteMany({ where: { runId, userId } });
    await prisma.runTimeline.create({
      data: { runId, eventType: 'participant_removed', eventData: JSON.stringify({ userId }), createdBy: req.user.id },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─────────── 업데이트 ───────────

const addUpdate = async (req, res, next) => {
  try {
    const runId = Number(req.params.id);
    const { message, type } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: '내용을 입력하세요.' });
    const u = await prisma.runUpdate.create({
      data: { runId, message, type: type || 'note', createdBy: req.user.id },
      include: { creator: { select: USER_SELECT } },
    });
    emitGlobal('playbook-activity', { type: 'run-update', actorId: req.user.id });
    await notifyRunRoom(runId, `📝 업데이트: ${message.replace(/<[^>]*>/g, '').slice(0, 80)}`, req.user.id);
    res.status(201).json(u);
  } catch (err) { next(err); }
};

const deleteUpdate = async (req, res, next) => {
  try {
    const id = Number(req.params.updateId);
    const u = await prisma.runUpdate.findUnique({ where: { id } });
    if (!u) return res.status(404).json({ error: '없음' });
    if (req.user.role !== 'admin' && u.createdBy !== req.user.id)
      return res.status(403).json({ error: '권한 없음' });
    await prisma.runUpdate.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─────────── 체크리스트 ───────────

const getChecklists = async (req, res, next) => {
  try {
    const stepId = Number(req.params.stepId);
    const items = await prisma.runStepChecklist.findMany({
      where: { runStepId: stepId },
      orderBy: { order: 'asc' },
    });
    res.json(items);
  } catch (err) { next(err); }
};

const addChecklist = async (req, res, next) => {
  try {
    const stepId = Number(req.params.stepId);
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '내용을 입력하세요.' });
    const maxOrder = await prisma.runStepChecklist.aggregate({ where: { runStepId: stepId }, _max: { order: true } });
    const item = await prisma.runStepChecklist.create({
      data: { runStepId: stepId, content: content.trim(), order: (maxOrder._max.order ?? -1) + 1 },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

const updateChecklist = async (req, res, next) => {
  try {
    const id = Number(req.params.checkId);
    const { checked, content } = req.body;
    const item = await prisma.runStepChecklist.update({
      where: { id },
      data: { ...(checked !== undefined && { checked }), ...(content !== undefined && { content }) },
    });
    res.json(item);
  } catch (err) { next(err); }
};

const deleteChecklist = async (req, res, next) => {
  try {
    await prisma.runStepChecklist.delete({ where: { id: Number(req.params.checkId) } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─────────── 통계 ───────────

const getStats = async (req, res, next) => {
  try {
    const [byStatus, bySeverity] = await Promise.all([
      prisma.playbookRun.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.playbookRun.groupBy({ by: ['severity'], _count: { id: true } }),
    ]);

    // 완료된 런의 평균 소요 시간(분): JS에서 null 필터링
    const allFinishedRuns = await prisma.playbookRun.findMany({
      where: { status: 'finished' },
      select: { startedAt: true, endedAt: true },
    });
    const finished = allFinishedRuns.filter((r) => r.startedAt && r.endedAt);
    const avgMins = finished.length
      ? Math.round(finished.reduce((s, r) => s + (new Date(r.endedAt) - new Date(r.startedAt)) / 60000, 0) / finished.length)
      : null;

    // 스텝별 평균 완료 시간: JS에서 null 필터링
    const allStepTimes = await prisma.runStep.findMany({
      select: { title: true, startedAt: true, completedAt: true },
    });
    const stepTimes = allStepTimes.filter((s) => s.startedAt && s.completedAt);
    const stepTimeMap = {};
    for (const s of stepTimes) {
      const mins = (new Date(s.completedAt) - new Date(s.startedAt)) / 60000;
      if (!stepTimeMap[s.title]) stepTimeMap[s.title] = { total: 0, count: 0 };
      stepTimeMap[s.title].total += mins;
      stepTimeMap[s.title].count += 1;
    }
    const bottlenecks = Object.entries(stepTimeMap)
      .map(([title, { total, count }]) => ({ title, avgMins: Math.round(total / count), count }))
      .sort((a, b) => b.avgMins - a.avgMins)
      .slice(0, 5);

    res.json({
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count.id })),
      bySeverity: bySeverity.map((r) => ({ severity: r.severity, count: r._count.id })),
      totalFinished: finished.length,
      avgCompletionMins: avgMins,
      bottlenecks,
    });
  } catch (err) { next(err); }
};

function replaceVars(text, vars) {
  if (!text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─────────── 안읽음 카운트 ───────────
// 마지막 확인 이후 생성된 새 Run + Run 업데이트 수 (본인 작성 제외)

const PB_EPOCH = new Date(0);

const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const rs = await prisma.playbookReadState.findUnique({ where: { userId } });
    const since = rs?.lastReadAt || PB_EPOCH;
    const [runs, updates] = await Promise.all([
      prisma.playbookRun.count({ where: { createdAt: { gt: since }, createdBy: { not: userId } } }),
      prisma.runUpdate.count({ where: { createdAt: { gt: since }, createdBy: { not: userId } } }),
    ]);
    res.json({ total: runs + updates });
  } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    await prisma.playbookReadState.upsert({
      where: { userId },
      create: { userId, lastReadAt: now },
      update: { lastReadAt: now },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = {
  setIO,
  getUnreadCount, markRead,
  listRuns, getRun, createRun, updateRun,
  finishRun, pauseRun, resumeRun, archiveRun, deleteRun,
  addStep, deleteStep, updateStep,
  addParticipant, removeParticipant,
  addUpdate, deleteUpdate,
  getChecklists, addChecklist, updateChecklist, deleteChecklist,
  getStats,
};
