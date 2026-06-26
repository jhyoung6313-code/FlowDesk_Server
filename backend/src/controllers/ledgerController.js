const XLSX = require('xlsx');
const prisma = require('../lib/prisma');

/* ── 기본 카테고리 시드 ── */
const DEFAULT_CATEGORIES = [
  { name: '급여', type: 'income', color: '#52c41a' },
  { name: '부업/기타수입', type: 'income', color: '#13c2c2' },
  { name: '투자수익', type: 'income', color: '#1677ff' },
  { name: '식비', type: 'expense', color: '#fa541c' },
  { name: '교통비', type: 'expense', color: '#fa8c16' },
  { name: '주거비', type: 'expense', color: '#eb2f96' },
  { name: '의료/건강', type: 'expense', color: '#722ed1' },
  { name: '통신비', type: 'expense', color: '#2f54eb' },
  { name: '쇼핑', type: 'expense', color: '#f5222d' },
  { name: '문화/여가', type: 'expense', color: '#d4b106' },
  { name: '업무비', type: 'expense', color: '#389e0d' },
  { name: '기타지출', type: 'expense', color: '#8c8c8c' },
];

async function ensureDefaultCategories() {
  const count = await prisma.ledgerCategory.count({ where: { isDefault: true } });
  if (count === 0) {
    await prisma.ledgerCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, isDefault: true })),
    });
  }
}

/* ── 카테고리 ── */
const listCategories = async (req, res, next) => {
  try {
    await ensureDefaultCategories();
    const cats = await prisma.ledgerCategory.findMany({ orderBy: [{ type: 'asc' }, { id: 'asc' }] });
    res.json(cats);
  } catch (err) { next(err); }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, type, color } = req.body;
    if (!name || !type) return res.status(400).json({ error: '이름과 유형은 필수입니다.' });
    const cat = await prisma.ledgerCategory.create({ data: { name, type, color: color || '#1677ff' } });
    res.status(201).json(cat);
  } catch (err) { next(err); }
};

const updateCategory = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, color } = req.body;
    const cat = await prisma.ledgerCategory.update({ where: { id }, data: { name, color } });
    res.json(cat);
  } catch (err) { next(err); }
};

const deleteCategory = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const entryCount = await prisma.ledgerEntry.count({ where: { categoryId: id } });
    if (entryCount > 0) return res.status(400).json({ error: '해당 카테고리에 거래 내역이 있어 삭제할 수 없습니다.' });
    await prisma.ledgerCategory.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

/* ── 거래 내역 ── */
const listEntries = async (req, res, next) => {
  try {
    const { year, month, type, categoryId, page = 1, limit = 50 } = req.query;
    const where = {};
    if (type) where.type = type;
    if (categoryId) where.categoryId = Number(categoryId);
    if (year && month) {
      const y = Number(year), m = Number(month);
      where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    } else if (year) {
      const y = Number(year);
      where.date = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: { category: true, creator: { select: { id: true, displayName: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: Number(limit),
      }),
      prisma.ledgerEntry.count({ where }),
    ]);
    res.json({ entries, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
};

const createEntry = async (req, res, next) => {
  try {
    const { type, amount, categoryId, date, memo } = req.body;
    if (!type || !amount || !categoryId || !date)
      return res.status(400).json({ error: '유형, 금액, 카테고리, 날짜는 필수입니다.' });
    const entry = await prisma.ledgerEntry.create({
      data: {
        type,
        amount: Number(amount),
        categoryId: Number(categoryId),
        date: new Date(date),
        memo: memo || null,
        createdBy: req.user.id,
      },
      include: { category: true, creator: { select: { id: true, displayName: true } } },
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
};

const updateEntry = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { type, amount, categoryId, date, memo } = req.body;
    const entry = await prisma.ledgerEntry.update({
      where: { id },
      data: {
        type,
        amount: amount != null ? Number(amount) : undefined,
        categoryId: categoryId != null ? Number(categoryId) : undefined,
        date: date ? new Date(date) : undefined,
        memo: memo !== undefined ? (memo || null) : undefined,
      },
      include: { category: true, creator: { select: { id: true, displayName: true } } },
    });
    res.json(entry);
  } catch (err) { next(err); }
};

const deleteEntry = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.ledgerEntry.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

/* ── 요약 통계 ── */
const summary = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const y = year ? Number(year) : new Date().getFullYear();
    const targetMonth = month ? Number(month) : new Date().getMonth() + 1;

    // 월별 수입/지출 (해당 연도 12개월)
    const monthlyData = [];
    for (let m = 1; m <= 12; m++) {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      const [incomeRes, expenseRes] = await Promise.all([
        prisma.ledgerEntry.aggregate({ where: { type: 'income', date: { gte: start, lt: end } }, _sum: { amount: true } }),
        prisma.ledgerEntry.aggregate({ where: { type: 'expense', date: { gte: start, lt: end } }, _sum: { amount: true } }),
      ]);
      monthlyData.push({
        month: m,
        income: Number(incomeRes._sum.amount || 0),
        expense: Number(expenseRes._sum.amount || 0),
      });
    }

    const start = new Date(y, targetMonth - 1, 1);
    const end = new Date(y, targetMonth, 1);

    // 이번 달 카테고리별 지출
    const categoryExpense = await prisma.ledgerEntry.groupBy({
      by: ['categoryId'],
      where: { type: 'expense', date: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    const catIds = categoryExpense.map((c) => c.categoryId);
    const cats = await prisma.ledgerCategory.findMany({ where: { id: { in: catIds } } });
    const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));

    const categoryBreakdown = categoryExpense.map((c) => ({
      categoryId: c.categoryId,
      name: catMap[c.categoryId]?.name || '기타',
      color: catMap[c.categoryId]?.color || '#8c8c8c',
      amount: Number(c._sum.amount || 0),
    })).sort((a, b) => b.amount - a.amount);

    // 이번 달 합계
    const [thisIncome, thisExpense] = await Promise.all([
      prisma.ledgerEntry.aggregate({ where: { type: 'income', date: { gte: start, lt: end } }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { type: 'expense', date: { gte: start, lt: end } }, _sum: { amount: true } }),
    ]);

    // 예산 정보 (지출 카테고리 전체 + 이번 달 예산 설정 + 실제 지출)
    const allExpenseCats = await prisma.ledgerCategory.findMany({ where: { type: 'expense' }, orderBy: { id: 'asc' } });
    const budgets = await prisma.ledgerBudget.findMany({ where: { year: y, month: targetMonth } });
    const budgetMap = Object.fromEntries(budgets.map((b) => [b.categoryId, Number(b.amount)]));
    const actualMap = Object.fromEntries(categoryExpense.map((c) => [c.categoryId, Number(c._sum.amount || 0)]));

    const budgetSummary = allExpenseCats.map((cat) => ({
      categoryId: cat.id,
      name: cat.name,
      color: cat.color,
      budget: budgetMap[cat.id] || null,
      actual: actualMap[cat.id] || 0,
    })).filter((b) => b.budget !== null || b.actual > 0);

    res.json({
      year: y,
      month: targetMonth,
      thisMonth: {
        income: Number(thisIncome._sum.amount || 0),
        expense: Number(thisExpense._sum.amount || 0),
        balance: Number(thisIncome._sum.amount || 0) - Number(thisExpense._sum.amount || 0),
      },
      monthlyData,
      categoryBreakdown,
      budgetSummary,
    });
  } catch (err) { next(err); }
};

/* ── 예산 ── */
const listBudgets = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year, month 필수입니다.' });
    const budgets = await prisma.ledgerBudget.findMany({
      where: { year: Number(year), month: Number(month) },
      include: { category: true },
    });
    res.json(budgets);
  } catch (err) { next(err); }
};

const upsertBudget = async (req, res, next) => {
  try {
    const { categoryId, year, month, amount } = req.body;
    if (!categoryId || !year || !month || amount == null)
      return res.status(400).json({ error: 'categoryId, year, month, amount 필수입니다.' });
    const budget = await prisma.ledgerBudget.upsert({
      where: { categoryId_year_month: { categoryId: Number(categoryId), year: Number(year), month: Number(month) } },
      create: { categoryId: Number(categoryId), year: Number(year), month: Number(month), amount: Number(amount) },
      update: { amount: Number(amount) },
    });
    res.json(budget);
  } catch (err) { next(err); }
};

const deleteBudget = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.ledgerBudget.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

/* ── 반복 거래 ── */
const listRecurrings = async (req, res, next) => {
  try {
    const recurrings = await prisma.ledgerRecurring.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(recurrings);
  } catch (err) { next(err); }
};

const createRecurring = async (req, res, next) => {
  try {
    const { type, amount, categoryId, dayOfMonth, memo } = req.body;
    if (!type || !amount || !categoryId)
      return res.status(400).json({ error: '유형, 금액, 카테고리는 필수입니다.' });
    const rec = await prisma.ledgerRecurring.create({
      data: {
        type,
        amount: Number(amount),
        categoryId: Number(categoryId),
        dayOfMonth: dayOfMonth ? Number(dayOfMonth) : 1,
        memo: memo || null,
        createdBy: req.user.id,
      },
      include: { category: true },
    });
    res.status(201).json(rec);
  } catch (err) { next(err); }
};

const updateRecurring = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { type, amount, categoryId, dayOfMonth, memo, isActive } = req.body;
    const rec = await prisma.ledgerRecurring.update({
      where: { id },
      data: {
        type,
        amount: amount != null ? Number(amount) : undefined,
        categoryId: categoryId != null ? Number(categoryId) : undefined,
        dayOfMonth: dayOfMonth != null ? Number(dayOfMonth) : undefined,
        memo: memo !== undefined ? (memo || null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
      include: { category: true },
    });
    res.json(rec);
  } catch (err) { next(err); }
};

const deleteRecurring = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.ledgerRecurring.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// 이번 달(또는 지정 월) 반복 거래 자동 생성
const applyRecurring = async (req, res, next) => {
  try {
    const { year, month } = req.body;
    const y = year ? Number(year) : new Date().getFullYear();
    const m = month ? Number(month) : new Date().getMonth() + 1;

    const actives = await prisma.ledgerRecurring.findMany({ where: { isActive: true } });
    let created = 0;

    for (const rec of actives) {
      // 이미 이 반복거래로 생성된 항목이 해당 월에 있으면 스킵
      const day = Math.min(rec.dayOfMonth, new Date(y, m, 0).getDate()); // 월말 보정
      const entryDate = new Date(y, m - 1, day);
      const existing = await prisma.ledgerEntry.findFirst({
        where: { recurringId: rec.id, date: entryDate },
      });
      if (existing) continue;

      await prisma.ledgerEntry.create({
        data: {
          type: rec.type,
          amount: rec.amount,
          categoryId: rec.categoryId,
          date: entryDate,
          memo: rec.memo,
          recurringId: rec.id,
          createdBy: req.user.id,
        },
      });
      created++;
    }

    res.json({ created, message: `${created}건의 반복 거래가 추가되었습니다.` });
  } catch (err) { next(err); }
};

/* ── Excel 내보내기 ── */
const exportExcel = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const where = {};
    if (year && month) {
      const y = Number(year), m = Number(month);
      where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    } else if (year) {
      const y = Number(year);
      where.date = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    }

    const entries = await prisma.ledgerEntry.findMany({
      where,
      include: { category: true, creator: { select: { displayName: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const rows = entries.map((e) => ({
      날짜: e.date.toISOString().slice(0, 10),
      유형: e.type === 'income' ? '수입' : '지출',
      카테고리: e.category?.name || '',
      금액: Number(e.amount),
      메모: e.memo || '',
      작성자: e.creator?.displayName || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    const sheetName = year && month ? `${year}년${month}월` : year ? `${year}년` : '가계부';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const label = year && month ? `${year}년${String(month).padStart(2, '0')}월` : year || '전체';
    const filename = encodeURIComponent(`가계부_${label}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { next(err); }
};

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listEntries, createEntry, updateEntry, deleteEntry,
  summary,
  listBudgets, upsertBudget, deleteBudget,
  listRecurrings, createRecurring, updateRecurring, deleteRecurring, applyRecurring,
  exportExcel,
};
