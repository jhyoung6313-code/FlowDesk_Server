const prisma = require('../lib/prisma');

// GET /api/departments — 부서 목록 (소속 팀 + 인원/업무 수 포함)
const list = async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        teams: {
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
          include: { _count: { select: { tasks: true, users: true } } },
        },
        _count: { select: { users: true } },
      },
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
};

// POST /api/departments
const create = async (req, res, next) => {
  try {
    const { name, description, order } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '부서명은 필수입니다.' });
    }
    const exists = await prisma.department.findUnique({ where: { name: name.trim() } });
    if (exists) return res.status(409).json({ error: '이미 존재하는 부서명입니다.' });

    const department = await prisma.department.create({
      data: { name: name.trim(), description: description || null, order: order ?? 0 },
    });
    res.status(201).json(department);
  } catch (err) {
    next(err);
  }
};

// PUT /api/departments/:id
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, order } = req.body;

    if (name) {
      const exists = await prisma.department.findFirst({
        where: { name: name.trim(), NOT: { id } },
      });
      if (exists) return res.status(409).json({ error: '이미 존재하는 부서명입니다.' });
    }

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description || null }),
        ...(order !== undefined && { order }),
      },
    });
    res.json(department);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/departments/:id — 소속 팀도 함께 삭제(cascade)
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.department.delete({ where: { id } });
    res.json({ message: '부서가 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
