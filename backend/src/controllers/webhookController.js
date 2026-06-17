const crypto = require('crypto');
const prisma = require('../lib/prisma');

const USER_SELECT = { id: true, displayName: true, avatarColor: true };

// 웹훅 목록 (플레이북 기준)
const listWebhooks = async (req, res, next) => {
  try {
    const playbookId = Number(req.params.playbookId);
    const hooks = await prisma.playbookWebhook.findMany({ where: { playbookId } });
    res.json(hooks);
  } catch (err) { next(err); }
};

// 웹훅 생성
const createWebhook = async (req, res, next) => {
  try {
    const playbookId = Number(req.params.playbookId);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '이름은 필수입니다.' });

    const pb = await prisma.playbook.findUnique({ where: { id: playbookId } });
    if (!pb) return res.status(404).json({ error: 'Playbook을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && pb.createdBy !== req.user.id)
      return res.status(403).json({ error: '권한이 없습니다.' });

    const token = crypto.randomBytes(32).toString('hex');
    const hook = await prisma.playbookWebhook.create({
      data: { playbookId, name: name.trim(), token },
    });
    res.status(201).json(hook);
  } catch (err) { next(err); }
};

// 웹훅 삭제
const deleteWebhook = async (req, res, next) => {
  try {
    const id = Number(req.params.hookId);
    const hook = await prisma.playbookWebhook.findUnique({ where: { id }, include: { playbook: true } });
    if (!hook) return res.status(404).json({ error: '웹훅을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && hook.playbook.createdBy !== req.user.id)
      return res.status(403).json({ error: '권한이 없습니다.' });
    await prisma.playbookWebhook.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// 웹훅 토큰으로 런 시작 (인증 불필요, 외부 호출)
const triggerWebhook = async (req, res, next) => {
  try {
    const { token } = req.params;
    const hook = await prisma.playbookWebhook.findUnique({
      where: { token },
      include: { playbook: { include: { steps: { orderBy: { order: 'asc' } } } } },
    });
    if (!hook || !hook.isActive) return res.status(404).json({ error: '유효하지 않은 웹훅입니다.' });

    const { name, severity, variableValues } = req.body || {};

    const run = await prisma.$transaction(async (tx) => {
      const newRun = await tx.playbookRun.create({
        data: {
          playbookId: hook.playbookId,
          name: name || `${hook.name} - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
          severity: severity || 'none',
          variableValues: variableValues ? JSON.stringify(variableValues) : null,
          ownerId: hook.playbook.createdBy,
          createdBy: hook.playbook.createdBy,
        },
      });

      const varValues = variableValues || {};
      for (const s of (hook.playbook.steps || [])) {
        const replaceVars = (text) => text?.replace(/\{\{(\w+)\}\}/g, (_, k) => varValues[k] ?? `{{${k}}}`);
        await tx.runStep.create({
          data: {
            runId: newRun.id,
            stepId: s.id,
            phaseId: s.phaseId,
            title: replaceVars(s.title),
            instructions: replaceVars(s.instructions),
            type: s.type,
            order: s.order,
            slaMins: s.slaMins,
            requireEvidence: s.requireEvidence,
            parallelGroup: s.parallelGroup ?? null,
          },
        });
      }

      await tx.runParticipant.create({
        data: { runId: newRun.id, userId: hook.playbook.createdBy, role: 'owner' },
      });
      await tx.runTimeline.create({
        data: { runId: newRun.id, eventType: 'run_started', createdBy: hook.playbook.createdBy },
      });

      return newRun;
    });

    res.status(201).json({ runId: run.id, message: 'Run이 시작되었습니다.' });
  } catch (err) { next(err); }
};

module.exports = { listWebhooks, createWebhook, deleteWebhook, triggerWebhook };
