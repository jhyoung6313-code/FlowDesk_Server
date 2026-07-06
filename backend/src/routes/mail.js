const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const mailCtrl = require('../controllers/mailController');

const MAIL_UPLOAD_DIR = path.join(__dirname, '../../uploads/mail');
if (!fs.existsSync(MAIL_UPLOAD_DIR)) fs.mkdirSync(MAIL_UPLOAD_DIR, { recursive: true });

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
  'application/haansoftdocx',
  'application/x-hwp',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAIL_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('허용되지 않는 파일 형식입니다.'));
  },
});

router.use(authenticate);

// 목록 및 기타 단순 routes (/:id 보다 먼저 선언)
router.get('/unread-count', mailCtrl.unreadCount);
router.delete('/trash', mailCtrl.emptyTrash);

// 라벨 (/:id 보다 먼저)
router.get('/labels', mailCtrl.listLabels);
router.post('/labels', mailCtrl.createLabel);
router.put('/labels/:id', mailCtrl.updateLabel);
router.delete('/labels/:id', mailCtrl.deleteLabel);

// 일괄 처리
router.post('/bulk', mailCtrl.bulkAction);

router.get('/', mailCtrl.list);
router.post('/', mailCtrl.compose);

router.get('/:id', mailCtrl.get);
router.put('/:id', mailCtrl.update);
router.delete('/:id', mailCtrl.trash);

router.post('/:id/send', mailCtrl.sendDraft);
router.post('/:id/reply', mailCtrl.reply);
router.post('/:id/forward', mailCtrl.forward);
router.patch('/:id/star', mailCtrl.star);
router.patch('/:id/read', mailCtrl.markRead);
router.put('/:id/labels', mailCtrl.setMailLabels);

router.post('/:id/attachments', upload.single('file'), mailCtrl.uploadAttachment);
router.get('/:id/attachments/:aid/download', mailCtrl.downloadAttachment);
router.delete('/:id/attachments/:aid', mailCtrl.deleteAttachment);

// 메일 댓글
router.get('/:id/comments', mailCtrl.listComments);
router.post('/:id/comments', mailCtrl.createComment);
router.delete('/:id/comments/:cid', mailCtrl.deleteComment);

module.exports = router;
