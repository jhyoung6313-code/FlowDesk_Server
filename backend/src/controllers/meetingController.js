// ─────────────────────────────────────────────────────────────
// F-61 회의 관리 — 회의 · 안건 · 참석자(RSVP) · 회의록 · 결정사항 · 액션아이템
// 인증 필요(routes에서 authenticate).
// 수정 권한: 주최자 또는 관리자.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');
const ai = require('../services/aiService');
const audit = require('../services/auditService');
const { AUDIT_ACTION } = require('../config/security');

const USER_SEL = { id: true, displayName: true, avatarColor: true };
const stripHtml = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function isAdmin(req) { return req.user.role === 'admin'; }

const DETAIL_INCLUDE = {
  organizer: { select: USER_SEL },
  agenda: { orderBy: { sortOrder: 'asc' } },
  attendees: { include: { user: { select: USER_SEL } } },
  decisions: { orderBy: { createdAt: 'asc' } },
  actionItems: { orderBy: { createdAt: 'asc' }, include: { assignee: { select: USER_SEL } } },
};

async function loadEditable(id, req) {
  const meeting = await prisma.meeting.findFirst({ where: { id, delYn: '0' } });
  if (!meeting) return { error: 404 };
  if (!isAdmin(req) && meeting.organizerId !== req.user.id) return { error: 403 };
  return { meeting };
}

// ── 회의 목록 ─────────────────────────────────────────────────
// query: filter=upcoming|past|mine (기본 전체)
exports.list = async (req, res, next) => {
  try {
    const { filter } = req.query;
    const where = { delYn: '0' };
    const now = new Date();
    if (filter === 'upcoming') where.startAt = { gte: now };
    else if (filter === 'past') where.startAt = { lt: now };
    else if (filter === 'mine') {
      where.OR = [
        { organizerId: req.user.id },
        { attendees: { some: { userId: req.user.id } } },
      ];
    }
    const meetings = await prisma.meeting.findMany({
      where,
      orderBy: { startAt: 'desc' },
      include: {
        organizer: { select: USER_SEL },
        attendees: { select: { userId: true } },
        _count: { select: { actionItems: true, decisions: true } },
      },
      take: 200,
    });
    res.json(meetings);
  } catch (err) { next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const meeting = await prisma.meeting.findFirst({
      where: { id: Number(req.params.id), delYn: '0' },
      include: DETAIL_INCLUDE,
    });
    if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });
    res.json(meeting);
  } catch (err) { next(err); }
};

// ── 회의 생성 ─────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { title, startAt, endAt, location, agenda, attendeeUserIds, extAttendees } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: '회의 제목을 입력하세요.' });
    if (!startAt) return res.status(400).json({ error: '시작 일시를 입력하세요.' });

    // 주최자는 참석자로 자동 포함(중복 제거)
    const userIds = [...new Set([req.user.id, ...(Array.isArray(attendeeUserIds) ? attendeeUserIds.map(Number) : [])])];

    const meeting = await prisma.meeting.create({
      data: {
        title: title.trim().slice(0, 200),
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        location: location || null,
        organizerId: req.user.id,
        agenda: {
          create: (Array.isArray(agenda) ? agenda : [])
            .filter((a) => a?.title?.trim())
            .map((a, i) => ({ title: a.title.trim().slice(0, 300), sortOrder: i, presenterId: a.presenterId ? Number(a.presenterId) : null, durationMin: a.durationMin ? Number(a.durationMin) : null })),
        },
        attendees: {
          create: [
            ...userIds.map((uid) => ({ userId: uid, role: uid === req.user.id ? 'organizer' : 'attendee', rsvp: uid === req.user.id ? 'accepted' : 'invited' })),
            ...(Array.isArray(extAttendees) ? extAttendees : []).filter((n) => n?.trim()).map((n) => ({ extName: n.trim().slice(0, 100), role: 'attendee' })),
          ],
        },
      },
      include: DETAIL_INCLUDE,
    });
    res.status(201).json(meeting);
  } catch (err) { next(err); }
};

// ── 회의 수정 (핵심 필드 + 안건·참석자 교체 + 회의록·상태) ──
exports.update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '수정 권한이 없습니다.' });

    const { title, startAt, endAt, location, status, minutes, agenda, attendeeUserIds, extAttendees } = req.body || {};

    await prisma.$transaction(async (tx) => {
      await tx.meeting.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title: String(title).trim().slice(0, 200) } : {}),
          ...(startAt !== undefined ? { startAt: new Date(startAt) } : {}),
          ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
          ...(location !== undefined ? { location: location || null } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(minutes !== undefined ? { minutes } : {}),
        },
      });

      // 안건 교체
      if (agenda !== undefined) {
        await tx.meetingAgenda.deleteMany({ where: { meetingId: id } });
        const rows = (Array.isArray(agenda) ? agenda : []).filter((a) => a?.title?.trim());
        if (rows.length) {
          await tx.meetingAgenda.createMany({
            data: rows.map((a, i) => ({ meetingId: id, title: a.title.trim().slice(0, 300), sortOrder: i, presenterId: a.presenterId ? Number(a.presenterId) : null, durationMin: a.durationMin ? Number(a.durationMin) : null })),
          });
        }
      }

      // 참석자 교체(주최자 유지, RSVP는 기존값 보존)
      if (attendeeUserIds !== undefined || extAttendees !== undefined) {
        const existing = await tx.meetingAttendee.findMany({ where: { meetingId: id } });
        const rsvpByUser = Object.fromEntries(existing.filter((e) => e.userId).map((e) => [e.userId, e.rsvp]));
        const meeting = await tx.meeting.findUnique({ where: { id } });
        const userIds = [...new Set([meeting.organizerId, ...(Array.isArray(attendeeUserIds) ? attendeeUserIds.map(Number) : existing.filter((e) => e.userId).map((e) => e.userId))])];
        await tx.meetingAttendee.deleteMany({ where: { meetingId: id } });
        await tx.meetingAttendee.createMany({
          data: [
            ...userIds.map((uid) => ({ meetingId: id, userId: uid, role: uid === meeting.organizerId ? 'organizer' : 'attendee', rsvp: rsvpByUser[uid] || (uid === meeting.organizerId ? 'accepted' : 'invited') })),
            ...(Array.isArray(extAttendees) ? extAttendees : []).filter((n) => n?.trim()).map((n) => ({ meetingId: id, extName: n.trim().slice(0, 100), role: 'attendee' })),
          ],
        });
      }
    });

    const updated = await prisma.meeting.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    res.json(updated);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '삭제 권한이 없습니다.' });
    await prisma.meeting.update({ where: { id }, data: { delYn: '1' } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 참석 응답(RSVP) — 본인 것만 ──
exports.rsvp = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rsvp } = req.body || {};
    const valid = ['invited', 'accepted', 'declined', 'attended', 'absent'];
    if (!valid.includes(rsvp)) return res.status(400).json({ error: '유효하지 않은 응답입니다.' });
    const att = await prisma.meetingAttendee.findFirst({ where: { meetingId: id, userId: req.user.id } });
    if (!att) return res.status(404).json({ error: '참석자가 아닙니다.' });
    await prisma.meetingAttendee.update({ where: { id: att.id }, data: { rsvp } });
    res.json({ message: '응답이 반영되었습니다.' });
  } catch (err) { next(err); }
};

// ── 결정사항 ──────────────────────────────────────────────────
exports.addDecision = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '권한이 없습니다.' });
    const content = (req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: '내용을 입력하세요.' });
    const d = await prisma.meetingDecision.create({ data: { meetingId: id, content } });
    res.status(201).json(d);
  } catch (err) { next(err); }
};

exports.removeDecision = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '권한이 없습니다.' });
    await prisma.meetingDecision.deleteMany({ where: { id: Number(req.params.did), meetingId: id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 액션아이템 ────────────────────────────────────────────────
exports.addActionItem = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '권한이 없습니다.' });
    const { content, assigneeId, dueDate } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력하세요.' });
    const item = await prisma.meetingActionItem.create({
      data: {
        meetingId: id,
        content: content.trim().slice(0, 500),
        assigneeId: assigneeId ? Number(assigneeId) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: { assignee: { select: USER_SEL } },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

exports.updateActionItem = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '권한이 없습니다.' });
    const aid = Number(req.params.aid);
    const { content, assigneeId, dueDate, status } = req.body || {};
    await prisma.meetingActionItem.updateMany({
      where: { id: aid, meetingId: id },
      data: {
        ...(content !== undefined ? { content: String(content).slice(0, 500) } : {}),
        ...(assigneeId !== undefined ? { assigneeId: assigneeId ? Number(assigneeId) : null } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });
    const item = await prisma.meetingActionItem.findUnique({ where: { id: aid }, include: { assignee: { select: USER_SEL } } });
    res.json(item);
  } catch (err) { next(err); }
};

exports.removeActionItem = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '권한이 없습니다.' });
    await prisma.meetingActionItem.deleteMany({ where: { id: Number(req.params.aid), meetingId: id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── AI 회의록 요약 (F-58 연계) ──
exports.aiSummary = async (req, res, next) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI 기능이 설정되지 않았습니다. 관리자에게 문의하세요.' });
    const id = Number(req.params.id);
    const { error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '권한이 없습니다.' });
    const dayjs = require('dayjs');
    const m = await prisma.meeting.findUnique({ where: { id }, include: DETAIL_INCLUDE });

    const summary = await ai.summarizeMeeting({
      req,
      title: m.title,
      dateLabel: dayjs(m.startAt).format('YYYY-MM-DD HH:mm'),
      agenda: m.agenda.map((a) => a.title),
      minutesText: stripHtml(m.minutes),
      decisions: m.decisions.map((d) => d.content),
      actionItems: m.actionItems.map((it) => ({ 내용: it.content, 담당자: it.assignee?.displayName || null, 기한: it.dueDate ? dayjs(it.dueDate).format('YYYY-MM-DD') : null })),
    });

    const updated = await prisma.meeting.update({ where: { id }, data: { summary }, include: DETAIL_INCLUDE });
    await audit.record({ action: AUDIT_ACTION.AI_REQUEST, req, resource: 'meeting_summary', detail: `회의 #${id}` });
    res.json(updated);
  } catch (err) { next(err); }
};

// ── 액션아이템 → 업무(Task) 전환 ──
exports.actionItemToTask = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { meeting, error } = await loadEditable(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '회의를 찾을 수 없습니다.' : '권한이 없습니다.' });
    const aid = Number(req.params.aid);
    const item = await prisma.meetingActionItem.findFirst({ where: { id: aid, meetingId: id } });
    if (!item) return res.status(404).json({ error: '액션아이템을 찾을 수 없습니다.' });
    if (item.taskId) return res.status(400).json({ error: '이미 업무로 전환되었습니다.' });

    const task = await prisma.task.create({
      data: {
        title: item.content.slice(0, 200),
        description: `회의 "${meeting.title}"의 액션아이템에서 생성됨`,
        priority: 'normal',
        status: 'pending',
        dueDate: item.dueDate || null,
        createdBy: req.user.id,
        ...(item.assigneeId ? { assignees: { create: { userId: item.assigneeId } } } : {}),
      },
    });
    await prisma.meetingActionItem.update({ where: { id: aid }, data: { taskId: task.id } });
    res.json({ taskId: task.id, message: '업무로 전환되었습니다.' });
  } catch (err) { next(err); }
};
