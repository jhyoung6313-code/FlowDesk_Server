const prisma = require('../lib/prisma');

const TYPES = ['temporary', 'substitute', 'legal', 'etc'];

/** GET /api/holidays?year=2026 또는 ?start=&end= */
const list = async (req, res, next) => {
  try {
    const { year, start, end } = req.query;
    const where = {};
    if (year) {
      where.date = { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) };
    } else if (start || end) {
      where.date = {};
      if (start) where.date.gte = new Date(start);
      if (end) where.date.lte = new Date(end);
    }
    const holidays = await prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
    res.json(holidays);
  } catch (err) {
    next(err);
  }
};

/** POST /api/holidays (admin) — 같은 날짜면 덮어쓰기(upsert) */
const create = async (req, res, next) => {
  try {
    const { date, name, type } = req.body;
    if (!date) return res.status(400).json({ error: '날짜는 필수입니다.' });
    if (!name?.trim()) return res.status(400).json({ error: '공휴일명은 필수입니다.' });
    const t = TYPES.includes(type) ? type : 'temporary';
    const d = new Date(date);
    const holiday = await prisma.holiday.upsert({
      where: { date: d },
      update: { name: name.trim(), type: t },
      create: { date: d, name: name.trim(), type: t, createdBy: req.user.id },
    });
    res.status(201).json(holiday);
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/holidays/:id (admin) */
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '공휴일을 찾을 수 없습니다.' });
    await prisma.holiday.delete({ where: { id } });
    res.json({ message: '공휴일이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, remove };
