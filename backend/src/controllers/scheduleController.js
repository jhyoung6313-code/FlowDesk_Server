const prisma = require('../lib/prisma');

/** 허용 일정 유형 */
const TYPES = ['vacation', 'half_day', 'meeting', 'field_work', 'business_trip', 'remote', 'vehicle', 'etc'];

const eventInclude = {
  creator: { select: { id: true, displayName: true } },
  resource: { select: { id: true, kind: true, name: true } },
  assignees: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
};

/* 응답을 프론트가 쓰기 쉬운 형태로 평탄화 */
function shape(ev) {
  return {
    ...ev,
    assignees: (ev.assignees || []).map((a) => a.user),
  };
}

/** GET /api/schedules?start=YYYY-MM-DD&end=YYYY-MM-DD&type=...
 *  기간이 겹치는(걸쳐 있는) 모든 일정 반환 */
const listEvents = async (req, res, next) => {
  try {
    const { start, end, type } = req.query;
    const where = {};
    if (start && end) {
      // 일정 기간[startDate,endDate]이 조회구간[start,end]과 겹치는 것
      where.startDate = { lte: new Date(end) };
      where.endDate = { gte: new Date(start) };
    } else if (start) {
      where.endDate = { gte: new Date(start) };
    } else if (end) {
      where.startDate = { lte: new Date(end) };
    }
    if (type) where.type = type;

    const events = await prisma.scheduleEvent.findMany({
      where,
      include: eventInclude,
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    });
    res.json(events.map(shape));
  } catch (err) {
    next(err);
  }
};

/** POST /api/schedules */
const createEvent = async (req, res, next) => {
  try {
    const { type, title, startDate, endDate, allDay, startTime, endTime, location, memo, resourceId, assigneeIds } = req.body;

    if (!type || !TYPES.includes(type)) {
      return res.status(400).json({ error: '유효한 일정 유형이 필요합니다.' });
    }
    if (!startDate) {
      return res.status(400).json({ error: '시작일은 필수입니다.' });
    }
    const sDate = new Date(startDate);
    const eDate = endDate ? new Date(endDate) : sDate;
    if (eDate < sDate) {
      return res.status(400).json({ error: '종료일은 시작일보다 빠를 수 없습니다.' });
    }
    const ids = Array.isArray(assigneeIds) ? [...new Set(assigneeIds.map(Number).filter(Boolean))] : [];

    const event = await prisma.scheduleEvent.create({
      data: {
        type,
        title: title?.trim() || null,
        startDate: sDate,
        endDate: eDate,
        allDay: allDay !== false,
        startTime: allDay === false ? (startTime || null) : null,
        endTime: allDay === false ? (endTime || null) : null,
        location: location?.trim() || null,
        memo: memo?.trim() || null,
        resourceId: resourceId ? Number(resourceId) : null,
        createdBy: req.user.id,
        assignees: ids.length ? { create: ids.map((userId) => ({ userId })) } : undefined,
      },
      include: eventInclude,
    });
    res.status(201).json(shape(event));
  } catch (err) {
    next(err);
  }
};

/** PUT /api/schedules/:id */
const updateEvent = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.scheduleEvent.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const { type, title, startDate, endDate, allDay, startTime, endTime, location, memo, resourceId, assigneeIds } = req.body;
    if (type && !TYPES.includes(type)) {
      return res.status(400).json({ error: '유효한 일정 유형이 필요합니다.' });
    }
    const sDate = startDate ? new Date(startDate) : existing.startDate;
    const eDate = endDate ? new Date(endDate) : (startDate ? sDate : existing.endDate);
    if (eDate < sDate) {
      return res.status(400).json({ error: '종료일은 시작일보다 빠를 수 없습니다.' });
    }

    const data = {
      type: type ?? existing.type,
      title: title !== undefined ? (title?.trim() || null) : existing.title,
      startDate: sDate,
      endDate: eDate,
      allDay: allDay !== undefined ? allDay !== false : existing.allDay,
      location: location !== undefined ? (location?.trim() || null) : existing.location,
      memo: memo !== undefined ? (memo?.trim() || null) : existing.memo,
      resourceId: resourceId !== undefined ? (resourceId ? Number(resourceId) : null) : existing.resourceId,
    };
    if (allDay !== undefined) {
      data.startTime = allDay === false ? (startTime || null) : null;
      data.endTime = allDay === false ? (endTime || null) : null;
    } else if (startTime !== undefined || endTime !== undefined) {
      data.startTime = startTime ?? existing.startTime;
      data.endTime = endTime ?? existing.endTime;
    }

    // 대상자 재설정 (전달된 경우에만)
    if (Array.isArray(assigneeIds)) {
      const ids = [...new Set(assigneeIds.map(Number).filter(Boolean))];
      await prisma.scheduleEventAssignee.deleteMany({ where: { eventId: id } });
      if (ids.length) {
        await prisma.scheduleEventAssignee.createMany({ data: ids.map((userId) => ({ eventId: id, userId })) });
      }
    }

    const event = await prisma.scheduleEvent.update({ where: { id }, data, include: eventInclude });
    res.json(shape(event));
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/schedules/:id */
const removeEvent = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.scheduleEvent.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    if (req.user.role !== 'admin' && existing.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.scheduleEvent.delete({ where: { id } });
    res.json({ message: '일정이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

/* ───────── 자원(회의실·차량) ───────── */

/** GET /api/schedules/resources?kind=room|vehicle */
const listResources = async (req, res, next) => {
  try {
    const { kind } = req.query;
    const where = { isActive: true };
    if (kind) where.kind = kind;
    const resources = await prisma.scheduleResource.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    res.json(resources);
  } catch (err) {
    next(err);
  }
};

/** POST /api/schedules/resources (admin) */
const createResource = async (req, res, next) => {
  try {
    const { kind, name, description, sortOrder } = req.body;
    if (!['room', 'vehicle'].includes(kind)) {
      return res.status(400).json({ error: '자원 종류는 room 또는 vehicle 이어야 합니다.' });
    }
    if (!name?.trim()) return res.status(400).json({ error: '자원명은 필수입니다.' });
    const resource = await prisma.scheduleResource.create({
      data: { kind, name: name.trim(), description: description?.trim() || null, sortOrder: Number(sortOrder) || 0 },
    });
    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
};

/** PUT /api/schedules/resources/:id (admin) */
const updateResource = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, sortOrder, isActive } = req.body;
    const existing = await prisma.scheduleResource.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '자원을 찾을 수 없습니다.' });
    const resource = await prisma.scheduleResource.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : existing.name,
        description: description !== undefined ? (description?.trim() || null) : existing.description,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder,
        isActive: isActive !== undefined ? !!isActive : existing.isActive,
      },
    });
    res.json(resource);
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/schedules/resources/:id (admin) — 소프트 비활성화 */
const removeResource = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.scheduleResource.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '자원을 찾을 수 없습니다.' });
    await prisma.scheduleResource.update({ where: { id }, data: { isActive: false } });
    res.json({ message: '자원이 비활성화되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listEvents, createEvent, updateEvent, removeEvent,
  listResources, createResource, updateResource, removeResource,
};
