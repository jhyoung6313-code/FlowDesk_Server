
const prisma = require('../lib/prisma');

/** GET /api/calendar-notes?start=YYYY-MM-DD&end=YYYY-MM-DD */
const list = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start || end) {
      where.date = {};
      if (start) where.date.gte = new Date(start);
      if (end)   where.date.lte = new Date(end);
    }
    const notes = await prisma.calendarNote.findMany({
      where,
      include: { creator: { select: { id: true, displayName: true } } },
      orderBy: { date: 'asc' },
    });
    res.json(notes);
  } catch (err) {
    next(err);
  }
};

/** POST /api/calendar-notes */
const create = async (req, res, next) => {
  try {
    const { date, content } = req.body;
    if (!date || !content?.trim()) {
      return res.status(400).json({ error: '날짜와 내용은 필수입니다.' });
    }
    const note = await prisma.calendarNote.create({
      data: {
        date: new Date(date),
        content: content.trim(),
        createdBy: req.user.id,
      },
      include: { creator: { select: { id: true, displayName: true } } },
    });
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
};

/** PUT /api/calendar-notes/:id */
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: '내용은 필수입니다.' });
    }
    const existing = await prisma.calendarNote.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '임시업무를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    const note = await prisma.calendarNote.update({
      where: { id },
      data: { content: content.trim() },
      include: { creator: { select: { id: true, displayName: true } } },
    });
    res.json(note);
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/calendar-notes/:id */
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.calendarNote.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '임시업무를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.calendarNote.delete({ where: { id } });
    res.json({ message: '임시업무가 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
