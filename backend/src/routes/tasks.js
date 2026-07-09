const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { auditAction } = require('../middlewares/auditLogger');
const { AUDIT_ACTION } = require('../config/security');
const taskController = require('../controllers/taskController');
const commentController = require('../controllers/commentController');
const attachmentController = require('../controllers/attachmentController');
const historyController = require('../controllers/historyController');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
]);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('허용되지 않는 파일 형식입니다.'), { status: 400 }));
    }
  },
}); // 20MB

router.use(authenticate);

router.get('/calendar', taskController.calendar);
router.get('/gantt', taskController.gantt);
router.get('/export', auditAction(AUDIT_ACTION.DATA_EXPORT), taskController.exportExcel);
router.post('/bulk', taskController.bulkAction);
router.get('/', taskController.list);
router.post('/', taskController.create);
router.get('/:id', taskController.detail);
router.put('/:id', taskController.update);
router.delete('/:id', taskController.remove);
router.patch('/:id/status', taskController.updateStatus);

// 댓글
router.get('/:id/comments', commentController.list);
router.post('/:id/comments', commentController.create);
router.put('/comments/:commentId', commentController.update);
router.delete('/comments/:commentId', commentController.remove);
router.post('/:id/comments/:commentId/attachment', upload.single('file'), commentController.uploadAttachment);

// 첨부파일
router.get('/:id/attachments', attachmentController.list);
router.post('/:id/attachments', upload.single('file'), attachmentController.upload);
router.get('/attachments/:attachmentId/download', auditAction(AUDIT_ACTION.DATA_EXPORT), attachmentController.download);
router.delete('/attachments/:attachmentId', attachmentController.remove);

// 히스토리
router.get('/:id/history', historyController.list);

module.exports = router;
