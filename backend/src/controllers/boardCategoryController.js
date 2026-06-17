const prisma = require('../lib/prisma');

const SCOPE_PERSONAL = 'personal';
const SCOPE_SHARED = 'shared';

// 사용자가 볼 수 있는 카테고리 조건: 공용 전체 + 본인 소유 개인용
function visibleWhere(userId) {
  return {
    OR: [
      { scope: SCOPE_SHARED },
      { scope: SCOPE_PERSONAL, ownerId: userId },
    ],
  };
}

// 카테고리 수정/삭제 권한: 관리자, 생성자, (개인용은) 소유자
function canManage(cat, user) {
  if (user.role === 'admin') return true;
  if (cat.createdBy === user.id) return true;
  if (cat.scope === SCOPE_PERSONAL && cat.ownerId === user.id) return true;
  return false;
}

const list = async (req, res, next) => {
  try {
    const categories = await prisma.boardCategory.findMany({
      where: visibleWhere(req.user.id),
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    res.json(categories);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, icon, color, scope = SCOPE_SHARED, parentId } = req.body;
    if (!name) return res.status(400).json({ error: '카테고리 이름은 필수입니다.' });
    const normalizedScope = scope === SCOPE_PERSONAL ? SCOPE_PERSONAL : SCOPE_SHARED;

    const maxOrder = await prisma.boardCategory.aggregate({
      where: { parentId: parentId ? Number(parentId) : null },
      _max: { order: true },
    });

    const category = await prisma.boardCategory.create({
      data: {
        name,
        icon: icon ?? null,
        color: color ?? null,
        scope: normalizedScope,
        ownerId: normalizedScope === SCOPE_PERSONAL ? req.user.id : null,
        parentId: parentId ? Number(parentId) : null,
        order: (maxOrder._max.order ?? -1) + 1,
        createdBy: req.user.id,
      },
    });
    res.status(201).json(category);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cat = await prisma.boardCategory.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
    if (!canManage(cat, req.user)) return res.status(403).json({ error: '권한이 없습니다.' });

    const { name, icon, color, parentId, order } = req.body;
    const category = await prisma.boardCategory.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        icon: icon !== undefined ? (icon ?? null) : undefined,
        color: color !== undefined ? (color ?? null) : undefined,
        parentId: parentId !== undefined ? (parentId ? Number(parentId) : null) : undefined,
        order: order !== undefined ? Number(order) : undefined,
      },
    });
    res.json(category);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cat = await prisma.boardCategory.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
    if (!canManage(cat, req.user)) return res.status(403).json({ error: '권한이 없습니다.' });
    // 소속 보드의 categoryId 는 FK(SetNull)로 자동 해제, 하위 카테고리는 Cascade 삭제
    await prisma.boardCategory.delete({ where: { id } });
    res.json({ message: '카테고리가 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// 카테고리 순서/부모 일괄 갱신: [{ id, order, parentId }]
const reorder = async (req, res, next) => {
  try {
    const { items = [] } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items 배열이 필요합니다.' });
    const ids = items.map((it) => Number(it.id));
    const cats = await prisma.boardCategory.findMany({ where: { id: { in: ids } } });
    for (const cat of cats) {
      if (!canManage(cat, req.user)) {
        return res.status(403).json({ error: '권한이 없는 카테고리가 포함되어 있습니다.' });
      }
    }
    await prisma.$transaction(
      items.map((it) =>
        prisma.boardCategory.update({
          where: { id: Number(it.id) },
          data: {
            order: Number(it.order) || 0,
            parentId: it.parentId !== undefined ? (it.parentId ? Number(it.parentId) : null) : undefined,
          },
        })
      )
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = { list, create, update, remove, reorder };
