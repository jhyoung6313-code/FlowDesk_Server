// 통합 문서/첨부 허브(F-68) — M365 SharePoint 라이브러리 경량판.
// 여러 도메인(업무·보드·게시판·결재·메일·WBS 산출물)의 기존 첨부를 읽기 전용으로 집계.
// polymorphic 마이그레이션 없이 기존 테이블만 조회(무의존·additive). 도메인별 접근제어를 존중:
//  - 메일: 발신자/수신자만  - 결재: 기안자/결재자만(관리자 예외 없음: 메일)  - 게시판: 기밀 라벨(F-67) 게이트  - 보드: 보드 멤버만  - WBS: 전역 공개(기존 신뢰모델과 동일)
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const { approvalVisibilityWhere } = require('../services/approvalAccess');

const SEL = { id: true, originalName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true };
const uploaderSel = { uploader: { select: { id: true, displayName: true, avatarColor: true } } };

// 본문 전문검색(라이트): 텍스트 계열 파일만 디스크에서 직접 읽어 내용 매칭(외부 파서 의존 없음)
const TEXT_MIME = /^text\/(plain|csv|markdown)$/i;
const TEXT_CONTENT_MAX_BYTES = 300 * 1024;
const textDirs = {
  task: path.join(__dirname, '../../uploads'),
  board: path.join(__dirname, '../../uploads/board-cards'),
  bbs: path.join(__dirname, '../../uploads/bbs'),
  approval: path.join(__dirname, '../../uploads/approval'),
  mail: path.join(__dirname, '../../uploads/mail'),
  wbs: path.join(__dirname, '../../uploads/wbs-deliverables'),
};
// 비동기 I/O 사용 — 동기 fs 호출을 쓰면 검색 중인 요청만이 아니라 그 순간 접속한 모든
// 사용자의 요청까지 Node 이벤트루프 전체가 블로킹된다(200명 동시접속 환경에서는 치명적).
async function textContentMatches(source, storedName, mimeType, q) {
  if (!q || !storedName || !TEXT_MIME.test(mimeType || '')) return false;
  try {
    const filePath = path.join(textDirs[source], storedName);
    const stat = await fs.promises.stat(filePath);
    if (stat.size > TEXT_CONTENT_MAX_BYTES) return false;
    const content = await fs.promises.readFile(filePath, 'utf8');
    return content.toLowerCase().includes(q.toLowerCase());
  } catch {
    return false;
  }
}

// GET /api/documents?q=&source=&limit=&favorite=1
const list = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const q = (req.query.q || '').trim();
    const source = req.query.source || '';
    const onlyFavorite = req.query.favorite === '1';
    const perSource = Math.min(Number(req.query.limit) || 60, 100);
    // 파일명 매치는 DB에서 전량 커버(기존 동작 유지), 텍스트 계열 파일은 추가로 끌어와 본문 내용까지 매칭
    const qFilter = q
      ? { OR: [{ originalName: { contains: q, mode: 'insensitive' } }, { mimeType: { in: ['text/plain', 'text/csv', 'text/markdown'] } }] }
      : {};
    const qFilterWbs = q
      ? { OR: [{ deliverableOrigName: { contains: q, mode: 'insensitive' } }, { deliverableMime: { in: ['text/plain', 'text/csv', 'text/markdown'] } }] }
      : {};

    // 즐겨찾기(F-68) 먼저 조회 — "즐겨찾기만" 필터는 아래에서 각 소스 쿼리의 id 조건으로
    // 직접 들어가야 한다. perSource(최신 N건) 제한에 걸려 오래된 즐겨찾기가 누락되면 안 됨.
    const favorites = await prisma.documentFavorite.findMany({ where: { userId: uid }, select: { source: true, refId: true } });
    const favIdsBySource = favorites.reduce((acc, f) => {
      (acc[f.source] ||= []).push(f.refId);
      return acc;
    }, {});
    // 즐겨찾기만 볼 때는 "그 사용자의 즐겨찾기 전체"가 기준이라 perSource 제한을 적용하지 않음
    // (개인이 수백 건을 즐겨찾기하는 극단적 경우를 가정해도 넉넉한 상한만 둔다)
    const favTake = 1000;
    const sourceWhere = (source, structuralFilter, nameFilter = qFilter) => ({
      ...(onlyFavorite ? { id: { in: favIdsBySource[source] || [] } } : nameFilter),
      ...structuralFilter,
    });

    // 게시판 기밀 게이트(F-67)
    const bbsSens = isAdmin ? {} : { OR: [{ NOT: { sensitivity: 'confidential' } }, { createdBy: uid }] };

    const want = (s) => !source || source === s;

    const [tasks, cards, posts, approvals, mails, wbsTasks] = await Promise.all([
      want('task') ? prisma.taskAttachment.findMany({
        where: sourceWhere('task', { task: { delYn: '0' } }),
        select: { ...SEL, taskId: true, storedName: true, task: { select: { title: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: onlyFavorite ? favTake : perSource,
      }) : [],
      want('board') ? prisma.boardCardAttachment.findMany({
        where: sourceWhere('board', isAdmin ? {} : { card: { board: { members: { some: { userId: uid } } } } }),
        select: { ...SEL, cardId: true, storedName: true, card: { select: { title: true, boardId: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: onlyFavorite ? favTake : perSource,
      }) : [],
      want('bbs') ? prisma.bbsAttachment.findMany({
        where: sourceWhere('bbs', { post: { delYn: '0', ...bbsSens } }),
        select: { ...SEL, postId: true, storedName: true, post: { select: { title: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: onlyFavorite ? favTake : perSource,
      }) : [],
      want('approval') ? prisma.approvalAttachment.findMany({
        where: sourceWhere('approval', { document: { delYn: '0', ...(isAdmin ? {} : approvalVisibilityWhere(uid)) } }),
        select: { ...SEL, documentId: true, storedName: true, document: { select: { title: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: onlyFavorite ? favTake : perSource,
      }) : [],
      // 메일은 개인정보 → 관리자도 예외 없이 발신자/수신자만
      want('mail') ? prisma.internalMailAttachment.findMany({
        where: sourceWhere('mail', { mail: { OR: [{ fromUserId: uid }, { recipients: { some: { userId: uid } } }] } }),
        select: { ...SEL, mailId: true, storedName: true, mail: { select: { subject: true } }, ...uploaderSel },
        orderBy: { createdAt: 'desc' }, take: onlyFavorite ? favTake : perSource,
      }) : [],
      // WBS 산출물: 업무/보드와 동일하게 전역 공개 신뢰모델(별도 멤버십 게이트 없음)
      want('wbs') ? prisma.wbsTask.findMany({
        where: sourceWhere('wbs', { deliverableFile: { not: null } }, qFilterWbs),
        select: {
          id: true, deliverableFile: true, deliverableOrigName: true, deliverableMime: true,
          deliverableSize: true, deliverableUploadedBy: true, deliverableUploadedAt: true,
          name: true, projectId: true,
        },
        orderBy: { deliverableUploadedAt: 'desc' }, take: onlyFavorite ? favTake : perSource,
      }) : [],
    ]);

    const favKeySet = new Set(favorites.map((f) => `${f.source}-${f.refId}`));

    // WBS 업로더 표시용 이름 일괄 조회(FK 미설정이라 별도 조회)
    const wbsUploaderIds = [...new Set(wbsTasks.map((t) => t.deliverableUploadedBy).filter(Boolean))];
    const wbsUploaders = wbsUploaderIds.length
      ? await prisma.user.findMany({ where: { id: { in: wbsUploaderIds } }, select: { id: true, displayName: true, avatarColor: true } })
      : [];
    const wbsUploaderMap = Object.fromEntries(wbsUploaders.map((u) => [u.id, u]));

    const lowerQ = q.toLowerCase();
    const nameMatches = (name) => !q || (name || '').toLowerCase().includes(lowerQ);

    // textContentMatches가 비동기(파일 I/O)라 필터링도 Promise.all로 병렬 수행 — 소스별
    // norm() 호출 자체도 서로 독립적이므로 아래에서 전부 Promise.all로 동시에 돌린다.
    const norm = async (rows, source, map, matchFields) => {
      const matched = await Promise.all(rows.map(async (r) => {
        if (!q) return r;
        if (matchFields.some((f) => nameMatches(f(r)))) return r;
        const hit = await textContentMatches(source, map.storedName(r), r.mimeType || map.mimeType?.(r), q);
        return hit ? r : null;
      }));
      return matched.filter(Boolean).map((r) => {
        const refId = r.id;
        return {
          key: `${source}-${refId}`, source, refId,
          fileName: map.fileName(r), mimeType: map.mimeType ? map.mimeType(r) : r.mimeType, size: map.size ? map.size(r) : r.size,
          uploaderName: map.uploaderName(r), uploaderId: map.uploaderId(r), uploaderColor: map.uploaderColor(r),
          createdAt: map.createdAt(r),
          isFavorite: favKeySet.has(`${source}-${refId}`),
          ...map.extra(r),
        };
      });
    };

    const [taskItems, boardItems, bbsItems, approvalItems, mailItems, wbsItems] = await Promise.all([
      norm(tasks, 'task',
        { storedName: (r) => r.storedName, fileName: (r) => r.originalName, uploaderName: (r) => r.uploader?.displayName || '', uploaderId: (r) => r.uploader?.id || null, uploaderColor: (r) => r.uploader?.avatarColor || null, createdAt: (r) => r.createdAt, extra: (r) => ({ contextTitle: r.task?.title || '', contextPath: `/tasks?taskId=${r.taskId}`, downloadUrl: `/api/tasks/attachments/${r.id}/download` }) },
        [(r) => r.originalName, (r) => r.task?.title]),
      norm(cards, 'board',
        { storedName: (r) => r.storedName, fileName: (r) => r.originalName, uploaderName: (r) => r.uploader?.displayName || '', uploaderId: (r) => r.uploader?.id || null, uploaderColor: (r) => r.uploader?.avatarColor || null, createdAt: (r) => r.createdAt, extra: (r) => ({ contextTitle: r.card?.title || '', contextPath: `/boards/${r.card?.boardId}?cardId=${r.cardId}`, downloadUrl: `/api/boards/${r.card?.boardId}/cards/${r.cardId}/attachments/${r.id}/download` }) },
        [(r) => r.originalName, (r) => r.card?.title]),
      norm(posts, 'bbs',
        { storedName: (r) => r.storedName, fileName: (r) => r.originalName, uploaderName: (r) => r.uploader?.displayName || '', uploaderId: (r) => r.uploader?.id || null, uploaderColor: (r) => r.uploader?.avatarColor || null, createdAt: (r) => r.createdAt, extra: (r) => ({ contextTitle: r.post?.title || '', contextPath: `/bbs?postId=${r.postId}`, downloadUrl: `/api/bbs/${r.postId}/attachments/${r.id}/download` }) },
        [(r) => r.originalName, (r) => r.post?.title]),
      norm(approvals, 'approval',
        { storedName: (r) => r.storedName, fileName: (r) => r.originalName, uploaderName: (r) => r.uploader?.displayName || '', uploaderId: (r) => r.uploader?.id || null, uploaderColor: (r) => r.uploader?.avatarColor || null, createdAt: (r) => r.createdAt, extra: (r) => ({ contextTitle: r.document?.title || '', contextPath: `/approvals/${r.documentId}`, downloadUrl: `/api/approvals/${r.documentId}/attachments/${r.id}/download` }) },
        [(r) => r.originalName, (r) => r.document?.title]),
      norm(mails, 'mail',
        { storedName: (r) => r.storedName, fileName: (r) => r.originalName, uploaderName: (r) => r.uploader?.displayName || '', uploaderId: (r) => r.uploader?.id || null, uploaderColor: (r) => r.uploader?.avatarColor || null, createdAt: (r) => r.createdAt, extra: (r) => ({ contextTitle: r.mail?.subject || '', contextPath: `/mail?mailId=${r.mailId}`, downloadUrl: `/api/mail/${r.mailId}/attachments/${r.id}/download` }) },
        [(r) => r.originalName, (r) => r.mail?.subject]),
      norm(wbsTasks, 'wbs',
        {
          storedName: (r) => r.deliverableFile, mimeType: (r) => r.deliverableMime, size: (r) => r.deliverableSize,
          fileName: (r) => r.deliverableOrigName || r.deliverableFile,
          uploaderName: (r) => wbsUploaderMap[r.deliverableUploadedBy]?.displayName || '',
          uploaderId: (r) => wbsUploaderMap[r.deliverableUploadedBy]?.id || null,
          uploaderColor: (r) => wbsUploaderMap[r.deliverableUploadedBy]?.avatarColor || null,
          createdAt: (r) => r.deliverableUploadedAt,
          extra: (r) => ({ contextTitle: r.name || '', contextPath: `/wbs/${r.projectId}`, downloadUrl: `/api/wbs/tasks/${r.id}/deliverable` }),
        },
        [(r) => r.deliverableOrigName, (r) => r.name]),
    ]);

    const items = [...taskItems, ...boardItems, ...bbsItems, ...approvalItems, ...mailItems, ...wbsItems]
      .filter((it) => !onlyFavorite || it.isFavorite)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const counts = items.reduce((acc, it) => { acc[it.source] = (acc[it.source] || 0) + 1; return acc; }, {});
    res.json({ total: items.length, counts, items: items.slice(0, 200) });
  } catch (err) { next(err); }
};

// POST /api/documents/favorite  { source, refId }
const toggleFavorite = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const source = String(req.body.source || '');
    const refId = Number(req.body.refId);
    if (!source || !refId) return res.status(400).json({ error: 'source, refId가 필요합니다.' });

    const existing = await prisma.documentFavorite.findUnique({ where: { userId_source_refId: { userId: uid, source, refId } } });
    if (existing) {
      await prisma.documentFavorite.delete({ where: { id: existing.id } });
      return res.json({ favorite: false });
    }
    await prisma.documentFavorite.create({ data: { userId: uid, source, refId } });
    res.json({ favorite: true });
  } catch (err) { next(err); }
};

module.exports = { list, toggleFavorite };
