
const prisma = require('../lib/prisma');

const milestoneInclude = {
  creator: { select: { id: true, displayName: true } },
};

const list = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start || end) {
      where.date = {};
      if (start) where.date.gte = new Date(start);
      if (end)   where.date.lte = new Date(end);
    }
    const items = await prisma.milestone.findMany({
      where,
      include: milestoneInclude,
      orderBy: { date: 'asc' },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, date, color, description } = req.body;
    if (!name) return res.status(400).json({ error: '마일스톤 이름은 필수입니다.' });
    if (!date) return res.status(400).json({ error: '날짜는 필수입니다.' });

    const item = await prisma.milestone.create({
      data: {
        name,
        date: new Date(date),
        color: color || '#722ed1',
        description,
        createdBy: req.user.id,
      },
      include: milestoneInclude,
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, date, color, description } = req.body;

    const existing = await prisma.milestone.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '마일스톤을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const item = await prisma.milestone.update({
      where: { id },
      data: {
        name,
        date: date ? new Date(date) : undefined,
        color,
        description,
      },
      include: milestoneInclude,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.milestone.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '마일스톤을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.milestone.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
