const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const bbsCategoryController = require('../controllers/bbsCategoryController');
const bbsPostController = require('../controllers/bbsPostController');

const BBS_UPLOAD_DIR = path.join(__dirname, '../../uploads/bbs');
if (!fs.existsSync(BBS_UPLOAD_DIR)) fs.mkdirSync(BBS_UPLOAD_DIR, { recursive: true });

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
  destination: (req, file, cb) => cb(null, BBS_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
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
});

// ── 게시판 카테고리 (관리자 전용 CUD) ────────────────────────
router.get('/bbs-categories', authenticate, bbsCategoryController.list);
router.get('/bbs-categories/dashboard', authenticate, bbsCategoryController.dashboardList);
router.put('/bbs-categories/dashboard', authenticate, bbsCategoryController.setPersonal);
router.post('/bbs-categories', authenticate, adminOnly, bbsCategoryController.create);
router.put('/bbs-categories/reorder', authenticate, adminOnly, bbsCategoryController.reorder);
router.put('/bbs-categories/:id', authenticate, adminOnly, bbsCategoryController.update);
router.delete('/bbs-categories/:id', authenticate, adminOnly, bbsCategoryController.remove);

// ── 게시글 ────────────────────────────────────────────────────
router.get('/bbs', authenticate, bbsPostController.list);
router.post('/bbs', authenticate, bbsPostController.create);
router.get('/bbs/:id', authenticate, bbsPostController.get);
router.put('/bbs/:id', authenticate, bbsPostController.update);
router.delete('/bbs/:id', authenticate, bbsPostController.remove);
router.put('/bbs/:id/pin', authenticate, adminOnly, bbsPostController.pin);

// ── 댓글 ──────────────────────────────────────────────────────
router.get('/bbs/:id/comments', authenticate, bbsPostController.listComments);
router.post('/bbs/:id/comments', authenticate, bbsPostController.createComment);
router.put('/bbs/:id/comments/:cid', authenticate, bbsPostController.updateComment);
router.delete('/bbs/:id/comments/:cid', authenticate, bbsPostController.removeComment);

// ── 첨부파일 ──────────────────────────────────────────────────
router.post('/bbs/:id/attachments', authenticate, upload.single('file'), bbsPostController.uploadAttachment);
router.get('/bbs/:id/attachments/:aid/download', authenticate, bbsPostController.downloadAttachment);
router.delete('/bbs/:id/attachments/:aid', authenticate, bbsPostController.removeAttachment);

module.exports = router;
