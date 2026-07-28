const prisma = require('../lib/prisma');
const { pushNotification } = require('../services/sseService');

/** 허용 일정 유형 */
const TYPES = ['vacation', 'half_day', 'meeting', 'field_work', 'business_trip', 'remote', 'vehicle', 'etc'];
/** 공개 범위 */
const VISIBILITIES = ['public', 'shared', 'private'];

const eventInclude = {
  creator: { select: { id: true, displayName: true } },
  resource: { select: { id: true, kind: true, name: true } },
  assignees: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
  shares: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
  shareScopes: true,
};

/* 응답을 프론트가 쓰기 쉬운 형태로 평탄화 */
function shape(ev) {
  const scopes = ev.shareScopes || [];
  return {
    ...ev,
    assignees: (ev.assignees || []).map((a) => a.user),
    shares: (ev.shares || []).map((s) => s.user),
    shareDeptIds: scopes.filter((s) => s.kind === 'dept').map((s) => s.refId),
    shareTeamIds: scopes.filter((s) => s.kind === 'team').map((s) => s.refId),
  };
}

/* 요청 사용자가 볼 수 있는 일정만 남기는 where 조건(OR 배열 반환, admin은 null).
   공개(public) + 본인이 작성/대상자/공유자 + 본인 소속 부서·팀이 공유 범위인 일정 */
function visibilityOr(user, deptId, teamId) {
  if (user.role === 'admin') return null;
  const or = [
    { visibility: 'public' },
    { createdBy: user.id },
    { assignees: { some: { userId: user.id } } },
    { shares: { some: { userId: user.id } } },
  ];
  const scopeOr = [];
  if (deptId) scopeOr.push({ kind: 'dept', refId: deptId });
  if (teamId) scopeOr.push({ kind: 'team', refId: teamId });
  if (scopeOr.length) or.push({ shareScopes: { some: { OR: scopeOr } } });
  return or;
}

/* 부서/팀 공유 범위를 실제 소속 사용자 id로 확장 */
async function resolveScopeUserIds(deptIds, teamIds) {
  const or = [];
  if (deptIds.length) or.push({ departmentId: { in: deptIds } });
  if (teamIds.length) or.push({ teamId: { in: teamIds } });
  if (!or.length) return [];
  const users = await prisma.user.findMany({ where: { isActive: true, OR: or }, select: { id: true } });
  return users.map((u) => u.id);
}

/* 공유 대상(개인 + 부서/팀 소속원)에게 알림 발송 (본인·대상자 제외) */
async function notifyShares(event, actor, { userIds = [], deptIds = [], teamIds = [], excludeIds = [] }) {
  const scopeUserIds = await resolveScopeUserIds(deptIds, teamIds);
  const targets = [...new Set([...userIds, ...scopeUserIds].map(Number).filter(Boolean))]
    .filter((id) => id !== actor.id && !excludeIds.includes(id));
  if (!targets.length) return;
  const label = event.title || '일정';
  const message = `${actor.displayName || '누군가'}님이 "${label}" 일정에 회원님을 공유했습니다.`;
  for (const userId of targets) {
    try {
      const notif = await prisma.notification.create({
        data: { userId, actorId: actor.id, type: 'schedule_shared', message, link: '/' },
      });
      pushNotification(userId, notif);
    } catch (err) {
      console.error('[일정 공유 알림] 발송 실패:', err.message);
    }
  }
}

/* shareIds / shareDeptIds / shareTeamIds 정규화 (비공개면 전부 비움, 대상자 중복 제거) */
function normalizeShares({ visibility, shareIds, shareDeptIds, shareTeamIds }, assigneeIds) {
  if (visibility !== 'shared') return { userIds: [], deptIds: [], teamIds: [] };
  const userIds = Array.isArray(shareIds)
    ? [...new Set(shareIds.map(Number).filter(Boolean))].filter((id) => !assigneeIds.includes(id)) : [];
  const deptIds = Array.isArray(shareDeptIds) ? [...new Set(shareDeptIds.map(Number).filter(Boolean))] : [];
  const teamIds = Array.isArray(shareTeamIds) ? [...new Set(shareTeamIds.map(Number).filter(Boolean))] : [];
  return { userIds, deptIds, teamIds };
}

/* 자원(회의실·차량) 이중 예약 검사 — 겹치는 예약이 있으면 그 일정을, 없으면 null 반환.
   판정: 동일 resourceId + 날짜 구간이 겹치고, (한쪽이라도 종일이면 충돌 / 둘 다 시간지정이면 시간대 겹침).
   NOTE: 여러 날에 걸친 시간 지정 일정은 단순화하여 시간대 비교만 수행한다(소규모 팀 로컬 전제). */
async function findResourceConflict({ resourceId, startDate, endDate, allDay, startTime, endTime, excludeId }) {
  if (!resourceId) return null;
  const candidates = await prisma.scheduleEvent.findMany({
    where: {
      resourceId: Number(resourceId),
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    include: { resource: { select: { name: true } }, creator: { select: { displayName: true } } },
  });
  for (const ev of candidates) {
    if (allDay || ev.allDay) return ev; // 한쪽이라도 종일 → 날짜 구간 전체 충돌
    // 둘 다 시간 지정: HH:MM 문자열 비교(zero-padded)로 시간대 겹침 판정
    const aS = startTime || '00:00', aE = endTime || '23:59';
    const bS = ev.startTime || '00:00', bE = ev.endTime || '23:59';
    if (aS < bE && bS < aE) return ev;
  }
  return null;
}

function resourceConflictMessage(conflict) {
  const label = conflict.title || conflict.resource?.name || '기존 예약';
  const who = conflict.creator?.displayName ? ` · ${conflict.creator.displayName}` : '';
  const time = conflict.allDay ? '종일' : `${conflict.startTime || ''}~${conflict.endTime || ''}`;
  return `해당 자원은 이미 예약되어 있습니다: "${label}" (${time}${who})`;
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

    // 공개 범위에 따라 조회 가능한 일정만 (본인 소속 부서·팀 공유 포함)
    if (req.user.role !== 'admin') {
      const me = await prisma.user.findUnique({
        where: { id: req.user.id }, select: { departmentId: true, teamId: true },
      });
      const or = visibilityOr(req.user, me?.departmentId, me?.teamId);
      if (or) where.OR = or;
    }

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
    const { type, title, startDate, endDate, allDay, startTime, endTime, location, memo, resourceId, assigneeIds, shareIds, shareDeptIds, shareTeamIds, visibility } = req.body;

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
    const vis = VISIBILITIES.includes(visibility) ? visibility : 'public';

    // 자원(회의실·차량) 이중 예약 방지
    if (resourceId) {
      const effAllDay = allDay !== false;
      const conflict = await findResourceConflict({
        resourceId, startDate: sDate, endDate: eDate,
        allDay: effAllDay,
        startTime: effAllDay ? null : (startTime || null),
        endTime: effAllDay ? null : (endTime || null),
      });
      if (conflict) return res.status(409).json({ error: resourceConflictMessage(conflict) });
    }

    const ids = Array.isArray(assigneeIds) ? [...new Set(assigneeIds.map(Number).filter(Boolean))] : [];
    const sh = normalizeShares({ visibility: vis, shareIds, shareDeptIds, shareTeamIds }, ids);
    const scopeRows = [
      ...sh.deptIds.map((refId) => ({ kind: 'dept', refId })),
      ...sh.teamIds.map((refId) => ({ kind: 'team', refId })),
    ];

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
        visibility: vis,
        resourceId: resourceId ? Number(resourceId) : null,
        createdBy: req.user.id,
        assignees: ids.length ? { create: ids.map((userId) => ({ userId })) } : undefined,
        shares: sh.userIds.length ? { create: sh.userIds.map((userId) => ({ userId })) } : undefined,
        shareScopes: scopeRows.length ? { create: scopeRows } : undefined,
      },
      include: eventInclude,
    });
    await notifyShares(event, req.user, { userIds: sh.userIds, deptIds: sh.deptIds, teamIds: sh.teamIds, excludeIds: ids });
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

    const { type, title, startDate, endDate, allDay, startTime, endTime, location, memo, resourceId, assigneeIds, shareIds, shareDeptIds, shareTeamIds, visibility } = req.body;
    if (type && !TYPES.includes(type)) {
      return res.status(400).json({ error: '유효한 일정 유형이 필요합니다.' });
    }
    if (visibility !== undefined && !VISIBILITIES.includes(visibility)) {
      return res.status(400).json({ error: '유효한 공개 범위가 필요합니다.' });
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
      visibility: visibility !== undefined ? visibility : existing.visibility,
      resourceId: resourceId !== undefined ? (resourceId ? Number(resourceId) : null) : existing.resourceId,
    };
    if (allDay !== undefined) {
      data.startTime = allDay === false ? (startTime || null) : null;
      data.endTime = allDay === false ? (endTime || null) : null;
    } else if (startTime !== undefined || endTime !== undefined) {
      data.startTime = startTime ?? existing.startTime;
      data.endTime = endTime ?? existing.endTime;
    }

    // 자원 이중 예약 방지 (본인 일정은 제외) — 대상자/공유 변경보다 먼저 검사
    if (data.resourceId) {
      // 시간이 이번 요청에 없으면 기존 값으로 폴백
      const effStart = data.startTime !== undefined ? data.startTime : existing.startTime;
      const effEnd = data.endTime !== undefined ? data.endTime : existing.endTime;
      const conflict = await findResourceConflict({
        resourceId: data.resourceId, startDate: data.startDate, endDate: data.endDate,
        allDay: data.allDay,
        startTime: data.allDay ? null : effStart,
        endTime: data.allDay ? null : effEnd,
        excludeId: id,
      });
      if (conflict) return res.status(409).json({ error: resourceConflictMessage(conflict) });
    }

    // 대상자 재설정 (전달된 경우에만)
    const assigneeIdSet = Array.isArray(assigneeIds)
      ? [...new Set(assigneeIds.map(Number).filter(Boolean))] : null;
    if (assigneeIdSet) {
      await prisma.scheduleEventAssignee.deleteMany({ where: { eventId: id } });
      if (assigneeIdSet.length) {
        await prisma.scheduleEventAssignee.createMany({ data: assigneeIdSet.map((userId) => ({ eventId: id, userId })) });
      }
    }

    // 공유(개인+부서/팀) 재설정 — 관련 필드나 공개범위가 전달된 경우에만
    let notifyPayload = null;
    const shareProvided = Array.isArray(shareIds) || Array.isArray(shareDeptIds)
      || Array.isArray(shareTeamIds) || visibility !== undefined;
    if (shareProvided) {
      const excluded = assigneeIdSet
        || (await prisma.scheduleEventAssignee.findMany({ where: { eventId: id }, select: { userId: true } })).map((a) => a.userId);
      const sh = normalizeShares({ visibility: data.visibility, shareIds, shareDeptIds, shareTeamIds }, excluded);

      // 기존 공유 상태(신규 지정분만 알림하기 위한 diff)
      const oldPersonal = (await prisma.scheduleEventShare.findMany({ where: { eventId: id }, select: { userId: true } })).map((s) => s.userId);
      const oldScopes = await prisma.scheduleEventShareScope.findMany({ where: { eventId: id }, select: { kind: true, refId: true } });
      const oldDept = oldScopes.filter((s) => s.kind === 'dept').map((s) => s.refId);
      const oldTeam = oldScopes.filter((s) => s.kind === 'team').map((s) => s.refId);

      await prisma.scheduleEventShare.deleteMany({ where: { eventId: id } });
      await prisma.scheduleEventShareScope.deleteMany({ where: { eventId: id } });
      if (sh.userIds.length) {
        await prisma.scheduleEventShare.createMany({ data: sh.userIds.map((userId) => ({ eventId: id, userId })) });
      }
      const scopeRows = [
        ...sh.deptIds.map((refId) => ({ eventId: id, kind: 'dept', refId })),
        ...sh.teamIds.map((refId) => ({ eventId: id, kind: 'team', refId })),
      ];
      if (scopeRows.length) await prisma.scheduleEventShareScope.createMany({ data: scopeRows });

      notifyPayload = {
        userIds: sh.userIds.filter((uid) => !oldPersonal.includes(uid)),
        deptIds: sh.deptIds.filter((rid) => !oldDept.includes(rid)),
        teamIds: sh.teamIds.filter((rid) => !oldTeam.includes(rid)),
        excludeIds: excluded,
      };
    }

    const event = await prisma.scheduleEvent.update({ where: { id }, data, include: eventInclude });
    if (notifyPayload) await notifyShares(event, req.user, notifyPayload);
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

// ── 회의 빈시간 찾기(Scheduling Assistant, F-65) ───────────────────────────────
const { toMin, toHHMM, freeSlotsForDay } = require('../services/schedulingService');

// 참석자를 바쁘게 만드는 일정 유형(remote/etc는 가용으로 간주)
const BUSY_TYPES = ['vacation', 'half_day', 'meeting', 'field_work', 'business_trip', 'vehicle'];

const localYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const utcYMD = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// POST /api/schedules/free-slots  { attendeeIds, from, to?, durationMin?, workStart?, workEnd?, stepMin? }
const freeSlots = async (req, res, next) => {
  try {
    const b = req.body || {};
    const ids = [...new Set((b.attendeeIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ error: '참석자를 1명 이상 지정해주세요.' });

    const dur = Math.min(Math.max(Number(b.durationMin) || 60, 5), 480);
    const wsMin = toMin(b.workStart, 540);   // 09:00
    const weMin = toMin(b.workEnd, 1080);     // 18:00
    const step = Math.min(Math.max(Number(b.stepMin) || 30, 5), 120);

    const fromD = b.from ? new Date(b.from) : new Date();
    fromD.setHours(0, 0, 0, 0);
    let toD = b.to ? new Date(b.to) : new Date(fromD);
    toD.setHours(0, 0, 0, 0);
    if (isNaN(fromD) || isNaN(toD) || toD < fromD) return res.status(400).json({ error: '기간이 올바르지 않습니다.' });
    const dayCount = Math.min(Math.floor((toD - fromD) / 86400000) + 1, 14); // 최대 14일

    const rangeStart = new Date(fromD);
    const rangeEnd = new Date(fromD); rangeEnd.setDate(rangeEnd.getDate() + dayCount);

    const [meetings, events] = await Promise.all([
      prisma.meeting.findMany({
        where: {
          delYn: '0', status: { not: 'cancelled' },
          startAt: { gte: rangeStart, lt: rangeEnd },
          OR: [{ organizerId: { in: ids } }, { attendees: { some: { userId: { in: ids } } } }],
        },
        select: { startAt: true, endAt: true },
      }),
      prisma.scheduleEvent.findMany({
        where: {
          type: { in: BUSY_TYPES },
          startDate: { lt: rangeEnd }, endDate: { gte: rangeStart },
          OR: [{ createdBy: { in: ids } }, { assignees: { some: { userId: { in: ids } } } }],
        },
        select: { startDate: true, endDate: true, allDay: true, startTime: true, endTime: true },
      }),
    ]);

    const days = [];
    for (let i = 0; i < dayCount; i++) {
      const day = new Date(fromD); day.setDate(day.getDate() + i);
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      const dayKey = localYMD(day);
      const busy = [];

      for (const m of meetings) {
        const s = new Date(m.startAt);
        const e = m.endAt ? new Date(m.endAt) : new Date(s.getTime() + 60 * 60000);
        if (e <= dayStart || s >= dayEnd) continue;
        busy.push({ start: (s - dayStart) / 60000, end: (e - dayStart) / 60000 });
      }
      for (const ev of events) {
        // db.Date는 UTC 자정 → UTC 성분으로 달력일 비교
        if (dayKey < utcYMD(new Date(ev.startDate)) || dayKey > utcYMD(new Date(ev.endDate))) continue;
        if (ev.allDay) busy.push({ start: wsMin, end: weMin });
        else busy.push({ start: toMin(ev.startTime, wsMin), end: toMin(ev.endTime, weMin) });
      }

      const slots = freeSlotsForDay({ workStart: wsMin, workEnd: weMin, busy, durationMin: dur, stepMin: step });
      days.push({ date: dayKey, slots: slots.map((s) => ({ start: toHHMM(s.startMin), end: toHHMM(s.endMin) })) });
    }

    res.json({ durationMin: dur, workStart: toHHMM(wsMin), workEnd: toHHMM(weMin), days });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listEvents, createEvent, updateEvent, removeEvent,
  listResources, createResource, updateResource, removeResource,
  freeSlots,
};
