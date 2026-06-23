const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const linkedRoomService = require('../services/linkedRoomService');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/board-cards');

const cardInclude = {
  creator: { select: { id: true, displayName: true, avatarColor: true } },
  properties: {
    include: {
      property: { select: { id: true, name: true, type: true, options: true } },
    },
  },
  assignees: {
    include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
  },
  links: { orderBy: { createdAt: 'asc' } },
  comments: {
    include: {
      user: { select: { id: true, displayName: true, avatarColor: true } },
      attachments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  },
  attachments: {
    where: { commentId: null },
    include: { uploader: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'asc' },
  },
  checklists: { orderBy: { order: 'asc' } },
  dependsOn: {
    include: {
      blocking: { select: { id: true, cardNumber: true, title: true, status: true } },
    },
  },
  blocks: {
    include: {
      dependent: { select: { id: true, cardNumber: true, title: true, status: true } },
    },
  },
  linkedTask: { select: { id: true, title: true, status: true, priority: true } },
};

// 역할 우선순위: owner > member > commenter > viewer
const ROLE_LEVELS = { owner: 4, member: 3, commenter: 2, viewer: 1 };

async function getMemberRole(boardId, userId, userRole) {
  if (userRole === 'admin') return 'owner';
  const m = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
  });
  return m?.role ?? null;
}

async function hasMinRole(boardId, userId, userRole, minRole) {
  const role = await getMemberRole(boardId, userId, userRole);
  if (!role) return false;
  return (ROLE_LEVELS[role] ?? 0) >= (ROLE_LEVELS[minRole] ?? 0);
}

async function isMember(boardId, userId) {
  const m = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
  });
  return !!m;
}

async function isOwnerOrAdmin(boardId, userId, userRole) {
  return hasMinRole(boardId, userId, userRole, 'owner');
}

// Socket.IO 인스턴스 (app.js에서 주입)
let _io = null;
function setIO(io) { _io = io; }

const STATUS_LABEL = { todo: '예정', in_progress: '진행중', review: '검토중', done: '완료', hold: '보류', cancelled: '취소' };
const PRIORITY_LABEL = { high: '높음', normal: '보통', low: '낮음' };

function buildCardChangeSummary(before, req) {
  const { title, status, priority, progress, dueDate, assigneeIds, relatedAssigneeIds } = req.body;
  const lines = [];

  if (title !== undefined && title !== before.title) {
    lines.push(`제목: "${title}"`);
  }
  if (status !== undefined && status !== before.status) {
    lines.push(`상태: ${STATUS_LABEL[before.status] || before.status} → ${STATUS_LABEL[status] || status}`);
  }
  if (priority !== undefined && priority !== before.priority) {
    lines.push(`우선순위: ${PRIORITY_LABEL[before.priority] || before.priority} → ${PRIORITY_LABEL[priority] || priority}`);
  }
  if (progress !== undefined && Number(progress) !== before.progress) {
    lines.push(`진행도: ${before.progress}% → ${Number(progress)}%`);
  }
  const fmt = (d) => d ? new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '없음';
  if (dueDate !== undefined) {
    const afterDate = dueDate ? new Date(dueDate).toDateString() : null;
    const beforeDate = before.dueDate ? new Date(before.dueDate).toDateString() : null;
    if (afterDate !== beforeDate) {
      lines.push(`마감일: ${fmt(before.dueDate)} → ${fmt(dueDate)}`);
    }
  }
  if (assigneeIds !== undefined) {
    const beforeIds = before.assignees.filter(a => a.type === 'assignee').map(a => a.userId).sort().join(',');
    const afterIds = [...assigneeIds].map(Number).sort().join(',');
    if (beforeIds !== afterIds) lines.push('담당자 변경됨');
  }
  if (relatedAssigneeIds !== undefined) {
    const beforeIds = before.assignees.filter(a => a.type === 'related').map(a => a.userId).sort().join(',');
    const afterIds = [...relatedAssigneeIds].map(Number).sort().join(',');
    if (beforeIds !== afterIds) lines.push('유관 담당자 변경됨');
  }

  return lines.length > 0 ? lines.join(' | ') : null;
}

// 보드 멤버 + 관리자에게 개별 user 룸으로 이벤트 전송 (board 룸 join 여부와 무관)
async function emitToBoardMembers(boardId, eventName, payload) {
  if (!_io) return;
  try {
    const [members, admins] = await Promise.all([
      prisma.boardMember.findMany({ where: { boardId }, select: { userId: true } }),
      prisma.user.findMany({ where: { role: 'admin', isActive: true }, select: { id: true } }),
    ]);
    const recipients = new Set([
      ...members.map((m) => m.userId),
      ...admins.map((a) => a.id),
    ]);
    for (const uid of recipients) {
      _io.to(`user:${uid}`).emit(eventName, payload);
    }
  } catch {}
}

// 보드의 연결된 채팅방에 시스템 메시지 발송
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// 연결된 방이 없으면 보드 이름의 전용 그룹방을 자동 생성하고, 행위자 명의로 메시지 발송.
async function notifyLinkedRoom(boardId, content, cardId = null, actorId = null) {
  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: {
        linkedRoomId: true, title: true, createdBy: true,
        members: { select: { userId: true } },
      },
    });
    if (!board) return;

    let roomId = board.linkedRoomId;
    if (!roomId) {
      roomId = await linkedRoomService.createGroupRoom({
        name: board.title,
        memberIds: board.members.map((m) => m.userId),
        createdBy: board.createdBy,
      });
      await prisma.board.update({ where: { id: boardId }, data: { linkedRoomId: roomId } });
    }

    // 포트(5100/5443)에 무관하게 동작하도록 상대경로 앵커로 발송. 프론트에서 SPA 네비게이션으로 처리.
    const link = cardId ? `/boards/${boardId}?card=${cardId}` : `/boards/${boardId}`;
    const fullContent = `${content} <a href="${link}" data-chat-link style="color:#1677ff;text-decoration:underline">바로가기 ↗</a>`;

    await linkedRoomService.postMessage({
      roomId,
      content: fullContent,
      senderId: actorId || board.createdBy,
    });
  } catch { /* 조용히 실패 */ }
}

// ─── 보드 CRUD ────────────────────────────────────────────────────────────────

const list = async (req, res, next) => {
  try {
    const boards = await prisma.board.findMany({
      where: { members: { some: { userId: req.user.id } } },
      include: {
        creator: { select: { id: true, displayName: true } },
        members: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
        _count: { select: { cards: true } },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    // 현재 사용자의 isFavorite 필드 주입
    const result = boards.map(b => {
      const myMembership = b.members.find(m => m.userId === req.user.id);
      return { ...b, isFavorite: myMembership?.isFavorite ?? false };
    });
    res.json(result);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { title, description, icon, bgColor, categoryId, memberIds = [] } = req.body;
    if (!title) return res.status(400).json({ error: '보드 제목은 필수입니다.' });

    const board = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.board.aggregate({
        where: { categoryId: categoryId ? Number(categoryId) : null },
        _max: { order: true },
      });
      const b = await tx.board.create({
        data: {
          title,
          description,
          icon,
          bgColor: bgColor ?? null,
          categoryId: categoryId ? Number(categoryId) : null,
          order: (maxOrder._max.order ?? -1) + 1,
          createdBy: req.user.id,
        },
      });
      const uniqueMembers = [...new Set([req.user.id, ...memberIds.map(Number)])];
      await tx.boardMember.createMany({
        data: uniqueMembers.map((uid) => ({
          boardId: b.id,
          userId: uid,
          role: uid === req.user.id ? 'owner' : 'member',
        })),
      });
      return b;
    });

    const result = await prisma.board.findUnique({
      where: { id: board.id },
      include: {
        creator: { select: { id: true, displayName: true } },
        members: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
        _count: { select: { cards: true } },
      },
    });

    // 보드 생성 알림: 멤버들에게 개별 전송 (자신 제외) + admin에게 전송
    if (_io && result?.members) {
      const admins = await prisma.user.findMany({
        where: { role: 'admin', isActive: true },
        select: { id: true },
      });
      const memberIds = new Set(result.members.map((m) => m.userId));
      const recipients = new Set([...memberIds, ...admins.map((a) => a.id)]);
      for (const uid of recipients) {
        if (uid === req.user.id) continue;
        _io.to(`user:${uid}`).emit('board-created', {
          boardId: result.id,
          boardTitle: result.title,
          actorId: req.user.id,
          actorName: req.user.displayName,
        });
      }
    }

    res.status(201).json(result);
  } catch (err) { next(err); }
};

const get = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!await isMember(id, req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, displayName: true } },
        members: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
        properties: { orderBy: { order: 'asc' } },
        _count: { select: { cards: true } },
      },
    });
    if (!board) return res.status(404).json({ error: '보드를 찾을 수 없습니다.' });
    res.json(board);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!await isOwnerOrAdmin(id, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const {
      title, description, icon, bgColor, defaultView,
      kanbanGroupByPropId, swimlaneGroupByPropId, wipLimitsJson, linkedRoomId,
      categoryId, order,
    } = req.body;
    const board = await prisma.board.update({
      where: { id },
      data: {
        title,
        description,
        icon,
        bgColor: bgColor !== undefined ? (bgColor ?? null) : undefined,
        defaultView,
        kanbanGroupByPropId: kanbanGroupByPropId !== undefined ? (kanbanGroupByPropId ?? null) : undefined,
        swimlaneGroupByPropId: swimlaneGroupByPropId !== undefined ? (swimlaneGroupByPropId ?? null) : undefined,
        wipLimitsJson: wipLimitsJson !== undefined ? (wipLimitsJson ?? null) : undefined,
        linkedRoomId: linkedRoomId !== undefined ? (linkedRoomId ?? null) : undefined,
        categoryId: categoryId !== undefined ? (categoryId ? Number(categoryId) : null) : undefined,
        order: order !== undefined ? Number(order) : undefined,
      },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
        properties: { orderBy: { order: 'asc' } },
      },
    });

    // 보드 멤버 + 관리자에게 실시간 알림
    await emitToBoardMembers(id, 'board-updated', {
      boardId: id,
      boardTitle: board.title,
      actorId: req.user.id,
      actorName: req.user.displayName,
    });

    // 연결된 채팅방 이름을 보드 제목과 동기화
    if (board.linkedRoomId && title) {
      await linkedRoomService.syncRoom({ roomId: board.linkedRoomId, name: board.title });
    }

    res.json(board);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!await isOwnerOrAdmin(id, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    await prisma.board.delete({ where: { id } });
    res.json({ message: '보드가 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 카드 ─────────────────────────────────────────────────────────────────────

const listCards = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const cards = await prisma.boardCard.findMany({
      where: { boardId },
      include: cardInclude,
      orderBy: { order: 'asc' },
    });
    res.json(cards);
  } catch (err) { next(err); }
};

const createCard = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '카드 생성 권한이 없습니다.' });
    }
    const {
      title, description, coverColor, coverImageUrl, propertyValues = {},
      startDate, dueDate, status = 'todo', priority = 'normal', progress = 0,
      assigneeIds = [], relatedAssigneeIds = [],
      links = [], checklists = [],
    } = req.body;
    if (!title) return res.status(400).json({ error: '카드 제목은 필수입니다.' });

    const [maxOrder, maxNumber] = await Promise.all([
      prisma.boardCard.aggregate({ where: { boardId }, _max: { order: true } }),
      prisma.boardCard.aggregate({ where: { boardId }, _max: { cardNumber: true } }),
    ]);

    const card = await prisma.$transaction(async (tx) => {
      const c = await tx.boardCard.create({
        data: {
          boardId,
          cardNumber: (maxNumber._max.cardNumber ?? 0) + 1,
          title,
          description,
          coverColor,
          coverImageUrl: coverImageUrl || null,
          order: (maxOrder._max.order ?? -1) + 1,
          createdBy: req.user.id,
          startDate: startDate ? new Date(startDate) : null,
          dueDate: dueDate ? new Date(dueDate) : null,
          status,
          priority,
          progress: Number(progress) || 0,
        },
      });

      const entries = Object.entries(propertyValues);
      if (entries.length > 0) {
        await tx.boardPropertyValue.createMany({
          data: entries.map(([propId, value]) => ({
            cardId: c.id,
            propertyId: Number(propId),
            value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
          })),
        });
      }

      const assigneeData = [
        ...assigneeIds.map((uid) => ({ cardId: c.id, userId: Number(uid), type: 'assignee' })),
        ...relatedAssigneeIds.map((uid) => ({ cardId: c.id, userId: Number(uid), type: 'related' })),
      ];
      if (assigneeData.length > 0) {
        await tx.boardCardAssignee.createMany({ data: assigneeData, skipDuplicates: true });
      }

      if (links.length > 0) {
        await tx.boardCardLink.createMany({
          data: links.map(({ title: lt, url }) => ({ cardId: c.id, title: lt || null, url })),
        });
      }

      if (checklists.length > 0) {
        await tx.boardCardChecklist.createMany({
          data: checklists.map(({ content, checked = false }, idx) => ({
            cardId: c.id, content, checked, order: idx,
          })),
        });
      }

      return c;
    });

    // 담당자 자동 연동: 카드 → 업무(Task) (실패해도 카드 생성에는 영향 없음)
    try { await syncCardToTask(card.id, req.user.id); }
    catch (e) { console.error('카드-업무 연동 실패:', e.message); }

    const result = await prisma.boardCard.findUnique({ where: { id: card.id }, include: cardInclude });

    // 채팅방 알림
    await notifyLinkedRoom(boardId, `📋 새 카드 추가: **${title}**`, result.id, req.user.id);

    // 자동화: 카드 생성 시 실행
    await executeAutomations(boardId, 'card_created', { cardId: result.id });

    // 보드 멤버 + 관리자에게 실시간 알림
    const boardForCard = await prisma.board.findUnique({ where: { id: boardId }, select: { title: true } });
    await emitToBoardMembers(boardId, 'board-card-created', {
      boardId,
      cardId: result.id,
      cardTitle: result.title,
      boardTitle: boardForCard?.title ?? '',
      actorId: req.user.id,
      actorName: req.user.displayName,
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
};

const updateCard = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '카드 수정 권한이 없습니다.' });
    }
    const {
      title, description, coverColor, coverImageUrl,
      startDate, dueDate, status, priority, progress,
      assigneeIds, relatedAssigneeIds,
      links,
    } = req.body;

    // 수정 전 카드 상태 조회 (변경 내용 비교용)
    const beforeCard = await prisma.boardCard.findUnique({
      where: { id: cardId },
      select: {
        title: true, status: true, priority: true, progress: true,
        startDate: true, dueDate: true,
        assignees: { select: { userId: true, type: true } },
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.boardCard.update({
        where: { id: cardId },
        data: {
          title,
          description,
          coverColor,
          coverImageUrl: coverImageUrl !== undefined ? (coverImageUrl ?? null) : undefined,
          startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
          dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
          status,
          priority,
          progress: progress !== undefined ? Number(progress) : undefined,
        },
      });

      if (assigneeIds !== undefined || relatedAssigneeIds !== undefined) {
        await tx.boardCardAssignee.deleteMany({ where: { cardId } });
        const assigneeData = [
          ...(assigneeIds ?? []).map((uid) => ({ cardId, userId: Number(uid), type: 'assignee' })),
          ...(relatedAssigneeIds ?? []).map((uid) => ({ cardId, userId: Number(uid), type: 'related' })),
        ];
        if (assigneeData.length > 0) {
          await tx.boardCardAssignee.createMany({ data: assigneeData, skipDuplicates: true });
        }
      }

      if (links !== undefined) {
        await tx.boardCardLink.deleteMany({ where: { cardId } });
        if (links.length > 0) {
          await tx.boardCardLink.createMany({
            data: links.map(({ title: lt, url }) => ({ cardId, title: lt || null, url })),
          });
        }
      }
    });

    // 담당자/필드 자동 연동: 카드 → 업무(Task) (실패해도 카드 수정에는 영향 없음)
    try { await syncCardToTask(cardId, req.user.id); }
    catch (e) { console.error('카드-업무 연동 실패:', e.message); }

    const result = await prisma.boardCard.findUnique({ where: { id: cardId }, include: cardInclude });

    // 채팅방 알림
    if (title) await notifyLinkedRoom(boardId, `✏️ 카드 수정: **${title}**`, cardId, req.user.id);

    // 변경 내용 요약 생성
    const changeSummary = beforeCard ? buildCardChangeSummary(beforeCard, req) : null;

    // 보드 멤버 + 관리자에게 실시간 알림
    const boardForUpdate = await prisma.board.findUnique({ where: { id: boardId }, select: { title: true } });
    await emitToBoardMembers(boardId, 'board-card-updated', {
      boardId,
      cardId,
      cardTitle: result.title,
      boardTitle: boardForUpdate?.title ?? '',
      actorId: req.user.id,
      actorName: req.user.displayName,
      changeSummary,
    });

    // 자동화: 상태 변경 시 실행 (beforeCard로 이전 상태 비교)
    if (status !== undefined && beforeCard && status !== beforeCard.status) {
      await executeAutomations(boardId, 'card_status_changed', {
        cardId,
        fromStatus: beforeCard.status,
        toStatus: status,
      });
    }
    // 자동화: 담당자 지정 시 실행
    if (assigneeIds !== undefined && beforeCard) {
      const beforeIds = beforeCard.assignees.filter(a => a.type === 'assignee').map(a => a.userId).sort().join(',');
      const afterIds = [...assigneeIds].map(Number).sort().join(',');
      if (beforeIds !== afterIds) {
        await executeAutomations(boardId, 'card_assigned', { cardId });
      }
    }

    res.json(result);
  } catch (err) { next(err); }
};

const deleteCard = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '카드 삭제 권한이 없습니다.' });
    }
    const card = await prisma.boardCard.findUnique({ where: { id: cardId }, select: { title: true } });

    const attachments = await prisma.boardCardAttachment.findMany({ where: { cardId } });
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, att.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.boardCard.delete({ where: { id: cardId } });

    // 채팅방 알림
    if (card) await notifyLinkedRoom(boardId, `🗑️ 카드 삭제: **${card.title}**`, null, req.user.id);

    res.json({ message: '카드가 삭제되었습니다.' });
  } catch (err) { next(err); }
};

const updateCardProperties = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { propertyValues = {} } = req.body;

    await prisma.$transaction(
      Object.entries(propertyValues).map(([propId, value]) =>
        prisma.boardPropertyValue.upsert({
          where: { cardId_propertyId: { cardId, propertyId: Number(propId) } },
          update: { value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') },
          create: {
            cardId,
            propertyId: Number(propId),
            value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
          },
        })
      )
    );

    const result = await prisma.boardCard.findUnique({ where: { id: cardId }, include: cardInclude });
    res.json(result);
  } catch (err) { next(err); }
};

const reorderCards = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const { orders } = req.body;
    await prisma.$transaction(
      orders.map(({ id, order }) =>
        prisma.boardCard.update({ where: { id }, data: { order } })
      )
    );
    res.json({ message: 'ok' });
  } catch (err) { next(err); }
};

// ─── 커버 이미지 ──────────────────────────────────────────────────────────────

const uploadCoverImage = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    if (!req.file) return res.status(400).json({ error: '파일을 선택해주세요.' });

    const url = `/uploads/board-cards/${req.file.filename}`;
    const updated = await prisma.boardCard.update({
      where: { id: cardId },
      data: { coverImageUrl: url },
    });
    res.json({ coverImageUrl: updated.coverImageUrl });
  } catch (err) { next(err); }
};

const deleteCoverImage = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const card = await prisma.boardCard.findUnique({ where: { id: cardId }, select: { coverImageUrl: true } });
    if (card?.coverImageUrl) {
      const filename = path.basename(card.coverImageUrl);
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.boardCard.update({ where: { id: cardId }, data: { coverImageUrl: null } });
    res.json({ message: '커버 이미지가 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 댓글 ────────────────────────────────────────────────────────────────────

const createComment = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'commenter')) {
      return res.status(403).json({ error: '댓글 작성 권한이 없습니다.' });
    }
    const { content, mentions = [] } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '댓글 내용을 입력하세요.' });

    const comment = await prisma.boardCardComment.create({
      data: { cardId, userId: req.user.id, content },
      include: {
        user: { select: { id: true, displayName: true, avatarColor: true } },
        attachments: true,
      },
    });

    // 보드 멤버 + 관리자에게 실시간 알림
    const cardInfoForComment = await prisma.boardCard.findUnique({
      where: { id: cardId },
      select: { title: true, board: { select: { title: true } } },
    });
    await emitToBoardMembers(boardId, 'board-comment-added', {
      boardId,
      cardId,
      cardTitle: cardInfoForComment?.title ?? '',
      boardTitle: cardInfoForComment?.board?.title ?? '',
      actorId: req.user.id,
      actorName: req.user.displayName,
      preview: content.replace(/<[^>]*>/g, '').slice(0, 80),
    });

    // 연결된 채팅방에 댓글 알림
    await notifyLinkedRoom(
      boardId,
      `💬 댓글: **${cardInfoForComment?.title ?? '카드'}** — ${content.replace(/<[^>]*>/g, '').slice(0, 80)}`,
      cardId,
      req.user.id,
    );

    // @멘션 처리: 멘션된 사용자에게 DM 알림
    if (mentions.length > 0) {
      const card = await prisma.boardCard.findUnique({
        where: { id: cardId },
        select: { title: true, board: { select: { title: true } } },
      });
      for (const mentionedUserId of mentions) {
        if (Number(mentionedUserId) === req.user.id) continue;
        try {
          // 1:1 DM 방 찾거나 생성
          const existing = await prisma.chatRoom.findFirst({
            where: {
              type: 'direct',
              AND: [
                { members: { some: { userId: req.user.id } } },
                { members: { some: { userId: Number(mentionedUserId) } } },
              ],
            },
          });

          let roomId;
          if (existing) {
            roomId = existing.id;
          } else {
            const room = await prisma.chatRoom.create({
              data: {
                type: 'direct',
                createdBy: req.user.id,
                members: {
                  create: [
                    { userId: req.user.id },
                    { userId: Number(mentionedUserId) },
                  ],
                },
              },
            });
            roomId = room.id;
            if (_io) _io.to(`user:${mentionedUserId}`).emit('join-room', roomId);
          }

          const alertMsg = await prisma.chatMessage.create({
            data: {
              roomId,
              senderId: req.user.id,
              content: `📌 **${card?.board?.title ?? '보드'}** › **${card?.title ?? '카드'}** 에서 멘션했습니다:\n${content}`,
            },
            include: { sender: { select: { id: true, displayName: true, avatarColor: true } } },
          });
          if (_io) _io.to(`room:${roomId}`).emit('new-message', alertMsg);
        } catch {}
      }
    }

    res.status(201).json(comment);
  } catch (err) { next(err); }
};

const updateComment = async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    const { content } = req.body;
    const existing = await prisma.boardCardComment.findUnique({ where: { id: commentId } });
    if (!existing) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    if (existing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    const comment = await prisma.boardCardComment.update({
      where: { id: commentId },
      data: { content },
      include: {
        user: { select: { id: true, displayName: true, avatarColor: true } },
        attachments: true,
      },
    });
    res.json(comment);
  } catch (err) { next(err); }
};

const deleteComment = async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    const existing = await prisma.boardCardComment.findUnique({ where: { id: commentId } });
    if (!existing) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    if (existing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.boardCardComment.delete({ where: { id: commentId } });
    res.json({ message: '댓글이 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 첨부파일 ─────────────────────────────────────────────────────────────────

const uploadAttachment = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    if (!req.file) return res.status(400).json({ error: '파일을 선택해주세요.' });
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const att = await prisma.boardCardAttachment.create({
      data: {
        cardId,
        uploadedBy: req.user.id,
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      include: { uploader: { select: { id: true, displayName: true } } },
    });

    // 보드 멤버 + 관리자에게 실시간 알림
    const cardInfoForAtt = await prisma.boardCard.findUnique({
      where: { id: cardId },
      select: { title: true, board: { select: { title: true } } },
    });
    await emitToBoardMembers(boardId, 'board-attachment-added', {
      boardId,
      cardId,
      cardTitle: cardInfoForAtt?.title ?? '',
      boardTitle: cardInfoForAtt?.board?.title ?? '',
      actorId: req.user.id,
      actorName: req.user.displayName,
      fileName: originalName,
    });

    res.status(201).json(att);
  } catch (err) { next(err); }
};

const downloadAttachment = async (req, res, next) => {
  try {
    const att = await prisma.boardCardAttachment.findUnique({
      where: { id: Number(req.params.attachmentId) },
    });
    if (!att) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const filePath = path.join(UPLOAD_DIR, att.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.originalName)}`);
    res.setHeader('Content-Type', att.mimeType);
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

const deleteAttachment = async (req, res, next) => {
  try {
    const attachmentId = Number(req.params.attachmentId);
    const att = await prisma.boardCardAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    if (att.uploadedBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    const filePath = path.join(UPLOAD_DIR, att.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.boardCardAttachment.delete({ where: { id: attachmentId } });
    res.json({ message: '파일이 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 댓글 첨부파일 ────────────────────────────────────────────────────────────

const uploadCommentAttachment = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    const commentId = Number(req.params.commentId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'commenter')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    if (!req.file) return res.status(400).json({ error: '파일을 선택해주세요.' });
    const comment = await prisma.boardCardComment.findFirst({ where: { id: commentId, cardId } });
    if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const att = await prisma.boardCardAttachment.create({
      data: {
        cardId,
        commentId,
        uploadedBy: req.user.id,
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
    res.status(201).json(att);
  } catch (err) { next(err); }
};

// ─── 체크리스트 ───────────────────────────────────────────────────────────────

const createChecklistItem = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '항목 내용을 입력하세요.' });
    const maxOrder = await prisma.boardCardChecklist.aggregate({
      where: { cardId },
      _max: { order: true },
    });
    const item = await prisma.boardCardChecklist.create({
      data: { cardId, content, checked: false, order: (maxOrder._max.order ?? -1) + 1 },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

const updateChecklistItem = async (req, res, next) => {
  try {
    const itemId = Number(req.params.itemId);
    const { content, checked } = req.body;
    const item = await prisma.boardCardChecklist.update({
      where: { id: itemId },
      data: {
        content: content !== undefined ? content : undefined,
        checked: checked !== undefined ? Boolean(checked) : undefined,
      },
    });
    res.json(item);
  } catch (err) { next(err); }
};

const deleteChecklistItem = async (req, res, next) => {
  try {
    const itemId = Number(req.params.itemId);
    await prisma.boardCardChecklist.delete({ where: { id: itemId } });
    res.json({ message: '항목이 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 속성 ────────────────────────────────────────────────────────────────────

const listProperties = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const props = await prisma.boardProperty.findMany({
      where: { boardId },
      orderBy: { order: 'asc' },
    });
    res.json(props);
  } catch (err) { next(err); }
};

const createProperty = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { name, type, options } = req.body;
    if (!name || !type) return res.status(400).json({ error: '이름과 타입은 필수입니다.' });
    const maxOrder = await prisma.boardProperty.aggregate({
      where: { boardId },
      _max: { order: true },
    });
    const prop = await prisma.boardProperty.create({
      data: { boardId, name, type, options: options ?? null, order: (maxOrder._max.order ?? -1) + 1 },
    });
    res.status(201).json(prop);
  } catch (err) { next(err); }
};

const updateProperty = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const propId = Number(req.params.propId);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { name, options, order } = req.body;
    const prop = await prisma.boardProperty.update({
      where: { id: propId },
      data: { name, options: options ?? null, order },
    });
    res.json(prop);
  } catch (err) { next(err); }
};

const deleteProperty = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const propId = Number(req.params.propId);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    await prisma.board.updateMany({
      where: { id: boardId, kanbanGroupByPropId: propId },
      data: { kanbanGroupByPropId: null },
    });
    await prisma.boardProperty.delete({ where: { id: propId } });
    res.json({ message: '속성이 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 멤버 ────────────────────────────────────────────────────────────────────

const listMembers = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const members = await prisma.boardMember.findMany({
      where: { boardId },
      include: { user: { select: { id: true, displayName: true, username: true, avatarColor: true } } },
    });
    res.json(members);
  } catch (err) { next(err); }
};

const addMember = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { userId, role = 'member' } = req.body;
    const validRoles = ['owner', 'member', 'commenter', 'viewer'];
    const safeRole = validRoles.includes(role) ? role : 'member';

    const m = await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: Number(userId) } },
      update: { role: safeRole },
      create: { boardId, userId: Number(userId), role: safeRole },
      include: { user: { select: { id: true, displayName: true, username: true, avatarColor: true } } },
    });

    // 연결된 채팅방에도 신규 멤버 추가
    const boardForRoom = await prisma.board.findUnique({ where: { id: boardId }, select: { linkedRoomId: true } });
    if (boardForRoom?.linkedRoomId) {
      await linkedRoomService.syncRoom({ roomId: boardForRoom.linkedRoomId, memberIds: [Number(userId)] });
    }

    res.status(201).json(m);
  } catch (err) { next(err); }
};

const removeMember = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    await prisma.boardMember.delete({
      where: { boardId_userId: { boardId, userId } },
    });
    res.json({ message: '멤버가 제거되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 보드 내보내기/가져오기 ───────────────────────────────────────────────────

const exportBoard = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!await hasMinRole(id, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        properties: { orderBy: { order: 'asc' } },
        cards: {
          include: {
            properties: true,
            assignees: true,
            links: true,
            checklists: { orderBy: { order: 'asc' } },
            comments: { include: { user: { select: { id: true, displayName: true } } } },
          },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!board) return res.status(404).json({ error: '보드를 찾을 수 없습니다.' });

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      board: {
        title: board.title,
        description: board.description,
        icon: board.icon,
        defaultView: board.defaultView,
        properties: board.properties,
        cards: board.cards.map(c => ({
          title: c.title,
          description: c.description,
          coverColor: c.coverColor,
          status: c.status,
          priority: c.priority,
          progress: c.progress,
          startDate: c.startDate,
          dueDate: c.dueDate,
          order: c.order,
          propertyValues: c.properties,
          links: c.links.map(l => ({ title: l.title, url: l.url })),
          checklists: c.checklists.map(cl => ({ content: cl.content, checked: cl.checked })),
        })),
      },
    };

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(board.title)}_export.json`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) { next(err); }
};

const importBoard = async (req, res, next) => {
  try {
    const { board: boardData } = req.body;
    if (!boardData?.title) return res.status(400).json({ error: '유효하지 않은 내보내기 파일입니다.' });

    const result = await prisma.$transaction(async (tx) => {
      const newBoard = await tx.board.create({
        data: {
          title: `${boardData.title} (가져오기)`,
          description: boardData.description,
          icon: boardData.icon,
          defaultView: boardData.defaultView || 'kanban',
          createdBy: req.user.id,
        },
      });

      await tx.boardMember.create({
        data: { boardId: newBoard.id, userId: req.user.id, role: 'owner' },
      });

      // 속성 생성 (ID 매핑 테이블)
      const propIdMap = {};
      if (boardData.properties?.length > 0) {
        for (const p of boardData.properties) {
          const created = await tx.boardProperty.create({
            data: {
              boardId: newBoard.id,
              name: p.name,
              type: p.type,
              options: p.options ?? null,
              order: p.order ?? 0,
            },
          });
          propIdMap[p.id] = created.id;
        }
      }

      // 카드 생성
      if (boardData.cards?.length > 0) {
        for (const c of boardData.cards) {
          const newCard = await tx.boardCard.create({
            data: {
              boardId: newBoard.id,
              title: c.title,
              description: c.description,
              coverColor: c.coverColor,
              status: c.status || 'todo',
              priority: c.priority || 'normal',
              progress: c.progress || 0,
              startDate: c.startDate ? new Date(c.startDate) : null,
              dueDate: c.dueDate ? new Date(c.dueDate) : null,
              order: c.order || 0,
              createdBy: req.user.id,
            },
          });

          // 속성값 매핑
          if (c.propertyValues?.length > 0) {
            const pvData = c.propertyValues
              .filter(pv => propIdMap[pv.propertyId])
              .map(pv => ({
                cardId: newCard.id,
                propertyId: propIdMap[pv.propertyId],
                value: pv.value,
              }));
            if (pvData.length > 0) {
              await tx.boardPropertyValue.createMany({ data: pvData });
            }
          }

          if (c.links?.length > 0) {
            await tx.boardCardLink.createMany({
              data: c.links.map(l => ({ cardId: newCard.id, title: l.title, url: l.url })),
            });
          }

          if (c.checklists?.length > 0) {
            await tx.boardCardChecklist.createMany({
              data: c.checklists.map((cl, idx) => ({
                cardId: newCard.id, content: cl.content, checked: cl.checked, order: idx,
              })),
            });
          }
        }
      }

      return newBoard;
    });

    const full = await prisma.board.findUnique({
      where: { id: result.id },
      include: {
        creator: { select: { id: true, displayName: true } },
        members: { include: { user: { select: { id: true, displayName: true, avatarColor: true } } } },
        _count: { select: { cards: true } },
      },
    });
    res.status(201).json(full);
  } catch (err) { next(err); }
};

// ─── 즐겨찾기 토글 ────────────────────────────────────────────────────────────

const toggleFavorite = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const m = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: req.user.id } },
    });
    if (!m) return res.status(403).json({ error: '보드 멤버가 아닙니다.' });
    const updated = await prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId: req.user.id } },
      data: { isFavorite: !m.isFavorite },
    });
    res.json({ isFavorite: updated.isFavorite });
  } catch (err) { next(err); }
};

// ─── 카드 복제 ────────────────────────────────────────────────────────────────

const duplicateCard = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '카드 생성 권한이 없습니다.' });
    }
    const src = await prisma.boardCard.findUnique({ where: { id: cardId }, include: cardInclude });
    if (!src) return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });

    const [maxOrder, maxNumber] = await Promise.all([
      prisma.boardCard.aggregate({ where: { boardId }, _max: { order: true } }),
      prisma.boardCard.aggregate({ where: { boardId }, _max: { cardNumber: true } }),
    ]);

    const newCard = await prisma.$transaction(async (tx) => {
      const c = await tx.boardCard.create({
        data: {
          boardId,
          cardNumber: (maxNumber._max.cardNumber ?? 0) + 1,
          title: `${src.title} (복사본)`,
          description: src.description,
          coverColor: src.coverColor,
          order: (maxOrder._max.order ?? -1) + 1,
          createdBy: req.user.id,
          startDate: src.startDate,
          dueDate: src.dueDate,
          status: src.status,
          priority: src.priority,
          progress: src.progress,
        },
      });
      if (src.properties.length > 0) {
        await tx.boardPropertyValue.createMany({
          data: src.properties.map(pv => ({
            cardId: c.id, propertyId: pv.propertyId, value: pv.value,
          })),
        });
      }
      if (src.assignees.length > 0) {
        await tx.boardCardAssignee.createMany({
          data: src.assignees.map(a => ({ cardId: c.id, userId: a.userId, type: a.type })),
          skipDuplicates: true,
        });
      }
      if (src.checklists.length > 0) {
        await tx.boardCardChecklist.createMany({
          data: src.checklists.map(cl => ({
            cardId: c.id, content: cl.content, checked: false, order: cl.order,
          })),
        });
      }
      return c;
    });

    const result = await prisma.boardCard.findUnique({ where: { id: newCard.id }, include: cardInclude });
    res.status(201).json(result);
  } catch (err) { next(err); }
};

// ─── 의존성 ───────────────────────────────────────────────────────────────────

const listDependencies = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const [dependsOn, blocks] = await Promise.all([
      prisma.boardCardDependency.findMany({
        where: { dependentId: cardId },
        include: { blocking: { select: { id: true, cardNumber: true, title: true, status: true } } },
      }),
      prisma.boardCardDependency.findMany({
        where: { blockingId: cardId },
        include: { dependent: { select: { id: true, cardNumber: true, title: true, status: true } } },
      }),
    ]);
    res.json({ dependsOn, blocks });
  } catch (err) { next(err); }
};

const addDependency = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const dependentId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { blockingId } = req.body;
    if (!blockingId || blockingId === dependentId) {
      return res.status(400).json({ error: '유효하지 않은 의존성입니다.' });
    }
    const dep = await prisma.boardCardDependency.create({
      data: { dependentId, blockingId: Number(blockingId) },
      include: { blocking: { select: { id: true, cardNumber: true, title: true, status: true } } },
    });
    res.status(201).json(dep);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: '이미 등록된 의존성입니다.' });
    next(err);
  }
};

const removeDependency = async (req, res, next) => {
  try {
    const depId = Number(req.params.depId);
    await prisma.boardCardDependency.delete({ where: { id: depId } });
    res.json({ message: '의존성이 제거되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 업무 연결 ────────────────────────────────────────────────────────────────

// 카드 → 업무(Task) 자동 연동: 보드 카드에 담당자가 지정되면 대응하는 Task를
// 자동 생성하고, 이후 카드 변경 시 연결된 Task를 지속 동기화한다.
// 보드 상태/우선순위는 자유 문자열이라 Task enum으로 매핑이 필요하다.
const BOARD_TO_TASK_STATUS = {
  todo: 'pending',
  in_progress: 'in_progress',
  review: 'in_progress',
  done: 'done',
  hold: 'hold',
  cancelled: 'hold',
};
const TASK_PRIORITIES = ['high', 'normal', 'low'];
const DEFAULT_TASK_STATUS = 'pending';
const DEFAULT_TASK_PRIORITY = 'normal';

function mapCardStatusToTask(cardStatus) {
  return BOARD_TO_TASK_STATUS[cardStatus] ?? DEFAULT_TASK_STATUS;
}

function mapCardPriorityToTask(cardPriority) {
  return TASK_PRIORITIES.includes(cardPriority) ? cardPriority : DEFAULT_TASK_PRIORITY;
}

// 카드 담당자(type='assignee') 기준으로 연결 Task를 생성하거나 동기화한다.
// - linkedTask가 없고 담당자가 1명 이상이면 새 Task를 만들어 연결
// - linkedTask가 있으면 제목/상태/우선순위/기한/담당자를 동기화
// 담당자가 모두 제거되거나 카드가 삭제돼도 Task는 유지한다(연결 정책: 유지).
async function syncCardToTask(cardId, actorId) {
  const card = await prisma.boardCard.findUnique({
    where: { id: cardId },
    select: {
      id: true, title: true, description: true,
      status: true, priority: true, startDate: true, dueDate: true,
      linkedTaskId: true, createdBy: true,
      assignees: { where: { type: 'assignee' }, select: { userId: true } },
    },
  });
  if (!card) return;

  const assigneeIds = card.assignees.map((a) => a.userId);
  const taskData = {
    title: card.title,
    description: card.description ?? null,
    status: mapCardStatusToTask(card.status),
    priority: mapCardPriorityToTask(card.priority),
    startDate: card.startDate ?? null,
    dueDate: card.dueDate ?? null,
  };

  // 신규 연결: linkedTask가 없고 담당자가 있을 때만 Task 생성
  if (!card.linkedTaskId) {
    if (assigneeIds.length === 0) return;
    const task = await prisma.task.create({
      data: {
        ...taskData,
        createdBy: card.createdBy ?? actorId,
        assignees: { create: assigneeIds.map((uid) => ({ userId: uid })) },
      },
    });
    await prisma.boardCard.update({
      where: { id: cardId },
      data: { linkedTaskId: task.id },
    });
    await prisma.taskHistory.create({
      data: { taskId: task.id, userId: actorId, action: 'create', newValue: card.title },
    });
    return;
  }

  // 기존 연결: Task가 살아있을 때만 동기화 (소프트 삭제된 Task는 건드리지 않음)
  const task = await prisma.task.findUnique({
    where: { id: card.linkedTaskId },
    select: { id: true, delYn: true },
  });
  if (!task || task.delYn === '1') return;

  await prisma.task.update({ where: { id: task.id }, data: taskData });
  await prisma.taskAssignee.deleteMany({ where: { taskId: task.id } });
  if (assigneeIds.length > 0) {
    await prisma.taskAssignee.createMany({
      data: assigneeIds.map((uid) => ({ taskId: task.id, userId: uid })),
      skipDuplicates: true,
    });
  }
}

const linkTask = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { taskId } = req.body;
    const updated = await prisma.boardCard.update({
      where: { id: cardId },
      data: { linkedTaskId: taskId ? Number(taskId) : null },
      include: cardInclude,
    });
    res.json(updated);
  } catch (err) { next(err); }
};

// ─── 자동화 ───────────────────────────────────────────────────────────────────

const listAutomations = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const automations = await prisma.boardAutomation.findMany({
      where: { boardId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(automations);
  } catch (err) { next(err); }
};

const createAutomation = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { name, trigger, triggerConfig, action, actionConfig } = req.body;
    if (!name || !trigger || !action) {
      return res.status(400).json({ error: 'name, trigger, action은 필수입니다.' });
    }
    const automation = await prisma.boardAutomation.create({
      data: {
        boardId,
        name,
        trigger,
        triggerConfig: triggerConfig ? JSON.stringify(triggerConfig) : null,
        action,
        actionConfig: actionConfig ? JSON.stringify(actionConfig) : null,
      },
    });
    res.status(201).json(automation);
  } catch (err) { next(err); }
};

const updateAutomation = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const autoId = Number(req.params.autoId);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { name, isActive, trigger, triggerConfig, action, actionConfig } = req.body;
    const automation = await prisma.boardAutomation.update({
      where: { id: autoId },
      data: {
        name,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        trigger,
        triggerConfig: triggerConfig !== undefined ? (triggerConfig ? JSON.stringify(triggerConfig) : null) : undefined,
        action,
        actionConfig: actionConfig !== undefined ? (actionConfig ? JSON.stringify(actionConfig) : null) : undefined,
      },
    });
    res.json(automation);
  } catch (err) { next(err); }
};

const deleteAutomation = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const autoId = Number(req.params.autoId);
    if (!await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    await prisma.boardAutomation.delete({ where: { id: autoId } });
    res.json({ message: '자동화가 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// 자동화 실행 엔진 (내부 함수)
async function executeAutomations(boardId, triggerType, context) {
  try {
    const automations = await prisma.boardAutomation.findMany({
      where: { boardId, isActive: true, trigger: triggerType },
    });
    for (const auto of automations) {
      const tConfig = auto.triggerConfig ? JSON.parse(auto.triggerConfig) : {};
      const aConfig = auto.actionConfig ? JSON.parse(auto.actionConfig) : {};

      // 트리거 조건 검증 (프론트가 { value } 키로 저장)
      if (triggerType === 'card_status_changed') {
        const toFilter = tConfig.to || tConfig.value;
        const fromFilter = tConfig.from;
        if (fromFilter && fromFilter !== context.fromStatus) continue;
        if (toFilter && toFilter !== context.toStatus) continue;
      }

      // 액션 실행 (프론트 action값: set_status, set_priority, notify; actionConfig: { value })
      const actionValue = aConfig.value;
      if ((auto.action === 'notify' || auto.action === 'notify_chat')) {
        const msg = actionValue || `🤖 자동화: ${auto.name}`;
        await notifyLinkedRoom(boardId, msg, context.cardId);
      } else if ((auto.action === 'set_status' || auto.action === 'change_status') && actionValue) {
        await prisma.boardCard.update({
          where: { id: context.cardId },
          data: { status: actionValue },
        });
      } else if (auto.action === 'assign_member' && (actionValue || aConfig.userId)) {
        const uid = Number(actionValue || aConfig.userId);
        await prisma.boardCardAssignee.upsert({
          where: { cardId_userId_type: { cardId: context.cardId, userId: uid, type: 'assignee' } },
          update: {},
          create: { cardId: context.cardId, userId: uid, type: 'assignee' },
        });
      } else if ((auto.action === 'set_priority') && actionValue) {
        await prisma.boardCard.update({
          where: { id: context.cardId },
          data: { priority: actionValue },
        });
      }
    }
  } catch {}
}

// ─── 카드 미리보기 (채팅 링크용) ──────────────────────────────────────────────

const cardPreview = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const card = await prisma.boardCard.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        progress: true,
        dueDate: true,
        coverColor: true,
        coverImageUrl: true,
        assignees: {
          where: { type: 'assignee' },
          include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
        },
        board: { select: { id: true, title: true, icon: true } },
      },
    });
    if (!card) return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });
    res.json(card);
  } catch (err) { next(err); }
};

// ─── 안읽음 카운트 ────────────────────────────────────────────────────────────
// 내가 멤버인 보드들에서, 마지막 읽음 이후 생성된 새 카드/댓글 수 (본인 작성 제외)

const EPOCH = new Date(0);

const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const memberships = await prisma.boardMember.findMany({
      where: { userId },
      select: { boardId: true, lastReadAt: true },
    });

    let total = 0;
    const boards = {};
    for (const m of memberships) {
      const since = m.lastReadAt || EPOCH;
      const [cards, comments] = await Promise.all([
        prisma.boardCard.count({
          where: { boardId: m.boardId, createdAt: { gt: since }, createdBy: { not: userId } },
        }),
        prisma.boardCardComment.count({
          where: { card: { boardId: m.boardId }, createdAt: { gt: since }, userId: { not: userId } },
        }),
      ]);
      const n = cards + comments;
      if (n > 0) boards[m.boardId] = n;
      total += n;
    }
    res.json({ total, boards });
  } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const userId = req.user.id;
    await prisma.boardMember.updateMany({
      where: { boardId, userId },
      data: { lastReadAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─── 저장 뷰 ──────────────────────────────────────────────────────────────────

const listViews = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'viewer')) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    const views = await prisma.boardView.findMany({
      where: { boardId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    res.json(views);
  } catch (err) { next(err); }
};

const createView = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '뷰 생성 권한이 없습니다.' });
    }
    const { name, type = 'kanban', config = null, isDefault = false } = req.body;
    if (!name) return res.status(400).json({ error: '뷰 이름은 필수입니다.' });

    const view = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.boardView.aggregate({ where: { boardId }, _max: { order: true } });
      if (isDefault) {
        await tx.boardView.updateMany({ where: { boardId }, data: { isDefault: false } });
      }
      return tx.boardView.create({
        data: {
          boardId,
          name,
          type,
          config: config ?? null,
          isDefault: !!isDefault,
          order: (maxOrder._max.order ?? -1) + 1,
          createdBy: req.user.id,
        },
      });
    });
    res.status(201).json(view);
  } catch (err) { next(err); }
};

const updateView = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const viewId = Number(req.params.viewId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '뷰 수정 권한이 없습니다.' });
    }
    const { name, type, config, order, isDefault } = req.body;
    const view = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.boardView.updateMany({ where: { boardId }, data: { isDefault: false } });
      }
      return tx.boardView.update({
        where: { id: viewId },
        data: {
          name: name !== undefined ? name : undefined,
          type: type !== undefined ? type : undefined,
          config: config !== undefined ? (config ?? null) : undefined,
          order: order !== undefined ? Number(order) : undefined,
          isDefault: isDefault !== undefined ? !!isDefault : undefined,
        },
      });
    });
    res.json(view);
  } catch (err) { next(err); }
};

const deleteView = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    const viewId = Number(req.params.viewId);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '뷰 삭제 권한이 없습니다.' });
    }
    await prisma.boardView.delete({ where: { id: viewId } });
    res.json({ message: '뷰가 삭제되었습니다.' });
  } catch (err) { next(err); }
};

const reorderViews = async (req, res, next) => {
  try {
    const boardId = Number(req.params.id);
    if (!await hasMinRole(boardId, req.user.id, req.user.role, 'member')) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { items = [] } = req.body;
    await prisma.$transaction(
      items.map((it) =>
        prisma.boardView.update({ where: { id: Number(it.id) }, data: { order: Number(it.order) || 0 } })
      )
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─── 보드 정렬/이동 ───────────────────────────────────────────────────────────
// [{ id, order, categoryId }] — 사이드바 트리에서 보드 순서/소속 카테고리 일괄 갱신
const reorderBoards = async (req, res, next) => {
  try {
    const { items = [] } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items 배열이 필요합니다.' });
    const updatable = [];
    for (const it of items) {
      const boardId = Number(it.id);
      if (await isOwnerOrAdmin(boardId, req.user.id, req.user.role)) {
        updatable.push(it);
      }
    }
    await prisma.$transaction(
      updatable.map((it) =>
        prisma.board.update({
          where: { id: Number(it.id) },
          data: {
            order: it.order !== undefined ? Number(it.order) : undefined,
            categoryId: it.categoryId !== undefined ? (it.categoryId ? Number(it.categoryId) : null) : undefined,
          },
        })
      )
    );
    res.json({ ok: true, updated: updatable.length });
  } catch (err) { next(err); }
};

module.exports = {
  setIO,
  getUnreadCount, markRead,
  listViews, createView, updateView, deleteView, reorderViews,
  reorderBoards,
  list, create, get, update, remove,
  listCards, createCard, updateCard, deleteCard, updateCardProperties, reorderCards,
  uploadCoverImage, deleteCoverImage,
  createComment, updateComment, deleteComment,
  uploadAttachment, downloadAttachment, deleteAttachment,
  uploadCommentAttachment,
  createChecklistItem, updateChecklistItem, deleteChecklistItem,
  listProperties, createProperty, updateProperty, deleteProperty,
  listMembers, addMember, removeMember,
  exportBoard, importBoard,
  cardPreview,
  toggleFavorite,
  duplicateCard,
  listDependencies, addDependency, removeDependency,
  linkTask,
  listAutomations, createAutomation, updateAutomation, deleteAutomation,
};
