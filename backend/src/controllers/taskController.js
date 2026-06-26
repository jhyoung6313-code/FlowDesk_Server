const XLSX = require('xlsx');

const prisma = require('../lib/prisma');
const { getIO } = require('../socket');

// 업무 변경을 전체 접속자에게 알려 실시간 동기화 (요약 바·대시보드·캘린더·간트)
// 가벼운 신호만 보내고 클라이언트가 서버에서 다시 읽도록 한다 (단일 진실 원천)
// clientId(X-Client-Id 헤더)는 변경을 일으킨 "탭"을 식별한다 — 같은 계정이라도
// 다른 탭은 동기화돼야 하므로 actorId(사용자)가 아닌 탭 단위로 echo를 거른다.
const emitTaskChanged = (req, type, taskId) => {
  const io = getIO();
  if (io) io.emit('task-changed', {
    type,
    taskId,
    actorId: req.user.id,
    clientId: req.headers['x-client-id'] || null,
  });
};

const taskInclude = {
  part: { select: { id: true, name: true } },
  creator: { select: { id: true, displayName: true } },
  assignees: {
    include: { user: { select: { id: true, displayName: true, username: true } } },
  },
  extraAssignees: { select: { id: true, name: true } },
  predecessors: {
    include: { predecessor: { select: { id: true, title: true } } },
  },
  successors: {
    include: { successor: { select: { id: true, title: true } } },
  },
  tags: {
    include: { tag: { select: { id: true, name: true, color: true } } },
  },
};

const list = async (req, res, next) => {
  try {
    const { partId, assigneeId, status, priority, startDate, endDate, sort = 'dueDate', tagId } = req.query;

    const where = {};

    // status=deleted 이면 삭제된 항목만 조회, 그 외에는 삭제되지 않은 항목만 조회
    if (status === 'deleted') {
      where.delYn = '1';
    } else {
      where.delYn = '0';
      if (status) where.status = status;
    }

    if (partId) where.partId = Number(partId);
    if (priority) where.priority = priority;
    if (startDate || endDate) {
      where.dueDate = {};
      if (startDate) where.dueDate.gte = new Date(startDate);
      if (endDate) where.dueDate.lte = new Date(endDate);
    }
    if (assigneeId) {
      where.assignees = { some: { userId: Number(assigneeId) } };
    }
    if (tagId) {
      where.tags = { some: { tagId: Number(tagId) } };
    }

    const orderBy = {};
    if (sort === 'dueDate') orderBy.dueDate = 'asc';
    else if (sort === 'priority') orderBy.priority = 'asc';
    else if (sort === 'createdAt') orderBy.createdAt = 'desc';

    const tasks = await prisma.task.findMany({ where, include: taskInclude, orderBy });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};

// 히스토리 헬퍼
const logHistory = async (taskId, userId, action, field, oldValue, newValue) => {
  await prisma.taskHistory.create({
    data: { taskId, userId, action, field: field || null, oldValue: oldValue || null, newValue: newValue || null },
  });
};

const create = async (req, res, next) => {
  try {
    const { title, description, partId, priority, status, startDate, dueDate, assigneeIds, extraAssigneeNames, predecessorIds, tagIds } = req.body;
    if (!title) {
      return res.status(400).json({ error: '업무 제목은 필수입니다.' });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        partId: partId ? Number(partId) : null,
        priority: priority || 'normal',
        status: status || 'pending',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        createdBy: req.user.id,
        assignees: assigneeIds?.length
          ? { create: assigneeIds.map((uid) => ({ userId: Number(uid) })) }
          : undefined,
        extraAssignees: extraAssigneeNames?.length
          ? { create: extraAssigneeNames.map((name) => ({ name })) }
          : undefined,
        predecessors: predecessorIds?.length
          ? { create: predecessorIds.map((pid) => ({ predecessorId: Number(pid) })) }
          : undefined,
        tags: tagIds?.length
          ? { create: tagIds.map((tid) => ({ tagId: Number(tid) })) }
          : undefined,
      },
      include: taskInclude,
    });

    await logHistory(task.id, req.user.id, 'create', null, null, title);

    emitTaskChanged(req, 'create', task.id);
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
};

const detail = async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: Number(req.params.id) },
      include: taskInclude,
    });
    if (!task || task.delYn === '1') return res.status(404).json({ error: '업무를 찾을 수 없습니다.' });
    res.json(task);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    const { title, description, partId, priority, status, startDate, dueDate, assigneeIds, extraAssigneeNames, predecessorIds, tagIds } = req.body;

    // 권한 체크: 본인이 생성했거나 admin
    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing || existing.delYn === '1') return res.status(404).json({ error: '업무를 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      const isAssignee = await prisma.taskAssignee.findUnique({
        where: { taskId_userId: { taskId, userId: req.user.id } },
      });
      if (!isAssignee) {
        return res.status(403).json({ error: '수정 권한이 없습니다.' });
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        description,
        partId: partId !== undefined ? (partId ? Number(partId) : null) : undefined,
        priority,
        status,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
      },
    });

    // 담당자 업데이트
    if (assigneeIds !== undefined) {
      await prisma.taskAssignee.deleteMany({ where: { taskId } });
      if (assigneeIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: assigneeIds.map((uid) => ({ taskId, userId: Number(uid) })),
        });
      }
    }

    // 자유 텍스트 담당자 업데이트
    if (extraAssigneeNames !== undefined) {
      await prisma.taskExtraAssignee.deleteMany({ where: { taskId } });
      if (extraAssigneeNames.length > 0) {
        await prisma.taskExtraAssignee.createMany({
          data: extraAssigneeNames.map((name) => ({ taskId, name })),
        });
      }
    }

    // 의존관계 업데이트
    if (predecessorIds !== undefined) {
      await prisma.taskDependency.deleteMany({ where: { successorId: taskId } });
      if (predecessorIds.length > 0) {
        await prisma.taskDependency.createMany({
          data: predecessorIds.map((pid) => ({
            predecessorId: Number(pid),
            successorId: taskId,
          })),
        });
      }
    }

    // 태그 업데이트
    if (tagIds !== undefined) {
      await prisma.taskTag.deleteMany({ where: { taskId } });
      if (tagIds.length > 0) {
        await prisma.taskTag.createMany({
          data: tagIds.map((tid) => ({ taskId, tagId: Number(tid) })),
        });
      }
    }

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude });

    // 변경된 필드 히스토리 기록
    const FIELD_LABELS = {
      title: '제목', description: '설명', status: '상태', priority: '우선순위',
      partId: '파트', startDate: '시작일', dueDate: '마감일',
    };
    const statusMap = { pending: '대기', in_progress: '진행중', done: '완료', hold: '보류' };
    const priorityMap = { high: '높음', normal: '보통', low: '낮음' };

    const changedFields = [];
    if (title !== undefined && title !== existing.title) changedFields.push({ field: 'title', old: existing.title, new: title });
    if (description !== undefined && description !== existing.description) changedFields.push({ field: 'description', old: existing.description, new: description });
    if (status !== undefined && status !== existing.status) changedFields.push({ field: 'status', old: statusMap[existing.status] || existing.status, new: statusMap[status] || status });
    if (priority !== undefined && priority !== existing.priority) changedFields.push({ field: 'priority', old: priorityMap[existing.priority] || existing.priority, new: priorityMap[priority] || priority });
    if (startDate !== undefined) {
      const oldDate = existing.startDate ? existing.startDate.toISOString().slice(0, 10) : null;
      const newDate = startDate || null;
      if (oldDate !== newDate) changedFields.push({ field: 'startDate', old: oldDate, new: newDate });
    }
    if (dueDate !== undefined) {
      const oldDate = existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null;
      const newDate = dueDate || null;
      if (oldDate !== newDate) changedFields.push({ field: 'dueDate', old: oldDate, new: newDate });
    }

    for (const cf of changedFields) {
      await logHistory(taskId, req.user.id, 'update', FIELD_LABELS[cf.field] || cf.field, cf.old, cf.new);
    }

    emitTaskChanged(req, 'update', taskId);
    res.json(task);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.delYn === '1') {
      return res.status(404).json({ error: '업무를 찾을 수 없습니다.' });
    }
    if (req.user.role !== 'admin' && task.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.task.update({ where: { id: taskId }, data: { delYn: '1' } });
    await logHistory(taskId, req.user.id, 'delete', null, task.title, null);
    emitTaskChanged(req, 'delete', taskId);
    res.json({ message: '업무가 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'in_progress', 'done', 'hold'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다.' });
    }
    const existing = await prisma.task.findUnique({ where: { id: Number(req.params.id) } });
    const task = await prisma.task.update({
      where: { id: Number(req.params.id) },
      data: { status },
      include: taskInclude,
    });
    const statusMap = { pending: '대기', in_progress: '진행중', done: '완료', hold: '보류' };
    await logHistory(task.id, req.user.id, 'update', '상태', statusMap[existing?.status] || existing?.status, statusMap[status] || status);
    emitTaskChanged(req, 'status', task.id);
    res.json(task);
  } catch (err) {
    next(err);
  }
};

const calendar = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const where = { delYn: '0' };
    if (start || end) {
      where.OR = [
        {
          startDate: {
            gte: start ? new Date(start) : undefined,
            lte: end ? new Date(end) : undefined,
          },
        },
        {
          dueDate: {
            gte: start ? new Date(start) : undefined,
            lte: end ? new Date(end) : undefined,
          },
        },
      ];
    }
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignees: { include: { user: { select: { id: true, displayName: true } } } },
        extraAssignees: { select: { id: true, name: true } },
        part: { select: { id: true, name: true } },
      },
    });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};

const gantt = async (req, res, next) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { delYn: '0' },
      include: {
        part: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, displayName: true } } } },
        extraAssignees: { select: { id: true, name: true } },
        predecessors: { select: { predecessorId: true } },
      },
      orderBy: [{ partId: 'asc' }, { startDate: 'asc' }],
    });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};

// GET /api/tasks/export  — 업무 목록 Excel 내보내기
const exportExcel = async (req, res, next) => {
  try {
    const { partId, assigneeId, status, priority } = req.query;
    const where = { delYn: '0' };
    if (status && status !== 'deleted') where.status = status;
    if (priority) where.priority = priority;
    if (partId) where.partId = parseInt(partId);
    if (assigneeId) {
      where.assignees = { some: { userId: parseInt(assigneeId) } };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        part: { select: { name: true } },
        assignees: { include: { user: { select: { displayName: true } } } },
        extraAssignees: { select: { name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    const statusMap = { pending: '대기', in_progress: '진행중', done: '완료', hold: '보류' };
    const priorityMap = { high: '높음', normal: '보통', low: '낮음' };

    const getEffectiveStatus = (status, dueDate) => {
      if (status === 'done' || !dueDate) return status;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      return due < now ? '지연' : (statusMap[status] ?? status);
    };

    const rows = tasks.map((t) => {
      const assigneeNames = [
        ...t.assignees.map((a) => a.user.displayName),
        ...t.extraAssignees.map((e) => e.name),
      ].join(', ');
      return {
        번호: t.id,
        업무명: t.title,
        파트: t.part?.name ?? '',
        담당자: assigneeNames,
        우선순위: priorityMap[t.priority] ?? t.priority,
        상태: getEffectiveStatus(t.status, t.dueDate),
        시작일: t.startDate ? t.startDate.toISOString().slice(0, 10) : '',
        마감일: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
        설명: t.description ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 36 }, { wch: 14 }, { wch: 20 },
      { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '업무목록');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = encodeURIComponent(`업무목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

/** POST /api/tasks/bulk — 일괄 상태 변경 또는 삭제 */
const bulkAction = async (req, res, next) => {
  try {
    const { ids, action, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '업무 ID 목록이 필요합니다.' });
    }

    const numIds = ids.map(Number);

    if (action === 'delete') {
      await prisma.task.updateMany({
        where: { id: { in: numIds }, delYn: '0' },
        data: { delYn: '1' },
      });
      emitTaskChanged(req, 'bulk-delete', null);
      return res.json({ message: `${numIds.length}건이 삭제 처리되었습니다.` });
    }

    if (action === 'status' && status) {
      const validStatuses = ['pending', 'in_progress', 'done', 'hold'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: '유효하지 않은 상태값입니다.' });
      }
      await prisma.task.updateMany({
        where: { id: { in: numIds }, delYn: '0' },
        data: { status },
      });
      emitTaskChanged(req, 'bulk-status', null);
      return res.json({ message: `${numIds.length}건의 상태가 변경되었습니다.` });
    }

    return res.status(400).json({ error: '유효하지 않은 action입니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, detail, update, remove, updateStatus, calendar, gantt, exportExcel, bulkAction };
