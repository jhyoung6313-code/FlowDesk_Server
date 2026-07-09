const prisma = require('../lib/prisma');

// GET /api/teams  (query: departmentId) — 업무/사용자 필터용 평면 목록
const list = async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    const teams = await prisma.team.findMany({
      where: { ...(departmentId && { departmentId: Number(departmentId) }) },
      orderBy: [{ departmentId: 'asc' }, { order: 'asc' }, { name: 'asc' }],
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { tasks: true, users: true } },
      },
    });
    res.json(teams);
  } catch (err) {
    next(err);
  }
};

// POST /api/teams
const create = async (req, res, next) => {
  try {
    const { name, departmentId, description, order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '팀명은 필수입니다.' });
    if (!departmentId) return res.status(400).json({ error: '소속 부서는 필수입니다.' });

    const dept = await prisma.department.findUnique({ where: { id: Number(departmentId) } });
    if (!dept) return res.status(404).json({ error: '부서를 찾을 수 없습니다.' });

    const exists = await prisma.team.findFirst({
      where: { departmentId: Number(departmentId), name: name.trim() },
    });
    if (exists) return res.status(409).json({ error: '같은 부서에 동일한 팀명이 있습니다.' });

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        departmentId: Number(departmentId),
        description: description || null,
        order: order ?? 0,
      },
      include: { department: { select: { id: true, name: true } } },
    });
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
};

// PUT /api/teams/:id
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, departmentId, description, order } = req.body;

    const current = await prisma.team.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: '팀을 찾을 수 없습니다.' });

    const targetDeptId = departmentId !== undefined ? Number(departmentId) : current.departmentId;
    const targetName = name !== undefined ? name.trim() : current.name;
    const dup = await prisma.team.findFirst({
      where: { departmentId: targetDeptId, name: targetName, NOT: { id } },
    });
    if (dup) return res.status(409).json({ error: '같은 부서에 동일한 팀명이 있습니다.' });

    const team = await prisma.team.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: targetName }),
        ...(departmentId !== undefined && { departmentId: targetDeptId }),
        ...(description !== undefined && { description: description || null }),
        ...(order !== undefined && { order }),
      },
      include: { department: { select: { id: true, name: true } } },
    });
    res.json(team);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/teams/:id — 연결된 업무의 팀 정보는 해제(SetNull)
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.task.updateMany({ where: { partId: id }, data: { partId: null } });
    await prisma.recurringTask.updateMany({ where: { partId: id }, data: { partId: null } });
    await prisma.taskTemplate.updateMany({ where: { partId: id }, data: { partId: null } });
    await prisma.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
    await prisma.team.delete({ where: { id } });
    res.json({ message: '팀이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
