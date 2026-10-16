const XLSX = require('xlsx');
const prisma = require('../lib/prisma');

/* 가계부는 개인용이다 — 모든 거래·예산·반복거래는 소유자(본인)에게만 보이고 수정/삭제된다.
   카테고리: userId = NULL 이면 시스템 기본(전원 공용, 관리자만 수정), 값이 있으면 그 사용자의 개인 카테고리. */

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

/* 사용자가 쓸 수 있는 카테고리: 시스템 기본 + 본인 것 */
const visibleCategory = (uid) => ({ OR: [{ userId: null }, { userId: uid }] });

/* 카테고리 id 가 본인에게 허용된 것인지 확인 (타인 개인 카테고리를 거래에 쓰는 것 방지) */
async function findUsableCategory(categoryId, uid) {
  if (!Number.isInteger(categoryId)) return null;
  return prisma.ledgerCategory.findFirst({ where: { id: categoryId, ...visibleCategory(uid) } });
}

const isAdmin = (req) => req.user.role === 'admin';

/* ── 카테고리 ── */
const listCategories = async (req, res, next) => {
  try {
    await ensureDefaultCategories();
    const cats = await prisma.ledgerCategory.findMany({
      where: visibleCategory(req.user.id),
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
    });
    res.json(cats);
  } catch (err) { next(err); }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, type, color } = req.body;
    if (!name || !type) return res.status(400).json({ error: '이름과 유형은 필수입니다.' });
    const cat = await prisma.ledgerCategory.create({
      data: { name, type, color: color || '#1677ff', userId: req.user.id },
    });
    res.status(201).json(cat);
  } catch (err) { next(err); }
};

/* 수정/삭제 가능한 카테고리 조회: 본인 개인 카테고리, 또는 (관리자에 한해) 시스템 기본 */
async function findManageableCategory(id, req) {
  const cat = await prisma.ledgerCategory.findUnique({ where: { id } });
  if (!cat) return { status: 404, error: '카테고리를 찾을 수 없습니다.' };
  const mine = cat.userId === req.user.id;
  const sharedDefault = cat.userId == null && isAdmin(req);
  if (!mine && !sharedDefault) return { status: 403, error: '권한이 없습니다.' };
  return { cat };
}

const updateCategory = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, color } = req.body;
    const chk = await findManageableCategory(id, req);
    if (chk.error) return res.status(chk.status).json({ error: chk.error });
    const cat = await prisma.ledgerCategory.update({ where: { id }, data: { name, color } });
    res.json(cat);
  } catch (err) { next(err); }
};

const deleteCategory = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const chk = await findManageableCategory(id, req);
    if (chk.error) return res.status(chk.status).json({ error: chk.error });
    // 시스템 기본 카테고리는 전원이 쓰므로 전체 거래 기준, 개인 카테고리는 본인 거래만 존재
    const entryCount = await prisma.ledgerEntry.count({ where: { categoryId: id } });
    if (entryCount > 0) return res.status(400).json({ error: '해당 카테고리에 거래 내역이 있어 삭제할 수 없습니다.' });
    const recurringCount = await prisma.ledgerRecurring.count({ where: { categoryId: id } });
    if (recurringCount > 0) return res.status(400).json({ error: '해당 카테고리를 쓰는 반복 거래가 있어 삭제할 수 없습니다.' });
    await prisma.ledgerCategory.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

/* ── 거래 내역 ── */
const listEntries = async (req, res, next) => {
  try {
    const { year, month, type, categoryId, page = 1, limit = 50 } = req.query;
    const where = { createdBy: req.user.id };
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
    if (!(await findUsableCategory(Number(categoryId), req.user.id)))
      return res.status(400).json({ error: '사용할 수 없는 카테고리입니다.' });
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
    const own = await prisma.ledgerEntry.findFirst({ where: { id, createdBy: req.user.id }, select: { id: true } });
    if (!own) return res.status(404).json({ error: '거래 내역을 찾을 수 없습니다.' });
    if (categoryId != null && !(await findUsableCategory(Number(categoryId), req.user.id)))
      return res.status(400).json({ error: '사용할 수 없는 카테고리입니다.' });
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
    const { count } = await prisma.ledgerEntry.deleteMany({ where: { id, createdBy: req.user.id } });
    if (count === 0) return res.status(404).json({ error: '거래 내역을 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

/* ── 요약 통계 ── */
const summary = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const { year, month } = req.query;
    const y = year ? Number(year) : new Date().getFullYear();
    const targetMonth = month ? Number(month) : new Date().getMonth() + 1;

    // 월별 수입/지출 (해당 연도 12개월)
    const monthlyData = [];
    for (let m = 1; m <= 12; m++) {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      const [incomeRes, expenseRes] = await Promise.all([
        prisma.ledgerEntry.aggregate({ where: { createdBy: uid, type: 'income', date: { gte: start, lt: end } }, _sum: { amount: true } }),
        prisma.ledgerEntry.aggregate({ where: { createdBy: uid, type: 'expense', date: { gte: start, lt: end } }, _sum: { amount: true } }),
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
      where: { createdBy: uid, type: 'expense', date: { gte: start, lt: end } },
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
      prisma.ledgerEntry.aggregate({ where: { createdBy: uid, type: 'income', date: { gte: start, lt: end } }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { createdBy: uid, type: 'expense', date: { gte: start, lt: end } }, _sum: { amount: true } }),
    ]);

    // 예산 정보 (내가 쓸 수 있는 지출 카테고리 + 내 이번 달 예산 + 내 실제 지출)
    const allExpenseCats = await prisma.ledgerCategory.findMany({
      where: { type: 'expense', ...visibleCategory(uid) },
      orderBy: { id: 'asc' },
    });
    const budgets = await prisma.ledgerBudget.findMany({ where: { userId: uid, year: y, month: targetMonth } });
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
      where: { userId: req.user.id, year: Number(year), month: Number(month) },
      include: { category: true },
    });
    res.json(budgets);
  } catch (err) { next(err); }
};

const upsertBudget = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const { categoryId, year, month, amount } = req.body;
    if (!categoryId || !year || !month || amount == null)
      return res.status(400).json({ error: 'categoryId, year, month, amount 필수입니다.' });
    if (!(await findUsableCategory(Number(categoryId), uid)))
      return res.status(400).json({ error: '사용할 수 없는 카테고리입니다.' });
    const key = { userId: uid, categoryId: Number(categoryId), year: Number(year), month: Number(month) };
    const budget = await prisma.ledgerBudget.upsert({
      where: { userId_categoryId_year_month: key },
      create: { ...key, amount: Number(amount) },
      update: { amount: Number(amount) },
    });
    res.json(budget);
  } catch (err) { next(err); }
};

const deleteBudget = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { count } = await prisma.ledgerBudget.deleteMany({ where: { id, userId: req.user.id } });
    if (count === 0) return res.status(404).json({ error: '예산을 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

/* ── 반복 거래 ── */
const listRecurrings = async (req, res, next) => {
  try {
    const recurrings = await prisma.ledgerRecurring.findMany({
      where: { createdBy: req.user.id },
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
    if (!(await findUsableCategory(Number(categoryId), req.user.id)))
      return res.status(400).json({ error: '사용할 수 없는 카테고리입니다.' });
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
    const own = await prisma.ledgerRecurring.findFirst({ where: { id, createdBy: req.user.id }, select: { id: true } });
    if (!own) return res.status(404).json({ error: '반복 거래를 찾을 수 없습니다.' });
    if (categoryId != null && !(await findUsableCategory(Number(categoryId), req.user.id)))
      return res.status(400).json({ error: '사용할 수 없는 카테고리입니다.' });
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
    const { count } = await prisma.ledgerRecurring.deleteMany({ where: { id, createdBy: req.user.id } });
    if (count === 0) return res.status(404).json({ error: '반복 거래를 찾을 수 없습니다.' });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// 이번 달(또는 지정 월) 내 반복 거래 자동 생성 — 본인 반복 거래만 대상
const applyRecurring = async (req, res, next) => {
  try {
    const { year, month } = req.body;
    const y = year ? Number(year) : new Date().getFullYear();
    const m = month ? Number(month) : new Date().getMonth() + 1;

    const actives = await prisma.ledgerRecurring.findMany({ where: { isActive: true, createdBy: req.user.id } });
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

/* ── Excel 내보내기 (내 거래만) ── */
const exportExcel = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const where = { createdBy: req.user.id };
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
