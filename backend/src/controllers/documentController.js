// 통합 문서/첨부 허브(F-68) — M365 SharePoint 라이브러리 경량판.
// 여러 도메인(업무·보드·게시판·결재·메일)의 기존 첨부를 읽기 전용으로 집계.
// polymorphic 마이그레이션 없이 기존 테이블만 조회(무의존·additive). 도메인별 접근제어를 존중:
//  - 메일: 발신자/수신자만  - 결재: 기안자/결재자만(관리자 예외 없음: 메일)  - 게시판: 기밀 라벨(F-67) 게이트
const prisma = require('../lib/prisma');

const SEL = { id: true, originalName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true };
const uploaderSel = { uploader: { select: { id: true, displayName: true } } };

// GET /api/documents?q=&source=&limit=
const list = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const q = (req.query.q || '').trim();
    const source = req.query.source || '';
    const perSource = Math.min(Number(req.query.limit) || 60, 100);
    const nameFilter = q ? { originalName: { contains: q, mode: 'insensitive' } } : {};

    // 게시판 기밀 게이트(F-67)
    const bbsSens = isAdmin ? {} : { OR: [{ NOT: { sensitivity: 'confidential' } }, { createdBy: uid }] };

    const want = (s) => !source || source === s;

    const [tasks, cards, posts, approvals, mails] = await Promise.all([
      want('task') ? prisma.taskAttachment.findMany({
        where: { ...nameFilter, task: { delYn: '0' } },
        select: { ...SEL, taskId: true, task: { select: { title: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: perSource,
      }) : [],
      want('board') ? prisma.boardCardAttachment.findMany({
        where: { ...nameFilter },
        select: { ...SEL, cardId: true, card: { select: { title: true, boardId: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: perSource,
      }) : [],
      want('bbs') ? prisma.bbsAttachment.findMany({
        where: { ...nameFilter, post: { delYn: '0', ...bbsSens } },
        select: { ...SEL, postId: true, post: { select: { title: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: perSource,
      }) : [],
      want('approval') ? prisma.approvalAttachment.findMany({
        where: {
          ...nameFilter,
          document: { delYn: '0', ...(isAdmin ? {} : { OR: [{ createdBy: uid }, { steps: { some: { approverId: uid } } }] }) },
        },
        select: { ...SEL, documentId: true, document: { select: { title: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: perSource,
      }) : [],
      // 메일은 개인정보 → 관리자도 예외 없이 발신자/수신자만
      want('mail') ? prisma.internalMailAttachment.findMany({
        where: {
          ...nameFilter,
          mail: { OR: [{ fromUserId: uid }, { recipients: { some: { userId: uid } } }] },
        },
        select: { ...SEL, mailId: true, mail: { select: { subject: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: perSource,
      }) : [],
    ]);

    const norm = (rows, source, map) => rows.map((r) => ({
      key: `${source}-${r.id}`, source,
      fileName: r.originalName, mimeType: r.mimeType, size: r.size,
      uploaderName: r.uploader?.displayName || '',
      createdAt: r.createdAt,
      ...map(r),
    }));

    const items = [
      ...norm(tasks, 'task', (r) => ({ contextTitle: r.task?.title || '', contextPath: `/tasks?taskId=${r.taskId}` })),
      ...norm(cards, 'board', (r) => ({ contextTitle: r.card?.title || '', contextPath: `/boards/${r.card?.boardId}?cardId=${r.cardId}` })),
      ...norm(posts, 'bbs', (r) => ({ contextTitle: r.post?.title || '', contextPath: `/bbs?postId=${r.postId}` })),
      ...norm(approvals, 'approval', (r) => ({ contextTitle: r.document?.title || '', contextPath: `/approvals/${r.documentId}` })),
      ...norm(mails, 'mail', (r) => ({ contextTitle: r.mail?.subject || '', contextPath: `/mail?mailId=${r.mailId}` })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const counts = items.reduce((acc, it) => { acc[it.source] = (acc[it.source] || 0) + 1; return acc; }, {});
    res.json({ total: items.length, counts, items: items.slice(0, 200) });
  } catch (err) { next(err); }
};

module.exports = { list };
