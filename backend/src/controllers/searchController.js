const prisma = require('../lib/prisma');

// GET /api/search?q=...&limit=8
// 업무·메모·보드카드·플레이북·WBS·채팅을 한 번에 검색해 그룹별로 반환
const search = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const perGroup = Math.min(Number(req.query.limit) || 8, 20);
    if (q.length < 1) return res.json({ query: q, groups: [] });

    const contains = { contains: q, mode: 'insensitive' };
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    const [tasks, memos, cards, playbooks, wbsProjects, messages, bbsPosts, approvals] = await Promise.all([
      prisma.task.findMany({
        where: { delYn: '0', OR: [{ title: contains }, { description: contains }] },
        select: { id: true, title: true, status: true, dueDate: true },
        orderBy: { updatedAt: 'desc' },
        take: perGroup,
      }),
      prisma.memo.findMany({
        where: { createdBy: req.user.id, OR: [{ title: contains }, { content: contains }] },
        select: { id: true, title: true, content: true },
        orderBy: { updatedAt: 'desc' },
        take: perGroup,
      }),
      prisma.boardCard.findMany({
        where: { OR: [{ title: contains }, { description: contains }] },
        select: { id: true, title: true, status: true, boardId: true, board: { select: { title: true } } },
        orderBy: { updatedAt: 'desc' },
        take: perGroup,
      }),
      prisma.playbook.findMany({
        where: { OR: [{ name: contains }, { description: contains }] },
        select: { id: true, name: true, category: true },
        orderBy: { updatedAt: 'desc' },
        take: perGroup,
      }),
      prisma.wbsProject.findMany({
        where: { OR: [{ name: contains }, { description: contains }] },
        select: { id: true, name: true },
        orderBy: { updatedAt: 'desc' },
        take: perGroup,
      }),
      // 본인이 속한 방의 메시지만 검색
      prisma.chatMessage.findMany({
        where: {
          isDeleted: false,
          content: contains,
          room: { members: { some: { userId: req.user.id } } },
        },
        select: {
          id: true, content: true, roomId: true, createdAt: true,
          room: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: perGroup,
      }),
      // 게시판 글 (제목·내용) — F-67 기밀 게이트: 비관리자는 기밀 글 제외(본인 작성 제외)
      prisma.bbsPost.findMany({
        where: {
          delYn: '0',
          AND: [
            { OR: [{ title: contains }, { content: contains }] },
            ...(isAdmin ? [] : [{ OR: [{ NOT: { sensitivity: 'confidential' } }, { createdBy: userId }] }]),
          ],
        },
        select: { id: true, title: true, categoryId: true, category: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: perGroup,
      }),
      // 전자결재 (제목·문서번호) — 본인 기안/결재자/참조만 (admin은 전체)
      prisma.approvalDocument.findMany({
        where: {
          delYn: '0',
          AND: [
            { OR: [{ title: contains }, { docNo: contains }] },
            ...(isAdmin ? [] : [{ OR: [{ createdBy: userId }, { steps: { some: { approverId: userId } } }] }]),
          ],
        },
        select: { id: true, title: true, docNo: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: perGroup,
      }),
    ]);

    const strip = (s) => (s || '').replace(/<[^>]*>/g, '').slice(0, 100);

    const groups = [
      {
        key: 'task', label: '업무', icon: 'task',
        items: tasks.map((t) => ({
          id: t.id, title: t.title, subtitle: t.status,
          path: `/tasks?taskId=${t.id}`,
        })),
      },
      {
        key: 'card', label: '보드 카드', icon: 'card',
        items: cards.map((c) => ({
          id: c.id, title: c.title, subtitle: c.board?.title || '',
          path: `/boards/${c.boardId}?cardId=${c.id}`,
        })),
      },
      {
        key: 'memo', label: '메모', icon: 'memo',
        items: memos.map((m) => ({
          id: m.id, title: m.title || strip(m.content) || '(제목 없음)',
          subtitle: m.title ? strip(m.content) : '',
          path: '/memos',
        })),
      },
      {
        key: 'playbook', label: '플레이북', icon: 'playbook',
        items: playbooks.map((p) => ({
          id: p.id, title: p.name, subtitle: p.category,
          path: `/playbooks/${p.id}`,
        })),
      },
      {
        key: 'wbs', label: '프로젝트(WBS)', icon: 'wbs',
        items: wbsProjects.map((w) => ({
          id: w.id, title: w.name, subtitle: '',
          path: `/wbs/${w.id}`,
        })),
      },
      {
        key: 'chat', label: '채팅', icon: 'chat',
        items: messages.map((m) => ({
          id: m.id, title: strip(m.content), subtitle: m.room?.name || '',
          path: `/chat?roomId=${m.roomId}`,
        })),
      },
      {
        key: 'bbs', label: '게시판', icon: 'bbs',
        items: bbsPosts.map((p) => ({
          id: p.id, title: p.title, subtitle: p.category?.name || '',
          path: `/bbs?categoryId=${p.categoryId}&postId=${p.id}`,
        })),
      },
      {
        key: 'approval', label: '전자결재', icon: 'approval',
        items: approvals.map((d) => ({
          id: d.id, title: d.title, subtitle: d.docNo || d.status,
          path: `/approvals/${d.id}`,
        })),
      },
    ].filter((g) => g.items.length > 0);

    res.json({ query: q, groups });
  } catch (err) {
    next(err);
  }
};

module.exports = { search };
