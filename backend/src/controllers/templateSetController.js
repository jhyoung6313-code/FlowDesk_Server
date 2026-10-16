// 템플릿 세트(F-41 확장) — 여러 업무 템플릿을 묶어 "새 프로젝트 킥오프" 등
// 한 번의 클릭으로 담당자·기한이 채워진 업무 여러 건을 일괄 생성한다.
const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const sets = await prisma.taskTemplateSet.findMany({
      include: {
        creator: { select: { id: true, displayName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sets.map((s) => ({ ...s, itemCount: s._count.items, _count: undefined })));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '세트 이름은 필수입니다.' });
    const set = await prisma.taskTemplateSet.create({
      data: { name: name.trim(), description: description || null, createdBy: req.user.id },
    });
    res.status(201).json(set);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description } = req.body;
    const existing = await prisma.taskTemplateSet.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '세트를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    const set = await prisma.taskTemplateSet.update({
      where: { id },
      data: { name: name?.trim(), description },
    });
    res.json(set);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.taskTemplateSet.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '세트를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    // 소속 템플릿은 삭제하지 않고 세트 소속만 해제(onDelete: SetNull)
    await prisma.taskTemplateSet.delete({ where: { id } });
    res.json({ message: '세트가 삭제되었습니다. (소속 템플릿은 유지되고 세트 소속만 해제됩니다)' });
  } catch (err) { next(err); }
};

// POST /api/template-sets/:id/apply  { kickoffDate: 'YYYY-MM-DD' }
// 세트에 속한 템플릿 전체를 kickoffDate + dayOffset을 마감일로 하는 실제 업무로 일괄 생성
const apply = async (req, res, next) => {
  try {
    const setId = Number(req.params.id);
    const { kickoffDate } = req.body;
    if (!kickoffDate) return res.status(400).json({ error: '기준일(kickoffDate)은 필수입니다.' });

    const set = await prisma.taskTemplateSet.findUnique({ where: { id: setId } });
    if (!set) return res.status(404).json({ error: '세트를 찾을 수 없습니다.' });

    const items = await prisma.taskTemplate.findMany({
      where: { setId },
      orderBy: [{ dayOffset: 'asc' }, { createdAt: 'asc' }],
    });
    if (items.length === 0) return res.status(400).json({ error: '세트에 포함된 템플릿이 없습니다.' });

    // 템플릿 생성 이후 담당자가 비활성화·팀이 삭제됐을 수 있음 — 세트 전체가 FK 위반으로
    // 롤백되는 것을 막기 위해 미리 유효성을 확인하고, 더 이상 유효하지 않은 참조는 건너뛴다
    // (해당 템플릿의 업무는 그래도 생성하되, 유효하지 않은 담당자/팀만 제외 + 응답에 경고로 알림).
    const allAssigneeIds = [...new Set(items.flatMap((t) => (t.assigneeIdsJson ? JSON.parse(t.assigneeIdsJson) : [])).map(Number))];
    const allPartIds = [...new Set(items.map((t) => t.partId).filter(Boolean))];
    const [validUsers, validParts] = await Promise.all([
      allAssigneeIds.length ? prisma.user.findMany({ where: { id: { in: allAssigneeIds }, isActive: true }, select: { id: true } }) : [],
      allPartIds.length ? prisma.team.findMany({ where: { id: { in: allPartIds } }, select: { id: true } }) : [],
    ]);
    const validUserIds = new Set(validUsers.map((u) => u.id));
    const validPartIds = new Set(validParts.map((p) => p.id));
    const warnings = [];

    const kickoff = new Date(kickoffDate);
    const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

    const createdTasks = await prisma.$transaction(
      items.map((tpl) => {
        const dueDate = addDays(kickoff, tpl.dayOffset || 0);
        const startDate = tpl.durationDays ? addDays(dueDate, -tpl.durationDays) : kickoff;
        const rawAssigneeIds = tpl.assigneeIdsJson ? JSON.parse(tpl.assigneeIdsJson).map(Number) : [];
        const assigneeIds = rawAssigneeIds.filter((uid) => validUserIds.has(uid));
        if (assigneeIds.length < rawAssigneeIds.length) {
          warnings.push(`"${tpl.title}": 더 이상 존재하지 않는 담당자 ${rawAssigneeIds.length - assigneeIds.length}명을 제외했습니다.`);
        }
        const partId = tpl.partId && validPartIds.has(tpl.partId) ? tpl.partId : null;
        if (tpl.partId && !partId) warnings.push(`"${tpl.title}": 소속 팀이 더 이상 존재하지 않아 팀 없이 생성했습니다.`);
        const extraNames = tpl.extraNamesJson ? JSON.parse(tpl.extraNamesJson) : [];
        return prisma.task.create({
          data: {
            title: tpl.title,
            description: tpl.description,
            partId,
            priority: tpl.priority,
            status: 'pending',
            startDate,
            dueDate,
            createdBy: req.user.id,
            assignees: assigneeIds.length ? { create: assigneeIds.map((uid) => ({ userId: uid })) } : undefined,
            extraAssignees: extraNames.length ? { create: extraNames.map((name) => ({ name })) } : undefined,
          },
          select: { id: true, title: true, dueDate: true },
        });
      })
    );

    res.status(201).json({
      message: `${createdTasks.length}건의 업무가 생성되었습니다.`,
      tasks: createdTasks,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (err) { next(err); }
};

module.exports = { list, create, update, remove, apply };
