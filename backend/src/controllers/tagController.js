
const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
    res.json(tags);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: '태그명은 필수입니다.' });

    const tag = await prisma.tag.create({
      data: { name: name.trim(), color: color || '#1677ff' },
    });
    res.status(201).json(tag);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: '이미 존재하는 태그명입니다.' });
    }
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, color } = req.body;
    const tag = await prisma.tag.update({
      where: { id },
      data: { name, color },
    });
    res.json(tag);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.tag.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
