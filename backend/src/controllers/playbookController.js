const prisma = require('../lib/prisma');

const PLAYBOOK_INCLUDE = {
  creator: { select: { id: true, displayName: true, avatarColor: true } },
  phases: { orderBy: { order: 'asc' } },
  steps: {
    orderBy: { order: 'asc' },
    include: {
      phase: true,
      assigneeUser: { select: { id: true, displayName: true, avatarColor: true } },
    },
  },
  _count: { select: { runs: true } },
};

// 목록
const list = async (req, res, next) => {
  try {
    const { category, tag } = req.query;
    const where = {};
    if (category) where.category = category;
    if (tag) where.tags = { contains: tag };

    const items = await prisma.playbook.findMany({
      where,
      include: {
        creator: { select: { id: true, displayName: true, avatarColor: true } },
        phases: { orderBy: { order: 'asc' } },
        _count: { select: { runs: true, steps: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(items.map(parsePlaybook));
  } catch (err) { next(err); }
};

// 상세
const detail = async (req, res, next) => {
  try {
    const item = await prisma.playbook.findUnique({
      where: { id: Number(req.params.id) },
      include: PLAYBOOK_INCLUDE,
    });
    if (!item) return res.status(404).json({ error: 'Playbook을 찾을 수 없습니다.' });
    res.json(parsePlaybook(item));
  } catch (err) { next(err); }
};

// 생성
const create = async (req, res, next) => {
  try {
    const { name, description, category, tags, isPublic, variables, defaultParticipants, phases, steps } = req.body;
    if (!name) return res.status(400).json({ error: '이름은 필수입니다.' });

    const pb = await prisma.$transaction(async (tx) => {
      const playbook = await tx.playbook.create({
        data: {
          name, description,
          category: category || 'general',
          tags: tags ? JSON.stringify(tags) : null,
          isPublic: isPublic !== false,
          variables: variables ? JSON.stringify(variables) : null,
          defaultParticipants: defaultParticipants?.length ? JSON.stringify(defaultParticipants) : null,
          createdBy: req.user.id,
        },
      });

      // 페이즈 생성
      const phaseMap = {};
      if (phases?.length) {
        for (const ph of phases) {
          const created = await tx.playbookPhase.create({
            data: { playbookId: playbook.id, name: ph.name, color: ph.color || '#1677ff', order: ph.order ?? 0 },
          });
          if (ph._tempId !== undefined) phaseMap[ph._tempId] = created.id;
        }
      }

      // 스텝 생성
      if (steps?.length) {
        for (const s of steps) {
          await tx.playbookStep.create({
            data: {
              playbookId: playbook.id,
              phaseId: s.phaseTempId !== undefined ? (phaseMap[s.phaseTempId] ?? null) : (s.phaseId ?? null),
              title: s.title,
              instructions: s.instructions,
              type: s.type || 'task',
              order: s.order ?? 0,
              estimatedMins: s.estimatedMins ?? null,
              slaMins: s.slaMins ?? null,
              dueAt: s.dueAt ? new Date(s.dueAt) : null,
              assigneeMode: s.assigneeMode || 'unassigned',
              assigneeUserId: s.assigneeUserId ?? null,
              assigneeRole: s.assigneeRole ?? null,
              requireEvidence: s.requireEvidence ?? false,
              dependsOn: s.dependsOn ? JSON.stringify(s.dependsOn) : null,
              decisionOptions: s.decisionOptions ? JSON.stringify(s.decisionOptions) : null,
              parallelGroup: s.parallelGroup ?? null,
            },
          });
        }
      }

      return tx.playbook.findUnique({ where: { id: playbook.id }, include: PLAYBOOK_INCLUDE });
    });

    res.status(201).json(parsePlaybook(pb));
  } catch (err) { next(err); }
};

// 수정
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbook.findUnique({
      where: { id },
      include: { phases: { orderBy: { order: 'asc' } }, steps: { orderBy: { order: 'asc' } } },
    });
    if (!existing) return res.status(404).json({ error: 'Playbook을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id)
      return res.status(403).json({ error: '수정 권한이 없습니다.' });

    const { name, description, category, tags, isPublic, variables, defaultParticipants, phases, steps } = req.body;

    const pb = await prisma.$transaction(async (tx) => {
      // 수정 전 버전 스냅샷 저장
      await tx.playbookVersion.create({
        data: {
          playbookId: id,
          version: existing.version,
          snapshot: JSON.stringify({
            name: existing.name,
            description: existing.description,
            category: existing.category,
            tags: existing.tags,
            isPublic: existing.isPublic,
            variables: existing.variables,
            defaultParticipants: existing.defaultParticipants,
            phases: existing.phases,
            steps: existing.steps,
          }),
          createdBy: req.user.id,
        },
      });

      await tx.playbook.update({
        where: { id },
        data: {
          name, description,
          category,
          tags: tags !== undefined ? (tags ? JSON.stringify(tags) : null) : undefined,
          isPublic,
          variables: variables !== undefined ? (variables ? JSON.stringify(variables) : null) : undefined,
          defaultParticipants: defaultParticipants !== undefined ? (defaultParticipants?.length ? JSON.stringify(defaultParticipants) : null) : undefined,
          version: { increment: 1 },
        },
      });

      // 페이즈/스텝 전체 교체
      if (phases !== undefined) {
        await tx.playbookStep.deleteMany({ where: { playbookId: id } });
        await tx.playbookPhase.deleteMany({ where: { playbookId: id } });
        const phaseMap = {};
        for (const ph of phases) {
          const created = await tx.playbookPhase.create({
            data: { playbookId: id, name: ph.name, color: ph.color || '#1677ff', order: ph.order ?? 0 },
          });
          if (ph._tempId !== undefined) phaseMap[ph._tempId] = created.id;
        }
        if (steps?.length) {
          for (const s of steps) {
            await tx.playbookStep.create({
              data: {
                playbookId: id,
                phaseId: s.phaseTempId !== undefined ? (phaseMap[s.phaseTempId] ?? null) : (s.phaseId ?? null),
                title: s.title,
                instructions: s.instructions,
                type: s.type || 'task',
                order: s.order ?? 0,
                estimatedMins: s.estimatedMins ?? null,
                slaMins: s.slaMins ?? null,
                dueAt: s.dueAt ? new Date(s.dueAt) : null,
                assigneeMode: s.assigneeMode || 'unassigned',
                assigneeUserId: s.assigneeUserId ?? null,
                assigneeRole: s.assigneeRole ?? null,
                requireEvidence: s.requireEvidence ?? false,
                dependsOn: s.dependsOn ? JSON.stringify(s.dependsOn) : null,
                decisionOptions: s.decisionOptions ? JSON.stringify(s.decisionOptions) : null,
                parallelGroup: s.parallelGroup ?? null,
              },
            });
          }
        }
      }

      return tx.playbook.findUnique({ where: { id }, include: PLAYBOOK_INCLUDE });
    });

    res.json(parsePlaybook(pb));
  } catch (err) { next(err); }
};

// 삭제
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.playbook.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Playbook을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id)
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    await prisma.playbook.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// 복제
const clone = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const source = await prisma.playbook.findUnique({
      where: { id },
      include: { phases: { orderBy: { order: 'asc' } }, steps: { orderBy: { order: 'asc' } } },
    });
    if (!source) return res.status(404).json({ error: 'Playbook을 찾을 수 없습니다.' });

    const pb = await prisma.$transaction(async (tx) => {
      const cloned = await tx.playbook.create({
        data: {
          name: `${source.name} (복사본)`,
          description: source.description,
          category: source.category,
          tags: source.tags,
          isPublic: source.isPublic,
          variables: source.variables,
          defaultParticipants: source.defaultParticipants,
          createdBy: req.user.id,
        },
      });

      const phaseIdMap = {};
      for (const ph of source.phases) {
        const newPh = await tx.playbookPhase.create({
          data: { playbookId: cloned.id, name: ph.name, color: ph.color, order: ph.order },
        });
        phaseIdMap[ph.id] = newPh.id;
      }
      for (const s of source.steps) {
        await tx.playbookStep.create({
          data: {
            playbookId: cloned.id,
            phaseId: s.phaseId ? (phaseIdMap[s.phaseId] ?? null) : null,
            title: s.title, instructions: s.instructions,
            type: s.type, order: s.order,
            estimatedMins: s.estimatedMins, slaMins: s.slaMins,
            dueAt: s.dueAt,
            assigneeMode: s.assigneeMode,
            assigneeUserId: s.assigneeUserId,
            assigneeRole: s.assigneeRole,
            requireEvidence: s.requireEvidence,
            dependsOn: s.dependsOn,
            decisionOptions: s.decisionOptions,
            parallelGroup: s.parallelGroup ?? null,
          },
        });
      }

      return tx.playbook.findUnique({ where: { id: cloned.id }, include: PLAYBOOK_INCLUDE });
    });

    res.status(201).json(parsePlaybook(pb));
  } catch (err) { next(err); }
};

// 버전 이력 조회
const listVersions = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const versions = await prisma.playbookVersion.findMany({
      where: { playbookId: id },
      include: { creator: { select: { id: true, displayName: true } } },
      orderBy: { version: 'desc' },
    });
    res.json(versions.map(({ snapshot: _snap, ...rest }) => rest));
  } catch (err) { next(err); }
};

// 버전 롤백
const restoreVersion = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const versionId = Number(req.params.versionId);

    const existing = await prisma.playbook.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Playbook을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id)
      return res.status(403).json({ error: '롤백 권한이 없습니다.' });

    const ver = await prisma.playbookVersion.findUnique({ where: { id: versionId } });
    if (!ver || ver.playbookId !== id) return res.status(404).json({ error: '버전을 찾을 수 없습니다.' });

    const snap = JSON.parse(ver.snapshot);

    const pb = await prisma.$transaction(async (tx) => {
      // 현재 버전 스냅샷 저장
      const cur = await tx.playbook.findUnique({
        where: { id },
        include: { phases: { orderBy: { order: 'asc' } }, steps: { orderBy: { order: 'asc' } } },
      });
      await tx.playbookVersion.create({
        data: {
          playbookId: id,
          version: cur.version,
          snapshot: JSON.stringify({ name: cur.name, description: cur.description, category: cur.category, tags: cur.tags, isPublic: cur.isPublic, variables: cur.variables, defaultParticipants: cur.defaultParticipants, phases: cur.phases, steps: cur.steps }),
          createdBy: req.user.id,
        },
      });

      // 롤백 적용
      await tx.playbook.update({
        where: { id },
        data: {
          name: snap.name, description: snap.description, category: snap.category,
          tags: snap.tags, isPublic: snap.isPublic, variables: snap.variables,
          defaultParticipants: snap.defaultParticipants ?? null,
          version: { increment: 1 },
        },
      });

      // 페이즈/스텝 재구성
      await tx.playbookStep.deleteMany({ where: { playbookId: id } });
      await tx.playbookPhase.deleteMany({ where: { playbookId: id } });
      const phaseMap = {};
      for (const ph of (snap.phases || [])) {
        const created = await tx.playbookPhase.create({
          data: { playbookId: id, name: ph.name, color: ph.color || '#1677ff', order: ph.order ?? 0 },
        });
        phaseMap[ph.id] = created.id;
      }
      for (const s of (snap.steps || [])) {
        await tx.playbookStep.create({
          data: {
            playbookId: id,
            phaseId: s.phaseId ? (phaseMap[s.phaseId] ?? null) : null,
            title: s.title, instructions: s.instructions, type: s.type, order: s.order,
            estimatedMins: s.estimatedMins, slaMins: s.slaMins, dueAt: s.dueAt,
            assigneeMode: s.assigneeMode, assigneeUserId: s.assigneeUserId, assigneeRole: s.assigneeRole,
            requireEvidence: s.requireEvidence, dependsOn: s.dependsOn, decisionOptions: s.decisionOptions,
            parallelGroup: s.parallelGroup ?? null,
          },
        });
      }
      return tx.playbook.findUnique({ where: { id }, include: PLAYBOOK_INCLUDE });
    });

    res.json(parsePlaybook(pb));
  } catch (err) { next(err); }
};

function parsePlaybook(item) {
  return {
    ...item,
    tags: item.tags ? JSON.parse(item.tags) : [],
    variables: item.variables ? JSON.parse(item.variables) : [],
    defaultParticipants: item.defaultParticipants ? JSON.parse(item.defaultParticipants) : [],
    steps: item.steps?.map((s) => ({
      ...s,
      dependsOn: s.dependsOn ? JSON.parse(s.dependsOn) : [],
      decisionOptions: s.decisionOptions ? JSON.parse(s.decisionOptions) : [],
    })),
  };
}

module.exports = { list, detail, create, update, remove, clone, listVersions, restoreVersion };
