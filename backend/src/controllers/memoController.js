const prisma = require('../lib/prisma');

// 허용 색상 (프론트 팔레트와 일치)
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'gray'];

/** GET /api/memos — 본인 메모만 (고정 우선, 정렬순) */
const list = async (req, res, next) => {
  try {
    const memos = await prisma.memo.findMany({
      where: { createdBy: req.user.id },
      orderBy: [{ pinned: 'desc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json(memos);
  } catch (err) {
    next(err);
  }
};

/** POST /api/memos */
const create = async (req, res, next) => {
  try {
    const { title, content, color, posX, posY } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: '내용은 필수입니다.' });
    }
    const memo = await prisma.memo.create({
      data: {
        title: title?.trim() || null,
        content: content.trim(),
        color: COLORS.includes(color) ? color : 'yellow',
        posX: Number.isInteger(posX) ? posX : 0,
        posY: Number.isInteger(posY) ? posY : 0,
        createdBy: req.user.id,
      },
    });
    res.status(201).json(memo);
  } catch (err) {
    next(err);
  }
};

/** PUT /api/memos/:id — 본인 메모만 수정 */
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.memo.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
    if (existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const { title, content, color, pinned, posX, posY, sortOrder } = req.body;
    const data = {};
    if (title !== undefined) data.title = title?.trim() || null;
    if (content !== undefined) {
      if (!content?.trim()) return res.status(400).json({ error: '내용은 필수입니다.' });
      data.content = content.trim();
    }
    if (color !== undefined && COLORS.includes(color)) data.color = color;
    if (pinned !== undefined) data.pinned = !!pinned;
    if (Number.isInteger(posX)) data.posX = posX;
    if (Number.isInteger(posY)) data.posY = posY;
    if (Number.isInteger(sortOrder)) data.sortOrder = sortOrder;

    const memo = await prisma.memo.update({ where: { id }, data });
    res.json(memo);
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/memos/:id — 본인 메모만 삭제 */
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.memo.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
    if (existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.memo.delete({ where: { id } });
    res.json({ message: '메모가 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
