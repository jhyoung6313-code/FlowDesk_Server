const prisma = require('../lib/prisma');

// GET /api/approval-types
const list = async (req, res, next) => {
  try {
    const types = await prisma.approvalFormType.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      include: { creator: { select: { id: true, displayName: true } } },
    });
    res.json(types);
  } catch (err) {
    next(err);
  }
};

// POST /api/approval-types  (admin only)
const create = async (req, res, next) => {
  try {
    const { name, description, parentId, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: '이름은 필수입니다.' });

    const siblings = await prisma.approvalFormType.findMany({
      where: { parentId: parentId ? Number(parentId) : null },
      orderBy: { order: 'desc' },
      take: 1,
    });
    const order = siblings.length > 0 ? siblings[0].order + 1 : 0;

    const formType = await prisma.approvalFormType.create({
      data: {
        name,
        description: description ?? null,
        parentId: parentId ? Number(parentId) : null,
        icon: icon ?? null,
        color: color ?? null,
        order,
        createdBy: req.user.id,
      },
    });
    res.status(201).json(formType);
  } catch (err) {
    next(err);
  }
};

// PUT /api/approval-types/:id  (admin only)
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, parentId, icon, color, isActive } = req.body;

    const formType = await prisma.approvalFormType.findUnique({ where: { id } });
    if (!formType) return res.status(404).json({ error: '결재 양식 종류를 찾을 수 없습니다.' });

    const updated = await prisma.approvalFormType.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(parentId !== undefined && { parentId: parentId ? Number(parentId) : null }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/approval-types/:id  (admin only)
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const formType = await prisma.approvalFormType.findUnique({ where: { id } });
    if (!formType) return res.status(404).json({ error: '결재 양식 종류를 찾을 수 없습니다.' });

    await prisma.approvalFormType.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// PUT /api/approval-types/reorder  (admin only)
const reorder = async (req, res, next) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: '배열 형식이 필요합니다.' });

    await prisma.$transaction(
      items.map(({ id, order, parentId }) =>
        prisma.approvalFormType.update({
          where: { id: Number(id) },
          data: { order: Number(order), parentId: parentId ? Number(parentId) : null },
        })
      )
    );
    res.json({ message: '순서가 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove, reorder };
