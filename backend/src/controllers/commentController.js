const prisma = require('../lib/prisma');

// GET /api/tasks/:id/comments
const list = async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id);
    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    next(err);
  }
};

// POST /api/tasks/:id/comments
const create = async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id);
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: '내용을 입력해주세요.' });
    }
    const comment = await prisma.taskComment.create({
      data: { taskId, userId: req.user.id, content: content.trim() },
      include: { user: { select: { id: true, displayName: true } } },
    });
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

// PUT /api/tasks/comments/:commentId
const update = async (req, res, next) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: '내용을 입력해주세요.' });
    }
    const existing = await prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!existing) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    if (existing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    const comment = await prisma.taskComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: { user: { select: { id: true, displayName: true } } },
    });
    res.json(comment);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/tasks/comments/:commentId
const remove = async (req, res, next) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const existing = await prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!existing) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    if (existing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.taskComment.delete({ where: { id: commentId } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
