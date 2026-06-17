
const prisma = require('../lib/prisma');

const templateInclude = {
  part: { select: { id: true, name: true } },
  creator: { select: { id: true, displayName: true } },
};

const list = async (req, res, next) => {
  try {
    const items = await prisma.taskTemplate.findMany({
      include: templateInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(items.map(parseJsonFields));
  } catch (err) {
    next(err);
  }
};

const detail = async (req, res, next) => {
  try {
    const item = await prisma.taskTemplate.findUnique({
      where: { id: Number(req.params.id) },
      include: templateInclude,
    });
    if (!item) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });
    res.json(parseJsonFields(item));
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, title, description, partId, priority, durationDays, assigneeIds, extraNames } = req.body;
    if (!name) return res.status(400).json({ error: '템플릿명은 필수입니다.' });
    if (!title) return res.status(400).json({ error: '업무 제목은 필수입니다.' });

    const item = await prisma.taskTemplate.create({
      data: {
        name,
        title,
        description,
        partId: partId ? Number(partId) : null,
        priority: priority || 'normal',
        durationDays: durationDays ? Number(durationDays) : null,
        assigneeIdsJson: assigneeIds ? JSON.stringify(assigneeIds) : null,
        extraNamesJson: extraNames ? JSON.stringify(extraNames) : null,
        createdBy: req.user.id,
      },
      include: templateInclude,
    });
    res.status(201).json(parseJsonFields(item));
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, title, description, partId, priority, durationDays, assigneeIds, extraNames } = req.body;

    const existing = await prisma.taskTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const item = await prisma.taskTemplate.update({
      where: { id },
      data: {
        name,
        title,
        description,
        partId: partId !== undefined ? (partId ? Number(partId) : null) : undefined,
        priority,
        durationDays: durationDays !== undefined ? (durationDays ? Number(durationDays) : null) : undefined,
        assigneeIdsJson: assigneeIds !== undefined ? (assigneeIds ? JSON.stringify(assigneeIds) : null) : undefined,
        extraNamesJson: extraNames !== undefined ? (extraNames ? JSON.stringify(extraNames) : null) : undefined,
      },
      include: templateInclude,
    });
    res.json(parseJsonFields(item));
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.taskTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.taskTemplate.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

function parseJsonFields(item) {
  return {
    ...item,
    assigneeIds: item.assigneeIdsJson ? JSON.parse(item.assigneeIdsJson) : [],
    extraNames:  item.extraNamesJson  ? JSON.parse(item.extraNamesJson)  : [],
  };
}

module.exports = { list, detail, create, update, remove };
