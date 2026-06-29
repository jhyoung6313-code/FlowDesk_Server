const prisma = require('../lib/prisma');

// GET /api/bbs-categories
const list = async (req, res, next) => {
  try {
    const categories = await prisma.bbsCategory.findMany({
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      include: { creator: { select: { id: true, displayName: true } } },
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
};

// POST /api/bbs-categories  (admin only)
const create = async (req, res, next) => {
  try {
    const { name, description, parentId, icon, color, writeRole, showOnDashboard } = req.body;
    if (!name) return res.status(400).json({ error: '카테고리 이름은 필수입니다.' });

    const siblings = await prisma.bbsCategory.findMany({
      where: { parentId: parentId ?? null },
      orderBy: { order: 'desc' },
      take: 1,
    });
    const order = siblings.length > 0 ? siblings[0].order + 1 : 0;

    const category = await prisma.bbsCategory.create({
      data: {
        name,
        description: description ?? null,
        parentId: parentId ? Number(parentId) : null,
        icon: icon ?? null,
        color: color ?? null,
        writeRole: writeRole ?? 'all',
        showOnDashboard: showOnDashboard ?? false,
        order,
        createdBy: req.user.id,
      },
    });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
};

// PUT /api/bbs-categories/:id  (admin only)
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, parentId, icon, color, writeRole, isActive, showOnDashboard } = req.body;

    const category = await prisma.bbsCategory.findUnique({ where: { id } });
    if (!category) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });

    const updated = await prisma.bbsCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(parentId !== undefined && { parentId: parentId ? Number(parentId) : null }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(writeRole !== undefined && { writeRole }),
        ...(isActive !== undefined && { isActive }),
        ...(showOnDashboard !== undefined && { showOnDashboard }),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/bbs-categories/:id  (admin only)
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const category = await prisma.bbsCategory.findUnique({ where: { id } });
    if (!category) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });

    await prisma.bbsCategory.delete({ where: { id } });
    res.json({ message: '카테고리가 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// PUT /api/bbs-categories/reorder  (admin only)
const reorder = async (req, res, next) => {
  try {
    const items = req.body; // [{id, order, parentId}]
    if (!Array.isArray(items)) return res.status(400).json({ error: '배열 형식이 필요합니다.' });

    await prisma.$transaction(
      items.map(({ id, order, parentId }) =>
        prisma.bbsCategory.update({
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

// GET /api/bbs-categories/dashboard
// 현재 사용자의 대시보드 게시판 목록 (관리자 지정 + 개인 지정)
const dashboardList = async (req, res, next) => {
  try {
    const admin = await prisma.bbsCategory.findMany({
      where: { isActive: true, showOnDashboard: true },
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
    });
    const adminIds = new Set(admin.map((c) => c.id));

    const personalLinks = await prisma.userDashboardBbsCategory.findMany({
      where: { userId: req.user.id, category: { isActive: true } },
      include: { category: true },
      orderBy: { createdAt: 'asc' },
    });
    // 관리자 지정과 중복되는 카테고리는 개인 목록에서 제외 (관리자 우선)
    const personal = personalLinks
      .map((l) => l.category)
      .filter((c) => !adminIds.has(c.id));

    res.json({ admin, personal });
  } catch (err) {
    next(err);
  }
};

// PUT /api/bbs-categories/dashboard  (본인 개인 설정 일괄 교체)
const setPersonal = async (req, res, next) => {
  try {
    const { categoryIds } = req.body;
    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ error: 'categoryIds 배열이 필요합니다.' });
    }
    const ids = [...new Set(categoryIds.map(Number).filter((n) => Number.isInteger(n)))];

    await prisma.$transaction([
      prisma.userDashboardBbsCategory.deleteMany({ where: { userId: req.user.id } }),
      prisma.userDashboardBbsCategory.createMany({
        data: ids.map((categoryId) => ({ userId: req.user.id, categoryId })),
        skipDuplicates: true,
      }),
    ]);
    res.json({ message: '개인 대시보드 게시판이 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove, reorder, dashboardList, setPersonal };
