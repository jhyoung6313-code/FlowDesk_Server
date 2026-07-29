const prisma = require('../lib/prisma');
const path = require('path');
const fs = require('fs');
const { pushNotification } = require('../services/sseService');

const MAIL_UPLOAD_DIR = path.join(__dirname, '../../uploads/mail');
if (!fs.existsSync(MAIL_UPLOAD_DIR)) fs.mkdirSync(MAIL_UPLOAD_DIR, { recursive: true });

/* 폴더별 목록 조회 (검색 q · 라벨 labelId 필터 지원) */
exports.list = async (req, res, next) => {
  try {
    const me = req.user.id;
    const folder = req.query.folder || 'inbox';
    const q = (req.query.q || '').trim();
    const labelId = req.query.labelId ? parseInt(req.query.labelId) : null;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    // 메일 본문/제목/보낸이 검색 조건
    const buildMailSearch = () => {
      if (!q) return {};
      return {
        OR: [
          { subject: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
          { from: { displayName: { contains: q, mode: 'insensitive' } } },
        ],
      };
    };
    const labelFilter = labelId ? { labelLinks: { some: { labelId } } } : {};

    const mailInclude = {
      from: { select: { id: true, displayName: true } },
      attachments: { select: { id: true } },
      labelLinks: { include: { label: true } },
    };

    let mails = [];
    let total = 0;

    if (folder === 'sent') {
      const where = { fromUserId: me, isDraft: false, senderDeleted: false, ...buildMailSearch(), ...labelFilter };
      [mails, total] = await Promise.all([
        prisma.internalMail.findMany({
          where,
          include: {
            ...mailInclude,
            recipients: { where: { type: 'to' }, include: { user: { select: { id: true, displayName: true } } }, take: 5 },
          },
          orderBy: { createdAt: 'desc' }, skip, take: limit,
        }),
        prisma.internalMail.count({ where }),
      ]);
      mails = mails.map(m => ({ ...m, _folder: 'sent', isRead: true, labels: m.labelLinks?.map(l => l.label) || [] }));

    } else if (folder === 'drafts') {
      const where = { fromUserId: me, isDraft: true, ...buildMailSearch(), ...labelFilter };
      [mails, total] = await Promise.all([
        prisma.internalMail.findMany({
          where,
          include: {
            ...mailInclude,
            recipients: { where: { type: 'to' }, include: { user: { select: { id: true, displayName: true } } }, take: 5 },
          },
          orderBy: { updatedAt: 'desc' }, skip, take: limit,
        }),
        prisma.internalMail.count({ where }),
      ]);
      mails = mails.map(m => ({ ...m, _folder: 'drafts', isRead: true, labels: m.labelLinks?.map(l => l.label) || [] }));

    } else {
      // inbox / starred / trash — recipient 기반
      const whereRecipient = {
        ...(folder === 'inbox'   ? { userId: me, folder: 'inbox' } :
            folder === 'starred' ? { userId: me, isStarred: true, folder: { not: 'trash' } } :
                                   { userId: me, folder: 'trash' }),
        mail: { isDraft: false, ...buildMailSearch(), ...labelFilter },
      };

      const [rows, count] = await Promise.all([
        prisma.internalMailRecipient.findMany({
          where: whereRecipient,
          include: { mail: { include: mailInclude } },
          orderBy: { mail: { createdAt: 'desc' } }, skip, take: limit,
        }),
        prisma.internalMailRecipient.count({ where: whereRecipient }),
      ]);

      mails = rows
        .filter(r => r.mail)
        .map(r => ({
          ...r.mail,
          _recipientId: r.id,
          _folder: folder,
          isRead: r.isRead,
          isStarred: r.isStarred,
          folder: r.folder,
          labels: r.mail.labelLinks?.map(l => l.label) || [],
        }));
      total = count;
    }

    res.json({ mails, total, page, limit });
  } catch (err) { next(err); }
};

/* 단건 조회 + 읽음 처리 */
exports.get = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);

    const mail = await prisma.internalMail.findUnique({
      where: { id },
      include: {
        from: { select: { id: true, displayName: true } },
        recipients: {
          include: { user: { select: { id: true, displayName: true } } },
        },
        attachments: true,
        comments: {
          include: { user: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        labelLinks: { include: { label: true } },
      },
    });
    if (!mail) return res.status(404).json({ error: '메일을 찾을 수 없습니다.' });

    // 수신자인 경우 읽음 처리 (열람 시각 기록)
    const recip = mail.recipients.find(r => r.userId === me);
    if (recip && !recip.isRead) {
      const now = new Date();
      await prisma.internalMailRecipient.update({
        where: { id: recip.id },
        data: { isRead: true, readAt: now },
      });
      recip.isRead = true;
      recip.readAt = now;
    }

    // 같은 스레드의 다른 메일 목록 (대화형 보기용)
    const threadRoot = mail.threadId || mail.id;
    const threadMailsRaw = await prisma.internalMail.findMany({
      where: {
        isDraft: false,
        OR: [{ threadId: threadRoot }, { id: threadRoot }],
        AND: [{ OR: [{ fromUserId: me }, { recipients: { some: { userId: me } } }] }],
      },
      include: {
        from: { select: { id: true, displayName: true } },
        attachments: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const thread = threadMailsRaw.map(m => ({
      id: m.id, subject: m.subject, fromUserId: m.fromUserId, from: m.from,
      createdAt: m.createdAt, attachmentCount: m.attachments.length, priority: m.priority,
    }));

    const isRead = recip ? true : (mail.fromUserId === me);
    const labels = mail.labelLinks?.map(l => l.label) || [];
    res.json({ ...mail, isRead, labels, thread });
  } catch (err) { next(err); }
};

/* ── 메일 댓글 ── */
async function assertMailParticipant(mailId, userId) {
  const mail = await prisma.internalMail.findUnique({
    where: { id: mailId },
    include: { recipients: { where: { userId } } },
  });
  if (!mail) return { error: 404 };
  const isParticipant = mail.fromUserId === userId || mail.recipients.length > 0;
  if (!isParticipant) return { error: 403 };
  return { mail };
}

exports.listComments = async (req, res, next) => {
  try {
    const me = req.user.id;
    const mailId = parseInt(req.params.id);
    const chk = await assertMailParticipant(mailId, me);
    if (chk.error) return res.status(chk.error).json({ error: chk.error === 404 ? '메일을 찾을 수 없습니다.' : '권한이 없습니다.' });

    const comments = await prisma.internalMailComment.findMany({
      where: { mailId },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) { next(err); }
};

exports.createComment = async (req, res, next) => {
  try {
    const me = req.user.id;
    const mailId = parseInt(req.params.id);
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력하세요.' });

    const chk = await assertMailParticipant(mailId, me);
    if (chk.error) return res.status(chk.error).json({ error: chk.error === 404 ? '메일을 찾을 수 없습니다.' : '권한이 없습니다.' });

    const comment = await prisma.internalMailComment.create({
      data: { mailId, userId: me, content: content.trim() },
      include: { user: { select: { id: true, displayName: true } } },
    });
    res.json(comment);
  } catch (err) { next(err); }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const me = req.user.id;
    const cid = parseInt(req.params.cid);
    const comment = await prisma.internalMailComment.findUnique({ where: { id: cid } });
    if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    if (comment.userId !== me && req.user.role !== 'admin') return res.status(403).json({ error: '권한이 없습니다.' });
    await prisma.internalMailComment.delete({ where: { id: cid } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

/* 메일 발송 / 임시저장 */
exports.compose = async (req, res, next) => {
  try {
    const me = req.user.id;
    const { to = [], cc = [], bcc = [], subject, body, isDraft = false, parentId, forwardedFrom, priority = 'normal' } = req.body;

    if (!isDraft && (!to.length || !subject)) {
      return res.status(400).json({ error: '수신자와 제목은 필수입니다.' });
    }

    // 스레드 루트 결정: 답장/전달 원본이 있으면 그 원본의 threadId(없으면 원본 id)를 따른다
    let threadId = null;
    const srcId = parentId ? parseInt(parentId) : (forwardedFrom ? parseInt(forwardedFrom) : null);
    if (srcId) {
      const src = await prisma.internalMail.findUnique({ where: { id: srcId }, select: { id: true, threadId: true } });
      if (src) threadId = src.threadId || src.id;
    }

    const mail = await prisma.internalMail.create({
      data: {
        fromUserId: me,
        subject: subject || '(제목 없음)',
        body: body || '',
        isDraft: !!isDraft,
        priority: priority === 'urgent' ? 'urgent' : 'normal',
        parentId: parentId ? parseInt(parentId) : null,
        threadId,
        forwardedFrom: forwardedFrom ? parseInt(forwardedFrom) : null,
        recipients: {
          create: [
            ...to.map(uid => ({ userId: parseInt(uid), type: 'to' })),
            ...cc.map(uid => ({ userId: parseInt(uid), type: 'cc' })),
            ...bcc.map(uid => ({ userId: parseInt(uid), type: 'bcc' })),
          ],
        },
      },
      include: { recipients: true },
    });

    // 스레드 루트가 없던 신규 메일은 자기 자신을 threadId로 설정
    if (!threadId) {
      await prisma.internalMail.update({ where: { id: mail.id }, data: { threadId: mail.id } });
    }

    if (!isDraft) {
      // 수신자에게 알림 발송
      const allRecipients = [...new Set([...to, ...cc].map(Number))];
      for (const uid of allRecipients) {
        await prisma.notification.create({
          data: {
            userId: uid,
            type: 'mail_received',
            message: `새 메일: ${subject || '(제목 없음)'}`,
            link: `/mail?id=${mail.id}`,
          },
        }).catch(() => {});
        pushNotification(uid, {
          type: 'mail_received',
          message: `새 메일: ${subject || '(제목 없음)'}`,
          link: `/mail?id=${mail.id}`,
        });
      }
    }

    res.json(mail);
  } catch (err) { next(err); }
};

/* 임시저장 수정 */
exports.update = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const { to = [], cc = [], bcc = [], subject, body, priority } = req.body;

    const mail = await prisma.internalMail.findUnique({ where: { id } });
    if (!mail || mail.fromUserId !== me) return res.status(403).json({ error: '권한이 없습니다.' });
    if (!mail.isDraft) return res.status(400).json({ error: '발송된 메일은 수정할 수 없습니다.' });

    await prisma.internalMailRecipient.deleteMany({ where: { mailId: id } });

    const updated = await prisma.internalMail.update({
      where: { id },
      data: {
        subject: subject || '(제목 없음)',
        body: body || '',
        ...(priority ? { priority: priority === 'urgent' ? 'urgent' : 'normal' } : {}),
        recipients: {
          create: [
            ...to.map(uid => ({ userId: parseInt(uid), type: 'to' })),
            ...cc.map(uid => ({ userId: parseInt(uid), type: 'cc' })),
            ...bcc.map(uid => ({ userId: parseInt(uid), type: 'bcc' })),
          ],
        },
      },
      include: { recipients: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

/* 임시저장 → 발송 */
exports.sendDraft = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);

    const mail = await prisma.internalMail.findUnique({
      where: { id },
      include: { recipients: true },
    });
    if (!mail || mail.fromUserId !== me) return res.status(403).json({ error: '권한이 없습니다.' });
    if (!mail.isDraft) return res.status(400).json({ error: '이미 발송된 메일입니다.' });
    if (!mail.recipients.length) return res.status(400).json({ error: '수신자가 없습니다.' });

    const updated = await prisma.internalMail.update({
      where: { id },
      data: { isDraft: false },
    });

    const toRecipients = mail.recipients.filter(r => r.type === 'to' || r.type === 'cc').map(r => r.userId);
    for (const uid of toRecipients) {
      await prisma.notification.create({
        data: {
          userId: uid,
          type: 'mail_received',
          message: `새 메일: ${mail.subject}`,
          link: `/mail?id=${id}`,
        },
      }).catch(() => {});
      pushNotification(uid, { type: 'mail_received', message: `새 메일: ${mail.subject}`, link: `/mail?id=${id}` });
    }

    res.json(updated);
  } catch (err) { next(err); }
};

/* 답장 */
exports.reply = async (req, res, next) => {
  req.body.parentId = req.params.id;
  req.body.isDraft = false;
  return exports.compose(req, res, next);
};

/* 전달 */
exports.forward = async (req, res, next) => {
  req.body.forwardedFrom = req.params.id;
  req.body.isDraft = false;
  return exports.compose(req, res, next);
};

/* 별표 토글 */
exports.star = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const recip = await prisma.internalMailRecipient.findFirst({ where: { mailId: id, userId: me } });
    if (!recip) return res.status(404).json({ error: '수신 메일이 아닙니다.' });
    const updated = await prisma.internalMailRecipient.update({
      where: { id: recip.id },
      data: { isStarred: !recip.isStarred },
    });
    res.json({ isStarred: updated.isStarred });
  } catch (err) { next(err); }
};

/* 읽음/안읽음 */
exports.markRead = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const { isRead = true } = req.body;
    const recip = await prisma.internalMailRecipient.findFirst({ where: { mailId: id, userId: me } });
    if (!recip) return res.status(404).json({ error: '수신 메일이 아닙니다.' });
    await prisma.internalMailRecipient.update({ where: { id: recip.id }, data: { isRead } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

/* 휴지통으로 이동 / 영구 삭제 */
exports.trash = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const recip = await prisma.internalMailRecipient.findFirst({ where: { mailId: id, userId: me } });
    if (!recip) return res.status(404).json({ error: '수신 메일이 아닙니다.' });

    if (recip.folder === 'trash') {
      // 이미 휴지통 → 영구 삭제 (수신자 레코드만 제거)
      await prisma.internalMailRecipient.delete({ where: { id: recip.id } });
    } else {
      await prisma.internalMailRecipient.update({ where: { id: recip.id }, data: { folder: 'trash' } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
};

/* 발송 메일 삭제 (발신자) */
exports.deleteSent = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const mail = await prisma.internalMail.findUnique({ where: { id } });
    if (!mail || mail.fromUserId !== me) return res.status(403).json({ error: '권한이 없습니다.' });
    // 임시보관함(draft)은 수신자가 없으므로 실제 삭제.
    // 발송된 메일은 수신자 편지함을 보존해야 하므로 발신자 뷰에서만 숨김(senderDeleted).
    if (mail.isDraft) {
      await prisma.internalMail.delete({ where: { id } });
    } else {
      await prisma.internalMail.update({ where: { id }, data: { senderDeleted: true } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
};

/* 휴지통 비우기 */
exports.emptyTrash = async (req, res, next) => {
  try {
    const me = req.user.id;
    await prisma.internalMailRecipient.deleteMany({ where: { userId: me, folder: 'trash' } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

/* 읽지 않은 메일 수 */
exports.unreadCount = async (req, res, next) => {
  try {
    const me = req.user.id;
    const count = await prisma.internalMailRecipient.count({
      where: { userId: me, isRead: false, folder: 'inbox' },
    });
    res.json({ count });
  } catch (err) { next(err); }
};

/* 첨부파일 업로드 */
exports.uploadAttachment = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const mail = await prisma.internalMail.findUnique({ where: { id } });
    if (!mail || mail.fromUserId !== me) return res.status(403).json({ error: '권한이 없습니다.' });
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const att = await prisma.internalMailAttachment.create({
      data: {
        mailId: id,
        uploadedBy: me,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
    res.json(att);
  } catch (err) { next(err); }
};

/* 첨부파일 다운로드 */
exports.downloadAttachment = async (req, res, next) => {
  try {
    const me = req.user.id;
    const mailId = parseInt(req.params.id);
    const attId = parseInt(req.params.aid);

    const mail = await prisma.internalMail.findUnique({
      where: { id: mailId },
      include: { recipients: { where: { userId: me } } },
    });
    if (!mail) return res.status(404).json({ error: '메일을 찾을 수 없습니다.' });
    if (mail.fromUserId !== me && !mail.recipients.length) return res.status(403).json({ error: '권한이 없습니다.' });

    const att = await prisma.internalMailAttachment.findUnique({ where: { id: attId } });
    if (!att || att.mailId !== mailId) return res.status(404).json({ error: '첨부파일을 찾을 수 없습니다.' });

    const filePath = path.join(MAIL_UPLOAD_DIR, att.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 존재하지 않습니다.' });

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.originalName)}`);
    res.setHeader('Content-Type', att.mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
};

/* 첨부파일 삭제 */
exports.deleteAttachment = async (req, res, next) => {
  try {
    const me = req.user.id;
    const attId = parseInt(req.params.aid);
    const att = await prisma.internalMailAttachment.findUnique({ where: { id: attId } });
    if (!att || att.uploadedBy !== me) return res.status(403).json({ error: '권한이 없습니다.' });

    const filePath = path.join(MAIL_UPLOAD_DIR, att.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.internalMailAttachment.delete({ where: { id: attId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

/* ── 라벨 ── */
exports.listLabels = async (req, res, next) => {
  try {
    const me = req.user.id;
    const labels = await prisma.internalMailLabel.findMany({
      where: { userId: me },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    res.json(labels);
  } catch (err) { next(err); }
};

exports.createLabel = async (req, res, next) => {
  try {
    const me = req.user.id;
    const { name, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '라벨 이름을 입력하세요.' });
    const count = await prisma.internalMailLabel.count({ where: { userId: me } });
    const label = await prisma.internalMailLabel.create({
      data: { userId: me, name: name.trim(), color: color || '#1677ff', order: count },
    });
    res.json(label);
  } catch (err) { next(err); }
};

exports.updateLabel = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const { name, color } = req.body;
    const label = await prisma.internalMailLabel.findUnique({ where: { id } });
    if (!label || label.userId !== me) return res.status(403).json({ error: '권한이 없습니다.' });
    const updated = await prisma.internalMailLabel.update({
      where: { id },
      data: { ...(name ? { name: name.trim() } : {}), ...(color ? { color } : {}) },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

exports.deleteLabel = async (req, res, next) => {
  try {
    const me = req.user.id;
    const id = parseInt(req.params.id);
    const label = await prisma.internalMailLabel.findUnique({ where: { id } });
    if (!label || label.userId !== me) return res.status(403).json({ error: '권한이 없습니다.' });
    await prisma.internalMailLabel.delete({ where: { id } }); // links cascade
    res.json({ ok: true });
  } catch (err) { next(err); }
};

/* 메일에 라벨 적용/해제 */
exports.setMailLabels = async (req, res, next) => {
  try {
    const me = req.user.id;
    const mailId = parseInt(req.params.id);
    const { labelIds = [] } = req.body;

    const chk = await assertMailParticipant(mailId, me);
    if (chk.error) return res.status(chk.error).json({ error: chk.error === 404 ? '메일을 찾을 수 없습니다.' : '권한이 없습니다.' });

    // 내 라벨만 허용
    const myLabels = await prisma.internalMailLabel.findMany({ where: { userId: me, id: { in: labelIds.map(Number) } }, select: { id: true } });
    const validIds = myLabels.map(l => l.id);

    // 이 메일에 걸린 내 라벨 링크 전부 제거 후 재설정
    const myAllLabelIds = (await prisma.internalMailLabel.findMany({ where: { userId: me }, select: { id: true } })).map(l => l.id);
    await prisma.internalMailLabelLink.deleteMany({ where: { mailId, labelId: { in: myAllLabelIds } } });
    if (validIds.length) {
      await prisma.internalMailLabelLink.createMany({
        data: validIds.map(labelId => ({ mailId, labelId })),
        skipDuplicates: true,
      });
    }
    res.json({ ok: true, labelIds: validIds });
  } catch (err) { next(err); }
};

/* ── 일괄 처리 ── */
exports.bulkAction = async (req, res, next) => {
  try {
    const me = req.user.id;
    const { ids = [], action } = req.body;  // action: read | unread | star | unstar | trash | delete | restore
    const mailIds = ids.map(Number).filter(Boolean);
    if (!mailIds.length) return res.status(400).json({ error: '선택된 메일이 없습니다.' });

    // 내 수신자 레코드 대상
    const recipWhere = { userId: me, mailId: { in: mailIds } };

    switch (action) {
      case 'read':
        await prisma.internalMailRecipient.updateMany({ where: recipWhere, data: { isRead: true, readAt: new Date() } });
        break;
      case 'unread':
        await prisma.internalMailRecipient.updateMany({ where: recipWhere, data: { isRead: false } });
        break;
      case 'star':
        await prisma.internalMailRecipient.updateMany({ where: recipWhere, data: { isStarred: true } });
        break;
      case 'unstar':
        await prisma.internalMailRecipient.updateMany({ where: recipWhere, data: { isStarred: false } });
        break;
      case 'trash':
        await prisma.internalMailRecipient.updateMany({ where: recipWhere, data: { folder: 'trash' } });
        break;
      case 'restore':
        await prisma.internalMailRecipient.updateMany({ where: recipWhere, data: { folder: 'inbox' } });
        break;
      case 'delete':
        // 휴지통에서 영구 삭제 (내 수신 레코드 제거)
        await prisma.internalMailRecipient.deleteMany({ where: recipWhere });
        break;
      default:
        return res.status(400).json({ error: '알 수 없는 동작입니다.' });
    }
    res.json({ ok: true, count: mailIds.length });
  } catch (err) { next(err); }
};
