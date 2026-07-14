// ─────────────────────────────────────────────────────────────
// F-59 협업 위키/문서 — 스페이스 · 문서(트리) · 버전 · 댓글
// 인증 필요(routes에서 authenticate).
// 접근 규칙(MVP): 스페이스 visibility public=전원, private=작성자·관리자.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');

const USER_SEL = { id: true, displayName: true, avatarColor: true };

function isAdmin(req) { return req.user.role === 'admin'; }

// 스페이스 접근 가능 여부
function canAccessSpace(space, req) {
  if (space.visibility === 'public') return true;
  return isAdmin(req) || space.createdBy === req.user.id;
}

// 민감도 라벨(F-67): 기밀(confidential) 문서는 작성자·관리자만 열람
function canSeeSensitive(doc, req) {
  if (doc.sensitivity !== 'confidential') return true;
  return isAdmin(req) || doc.createdBy === req.user.id;
}
const SENSITIVITIES = ['public', 'internal', 'confidential'];

// ── 스페이스 ──────────────────────────────────────────────────
exports.listSpaces = async (req, res, next) => {
  try {
    const spaces = await prisma.wikiSpace.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        creator: { select: USER_SEL },
        docs: {
          where: { delYn: '0' },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, icon: true, parentId: true, isFavorite: true, updatedAt: true, sensitivity: true, createdBy: true },
        },
      },
    });
    // 스페이스 접근 필터 + 기밀 문서(작성자·관리자 외) 트리에서 제외
    const visible = spaces
      .filter((s) => canAccessSpace(s, req))
      .map((s) => ({ ...s, docs: s.docs.filter((d) => canSeeSensitive(d, req)) }));
    res.json(visible);
  } catch (err) { next(err); }
};

exports.createSpace = async (req, res, next) => {
  try {
    const { name, icon, color, visibility } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '스페이스 이름을 입력하세요.' });
    const max = await prisma.wikiSpace.aggregate({ _max: { sortOrder: true } });
    const space = await prisma.wikiSpace.create({
      data: {
        name: name.trim().slice(0, 100),
        icon: icon || null,
        color: color || null,
        visibility: visibility === 'private' ? 'private' : 'public',
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        createdBy: req.user.id,
      },
      include: { creator: { select: USER_SEL }, docs: true },
    });
    res.status(201).json(space);
  } catch (err) { next(err); }
};

exports.updateSpace = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const space = await prisma.wikiSpace.findUnique({ where: { id } });
    if (!space) return res.status(404).json({ error: '스페이스를 찾을 수 없습니다.' });
    if (!isAdmin(req) && space.createdBy !== req.user.id) return res.status(403).json({ error: '수정 권한이 없습니다.' });
    const { name, icon, color, visibility } = req.body || {};
    const updated = await prisma.wikiSpace.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim().slice(0, 100) } : {}),
        ...(icon !== undefined ? { icon: icon || null } : {}),
        ...(color !== undefined ? { color: color || null } : {}),
        ...(visibility !== undefined ? { visibility: visibility === 'private' ? 'private' : 'public' } : {}),
      },
      include: { creator: { select: USER_SEL } },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

exports.deleteSpace = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const space = await prisma.wikiSpace.findUnique({ where: { id } });
    if (!space) return res.status(404).json({ error: '스페이스를 찾을 수 없습니다.' });
    if (!isAdmin(req) && space.createdBy !== req.user.id) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    await prisma.wikiSpace.delete({ where: { id } }); // 문서·버전·댓글 cascade
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 문서 ──────────────────────────────────────────────────────
async function loadAccessibleDoc(id, req) {
  const doc = await prisma.wikiDoc.findFirst({
    where: { id, delYn: '0' },
    include: {
      space: true,
      creator: { select: USER_SEL },
    },
  });
  if (!doc) return { error: 404 };
  if (!canAccessSpace(doc.space, req)) return { error: 403 };
  if (!canSeeSensitive(doc, req)) return { error: 403 }; // 기밀 문서 게이트(F-67)
  return { doc };
}

exports.getDoc = async (req, res, next) => {
  try {
    const { doc, error } = await loadAccessibleDoc(Number(req.params.id), req);
    if (error === 404) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
    if (error === 403) return res.status(403).json({ error: '열람 권한이 없습니다.' });
    res.json(doc);
  } catch (err) { next(err); }
};

exports.createDoc = async (req, res, next) => {
  try {
    const { spaceId, parentId, title, sensitivity } = req.body || {};
    const space = await prisma.wikiSpace.findUnique({ where: { id: Number(spaceId) } });
    if (!space) return res.status(400).json({ error: '스페이스를 찾을 수 없습니다.' });
    if (!canAccessSpace(space, req)) return res.status(403).json({ error: '문서 생성 권한이 없습니다.' });
    const max = await prisma.wikiDoc.aggregate({
      where: { spaceId: space.id, parentId: parentId ? Number(parentId) : null },
      _max: { sortOrder: true },
    });
    const doc = await prisma.wikiDoc.create({
      data: {
        spaceId: space.id,
        parentId: parentId ? Number(parentId) : null,
        title: (title || '제목 없음').slice(0, 200),
        content: '',
        sensitivity: SENSITIVITIES.includes(sensitivity) ? sensitivity : 'public',
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      },
      include: { creator: { select: USER_SEL } },
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
};

exports.updateDoc = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { doc, error } = await loadAccessibleDoc(id, req);
    if (error === 404) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
    if (error === 403) return res.status(403).json({ error: '수정 권한이 없습니다.' });

    const { title, content, icon, isFavorite, parentId, sensitivity } = req.body || {};
    const contentChanged = content !== undefined && content !== doc.content;

    // 본문 변경 시 직전 상태를 버전으로 스냅샷(빈 문서 최초 저장은 제외)
    if (contentChanged && (doc.content || '').trim()) {
      await prisma.wikiDocVersion.create({
        data: { docId: id, title: doc.title, content: doc.content, editedBy: req.user.id },
      });
    }

    const updated = await prisma.wikiDoc.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title).slice(0, 200) || '제목 없음' } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(icon !== undefined ? { icon: icon || null } : {}),
        ...(isFavorite !== undefined ? { isFavorite: !!isFavorite } : {}),
        ...(parentId !== undefined ? { parentId: parentId ? Number(parentId) : null } : {}),
        ...(sensitivity !== undefined && SENSITIVITIES.includes(sensitivity) ? { sensitivity } : {}),
        updatedBy: req.user.id,
      },
      include: { creator: { select: USER_SEL } },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

exports.deleteDoc = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { doc, error } = await loadAccessibleDoc(id, req);
    if (error === 404) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
    if (error === 403) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    // 하위 문서 포함 소프트 삭제
    await prisma.wikiDoc.updateMany({
      where: { OR: [{ id }, { parentId: id }] },
      data: { delYn: '1' },
    });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 버전 이력 ─────────────────────────────────────────────────
exports.listVersions = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadAccessibleDoc(id, req);
    if (error === 404) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
    if (error === 403) return res.status(403).json({ error: '열람 권한이 없습니다.' });
    const versions = await prisma.wikiDocVersion.findMany({
      where: { docId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // 편집자 이름 매핑
    const ids = [...new Set(versions.map((v) => v.editedBy))];
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    const nameMap = Object.fromEntries(users.map((u) => [u.id, u.displayName]));
    res.json(versions.map((v) => ({ ...v, editorName: nameMap[v.editedBy] || '(삭제된 사용자)' })));
  } catch (err) { next(err); }
};

exports.restoreVersion = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const vid = Number(req.params.vid);
    const { doc, error } = await loadAccessibleDoc(id, req);
    if (error === 404) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
    if (error === 403) return res.status(403).json({ error: '복원 권한이 없습니다.' });
    const ver = await prisma.wikiDocVersion.findFirst({ where: { id: vid, docId: id } });
    if (!ver) return res.status(404).json({ error: '버전을 찾을 수 없습니다.' });
    // 현재 상태를 버전으로 남기고 복원
    await prisma.wikiDocVersion.create({
      data: { docId: id, title: doc.title, content: doc.content, editedBy: req.user.id },
    });
    const updated = await prisma.wikiDoc.update({
      where: { id },
      data: { title: ver.title, content: ver.content, updatedBy: req.user.id },
      include: { creator: { select: USER_SEL } },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

// ── 댓글 ──────────────────────────────────────────────────────
exports.listComments = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadAccessibleDoc(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '문서를 찾을 수 없습니다.' : '열람 권한이 없습니다.' });
    const comments = await prisma.wikiDocComment.findMany({
      where: { docId: id, delYn: '0' },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: USER_SEL } },
    });
    res.json(comments);
  } catch (err) { next(err); }
};

exports.createComment = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { error } = await loadAccessibleDoc(id, req);
    if (error) return res.status(error).json({ error: error === 404 ? '문서를 찾을 수 없습니다.' : '권한이 없습니다.' });
    const content = (req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: '내용을 입력하세요.' });
    const comment = await prisma.wikiDocComment.create({
      data: { docId: id, content, createdBy: req.user.id },
      include: { author: { select: USER_SEL } },
    });
    res.status(201).json(comment);
  } catch (err) { next(err); }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const cid = Number(req.params.cid);
    const comment = await prisma.wikiDocComment.findUnique({ where: { id: cid } });
    if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    if (!isAdmin(req) && comment.createdBy !== req.user.id) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    await prisma.wikiDocComment.update({ where: { id: cid }, data: { delYn: '1' } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};
