const path = require('path');
const fs = require('fs');

const prisma = require('../lib/prisma');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// GET /api/tasks/:id/attachments
const list = async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId, commentId: null },
      include: { uploader: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(attachments);
  } catch (err) {
    next(err);
  }
};

// POST /api/tasks/:id/attachments  (multipart/form-data, field: file)
const upload = async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.delYn === '1') return res.status(404).json({ error: '업무를 찾을 수 없습니다.' });

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        uploadedBy: req.user.id,
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      include: { uploader: { select: { id: true, displayName: true } } },
    });

    // 히스토리 기록
    await prisma.taskHistory.create({
      data: {
        taskId,
        userId: req.user.id,
        action: 'attach',
        newValue: originalName,
      },
    });

    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
};

// GET /api/tasks/attachments/:attachmentId/download
const download = async (req, res, next) => {
  try {
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: Number(req.params.attachmentId) },
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

// DELETE /api/tasks/attachments/:attachmentId
const remove = async (req, res, next) => {
  try {
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: Number(req.params.attachmentId) },
    });
    if (!attachment) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    if (req.user.role !== 'admin' && attachment.uploadedBy !== req.user.id) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    // 실제 파일 삭제
    const filePath = path.join(UPLOAD_DIR, attachment.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.taskAttachment.delete({ where: { id: attachment.id } });

    // 히스토리 기록
    await prisma.taskHistory.create({
      data: {
        taskId: attachment.taskId,
        userId: req.user.id,
        action: 'detach',
        oldValue: attachment.originalName,
      },
    });

    res.json({ message: '파일이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, upload, download, remove };
