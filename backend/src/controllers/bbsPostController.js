const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/bbs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// GET /api/bbs  (query: categoryId, page, limit, search)
const list = async (req, res, next) => {
  try {
    const { categoryId, page = 1, limit = 20, search, searchField = 'title',
            dateField = 'createdAt', dateFrom, dateTo } = req.query;

    // 검색어를 게시글 입력 항목 기준으로 필터링
    const buildSearch = (q, field) => {
      const c = { contains: q, mode: 'insensitive' };
      switch (field) {
        case 'senderOrg': return { senderOrg: c };
        case 'content': return { content: c };
        case 'recipientDepts': return { recipientDepts: { has: q } };
        case 'all': return {
          OR: [{ title: c }, { content: c }, { senderOrg: c }, { recipientDepts: { has: q } }],
        };
        case 'title':
        default: return { title: c };
      }
    };

    // 기간 필터 (작성일 createdAt / 처리기한 officialDueDate)
    const dateCol = ['createdAt', 'officialDueDate'].includes(dateField) ? dateField : 'createdAt';
    const dateRange = {};
    if (dateFrom) dateRange.gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) dateRange.lte = new Date(`${dateTo}T23:59:59.999`);

    const where = {
      delYn: '0',
      ...(categoryId && { categoryId: Number(categoryId) }),
      ...(search && buildSearch(search, searchField)),
      ...(Object.keys(dateRange).length && { [dateCol]: dateRange }),
    };

    const [total, pinned, normal] = await Promise.all([
      prisma.bbsPost.count({ where }),
      prisma.bbsPost.findMany({
        where: { ...where, isPinned: true },
        include: {
          creator: { select: { id: true, displayName: true, avatarColor: true } },
          category: { select: { id: true, name: true } },
          _count: { select: { comments: true, attachments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bbsPost.findMany({
        where: { ...where, isPinned: false },
        include: {
          creator: { select: { id: true, displayName: true, avatarColor: true } },
          category: { select: { id: true, name: true } },
          _count: { select: { comments: true, attachments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
    ]);

    res.json({ total, posts: [...pinned, ...normal] });
  } catch (err) {
    next(err);
  }
};

// GET /api/bbs/:id
const get = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.bbsPost.findFirst({
      where: { id, delYn: '0' },
      include: {
        creator: { select: { id: true, displayName: true, avatarColor: true } },
        category: { select: { id: true, name: true, writeRole: true } },
        attachments: {
          include: { uploader: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    // 조회수 원자 증가
    await prisma.bbsPost.update({ where: { id }, data: { viewCount: { increment: 1 } } });

    res.json({ ...post, viewCount: post.viewCount + 1 });
  } catch (err) {
    next(err);
  }
};

// POST /api/bbs
const create = async (req, res, next) => {
  try {
    const { categoryId, title, content, senderOrg, officialDueDate, recipientDepts } = req.body;
    if (!categoryId || !title || !content) {
      return res.status(400).json({ error: '카테고리, 제목, 내용은 필수입니다.' });
    }

    const category = await prisma.bbsCategory.findUnique({ where: { id: Number(categoryId) } });
    if (!category) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });

    // writeRole 체크
    if (category.writeRole === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '이 게시판에 글을 작성할 권한이 없습니다.' });
    }

    const post = await prisma.bbsPost.create({
      data: {
        categoryId: Number(categoryId),
        title,
        content,
        senderOrg: senderOrg || null,
        officialDueDate: officialDueDate ? new Date(officialDueDate) : null,
        recipientDepts: Array.isArray(recipientDepts) ? recipientDepts : [],
        createdBy: req.user.id,
      },
      include: {
        creator: { select: { id: true, displayName: true, avatarColor: true } },
        category: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
};

// PUT /api/bbs/:id
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.bbsPost.findFirst({ where: { id, delYn: '0' } });
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && post.createdBy !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const { title, content, categoryId, senderOrg, officialDueDate, recipientDepts } = req.body;
    const updated = await prisma.bbsPost.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(categoryId !== undefined && { categoryId: Number(categoryId) }),
        ...(senderOrg !== undefined && { senderOrg: senderOrg || null }),
        ...(officialDueDate !== undefined && { officialDueDate: officialDueDate ? new Date(officialDueDate) : null }),
        ...(recipientDepts !== undefined && { recipientDepts: Array.isArray(recipientDepts) ? recipientDepts : [] }),
      },
      include: {
        creator: { select: { id: true, displayName: true, avatarColor: true } },
        category: { select: { id: true, name: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/bbs/:id
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.bbsPost.findFirst({ where: { id, delYn: '0' } });
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && post.createdBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    await prisma.bbsPost.update({ where: { id }, data: { delYn: '1' } });
    res.json({ message: '게시글이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// PUT /api/bbs/:id/pin  (admin only)
const pin = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.bbsPost.findFirst({ where: { id, delYn: '0' } });
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    const updated = await prisma.bbsPost.update({
      where: { id },
      data: { isPinned: !post.isPinned },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// GET /api/bbs/:id/comments
const listComments = async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const comments = await prisma.bbsComment.findMany({
      where: { postId, parentId: null, delYn: '0' },
      include: {
        user: { select: { id: true, displayName: true, avatarColor: true } },
        attachments: { include: { uploader: { select: { id: true, displayName: true } } } },
        replies: {
          where: { delYn: '0' },
          include: {
            user: { select: { id: true, displayName: true, avatarColor: true } },
            attachments: { include: { uploader: { select: { id: true, displayName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    next(err);
  }
};

// POST /api/bbs/:id/comments
const createComment = async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const { content, parentId } = req.body;
    if (!content) return res.status(400).json({ error: '내용은 필수입니다.' });

    const post = await prisma.bbsPost.findFirst({ where: { id: postId, delYn: '0' } });
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    const comment = await prisma.bbsComment.create({
      data: {
        postId,
        parentId: parentId ? Number(parentId) : null,
        userId: req.user.id,
        content,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarColor: true } },
        attachments: [],
        replies: [],
      },
    });
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

// PUT /api/bbs/:id/comments/:cid
const updateComment = async (req, res, next) => {
  try {
    const cid = Number(req.params.cid);
    const comment = await prisma.bbsComment.findFirst({ where: { id: cid, delYn: '0' } });
    if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && comment.userId !== req.user.id) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const { content } = req.body;
    const updated = await prisma.bbsComment.update({
      where: { id: cid },
      data: { content },
      include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/bbs/:id/comments/:cid
const removeComment = async (req, res, next) => {
  try {
    const cid = Number(req.params.cid);
    const comment = await prisma.bbsComment.findFirst({ where: { id: cid, delYn: '0' } });
    if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && comment.userId !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    await prisma.bbsComment.update({ where: { id: cid }, data: { delYn: '1' } });
    res.json({ message: '댓글이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/bbs/:id/attachments  (multipart/form-data)
const uploadAttachment = async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const { commentId } = req.body;
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const post = await prisma.bbsPost.findFirst({ where: { id: postId, delYn: '0' } });
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const attachment = await prisma.bbsAttachment.create({
      data: {
        postId,
        commentId: commentId ? Number(commentId) : null,
        uploadedBy: req.user.id,
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      include: { uploader: { select: { id: true, displayName: true } } },
    });
    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
};

// GET /api/bbs/:id/attachments/:aid/download
const downloadAttachment = async (req, res, next) => {
  try {
    const attachment = await prisma.bbsAttachment.findUnique({
      where: { id: Number(req.params.aid) },
    });
    if (!attachment) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    const filePath = path.join(UPLOAD_DIR, attachment.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 서버에 존재하지 않습니다.' });

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
    res.setHeader('Content-Type', attachment.mimeType);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/bbs/:id/attachments/:aid
const removeAttachment = async (req, res, next) => {
  try {
    const attachment = await prisma.bbsAttachment.findUnique({
      where: { id: Number(req.params.aid) },
    });
    if (!attachment) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && attachment.uploadedBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.bbsAttachment.delete({ where: { id: attachment.id } });
    res.json({ message: '파일이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list, get, create, update, remove, pin,
  listComments, createComment, updateComment, removeComment,
  uploadAttachment, downloadAttachment, removeAttachment,
};
