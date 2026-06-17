
const prisma = require('../lib/prisma');

const recurringInclude = {
  part: { select: { id: true, name: true } },
  creator: { select: { id: true, displayName: true } },
};

// 목록 조회
const list = async (req, res, next) => {
  try {
    const items = await prisma.recurringTask.findMany({
      include: recurringInclude,
      orderBy: { createdAt: 'desc' },
    });
    // JSON 필드 파싱
    const result = items.map(parseJsonFields);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// 상세 조회
const detail = async (req, res, next) => {
  try {
    const item = await prisma.recurringTask.findUnique({
      where: { id: Number(req.params.id) },
      include: recurringInclude,
    });
    if (!item) return res.status(404).json({ error: '반복 업무를 찾을 수 없습니다.' });
    res.json(parseJsonFields(item));
  } catch (err) {
    next(err);
  }
};

// 생성
const create = async (req, res, next) => {
  try {
    const {
      title, description, partId, priority,
      recurrenceType, recurrenceDay, recurrenceEnd,
      assigneeIds, extraNames,
    } = req.body;

    if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
    if (!recurrenceType) return res.status(400).json({ error: '반복 유형은 필수입니다.' });

    const item = await prisma.recurringTask.create({
      data: {
        title,
        description,
        partId: partId ? Number(partId) : null,
        priority: priority || 'normal',
        recurrenceType,
        recurrenceDay: recurrenceDay !== undefined ? Number(recurrenceDay) : null,
        recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : null,
        assigneeIdsJson: assigneeIds ? JSON.stringify(assigneeIds) : null,
        extraNamesJson: extraNames ? JSON.stringify(extraNames) : null,
        createdBy: req.user.id,
      },
      include: recurringInclude,
    });
    res.status(201).json(parseJsonFields(item));
  } catch (err) {
    next(err);
  }
};

// 수정
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const {
      title, description, partId, priority,
      recurrenceType, recurrenceDay, recurrenceEnd,
      assigneeIds, extraNames, isActive,
    } = req.body;

    const existing = await prisma.recurringTask.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '반복 업무를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const item = await prisma.recurringTask.update({
      where: { id },
      data: {
        title,
        description,
        partId: partId !== undefined ? (partId ? Number(partId) : null) : undefined,
        priority,
        recurrenceType,
        recurrenceDay: recurrenceDay !== undefined ? (recurrenceDay !== null ? Number(recurrenceDay) : null) : undefined,
        recurrenceEnd: recurrenceEnd !== undefined ? (recurrenceEnd ? new Date(recurrenceEnd) : null) : undefined,
        assigneeIdsJson: assigneeIds !== undefined ? (assigneeIds ? JSON.stringify(assigneeIds) : null) : undefined,
        extraNamesJson: extraNames !== undefined ? (extraNames ? JSON.stringify(extraNames) : null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
      include: recurringInclude,
    });
    res.json(parseJsonFields(item));
  } catch (err) {
    next(err);
  }
};

// 삭제
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.recurringTask.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '반복 업무를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.recurringTask.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// 수동 즉시 생성 (오늘 날짜 기준으로 대상 반복 업무 생성)
const generateNow = async (req, res, next) => {
  try {
    const count = await generateRecurringTasks();
    res.json({ message: `반복 업무 ${count}건이 생성되었습니다.` });
  } catch (err) {
    next(err);
  }
};

// --- 핵심 로직: 반복 업무 자동 생성 ---
const generateRecurringTasks = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay();   // 0=일, 1=월 ... 6=토
  const dayOfMonth = today.getDate(); // 1~31

  // 활성 반복 업무 조회 (만료 안 된 것)
  const recurring = await prisma.recurringTask.findMany({
    where: {
      isActive: true,
      OR: [
        { recurrenceEnd: null },
        { recurrenceEnd: { gte: today } },
      ],
    },
  });

  let created = 0;

  for (const r of recurring) {
    let shouldGenerate = false;

    if (r.recurrenceType === 'daily') {
      shouldGenerate = true;
    } else if (r.recurrenceType === 'weekly') {
      // recurrenceDay: 0=일 ~ 6=토
      shouldGenerate = (r.recurrenceDay === dayOfWeek);
    } else if (r.recurrenceType === 'monthly') {
      // recurrenceDay: 1~31
      shouldGenerate = (r.recurrenceDay === dayOfMonth);
    }

    if (!shouldGenerate) continue;

    // 오늘 이미 생성된 업무가 있으면 스킵
    const existing = await prisma.task.findFirst({
      where: {
        recurringTaskId: r.id,
        startDate: today,
        delYn: '0',
      },
    });
    if (existing) continue;

    // 담당자 파싱
    const assigneeIds = r.assigneeIdsJson ? JSON.parse(r.assigneeIdsJson) : [];
    const extraNames  = r.extraNamesJson  ? JSON.parse(r.extraNamesJson)  : [];

    await prisma.task.create({
      data: {
        title: r.title,
        description: r.description,
        partId: r.partId,
        priority: r.priority,
        status: 'pending',
        startDate: today,
        dueDate: today,
        createdBy: r.createdBy,
        recurringTaskId: r.id,
        assignees: assigneeIds.length
          ? { create: assigneeIds.map((uid) => ({ userId: Number(uid) })) }
          : undefined,
        extraAssignees: extraNames.length
          ? { create: extraNames.map((name) => ({ name })) }
          : undefined,
      },
    });
    created++;
  }

  console.log(`[반복업무 스케줄러] ${today.toLocaleDateString()} ${created}건 생성`);
  return created;
};

function parseJsonFields(item) {
  return {
    ...item,
    assigneeIds: item.assigneeIdsJson ? JSON.parse(item.assigneeIdsJson) : [],
    extraNames:  item.extraNamesJson  ? JSON.parse(item.extraNamesJson)  : [],
  };
}

module.exports = { list, detail, create, update, remove, generateNow, generateRecurringTasks };
