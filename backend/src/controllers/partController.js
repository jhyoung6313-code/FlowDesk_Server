
const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const parts = await prisma.part.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
    res.json(parts);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: '파트명은 필수입니다.' });
    }

    const exists = await prisma.part.findUnique({ where: { name } });
    if (exists) {
      return res.status(409).json({ error: '이미 존재하는 파트명입니다.' });
    }

    const part = await prisma.part.create({ data: { name, description } });
    res.status(201).json(part);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (name) {
      const exists = await prisma.part.findFirst({
        where: { name, NOT: { id: Number(id) } },
      });
      if (exists) {
        return res.status(409).json({ error: '이미 존재하는 파트명입니다.' });
      }
    }

    const part = await prisma.part.update({
      where: { id: Number(id) },
      data: { name, description },
    });
    res.json(part);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.part.delete({ where: { id: Number(id) } });
    res.json({ message: '파트가 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
