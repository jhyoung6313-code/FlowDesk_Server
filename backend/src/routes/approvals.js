const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const approvalFormTypeController = require('../controllers/approvalFormTypeController');
const approvalTemplateController = require('../controllers/approvalTemplateController');
const approvalController = require('../controllers/approvalController');

const APPROVAL_UPLOAD_DIR = path.join(__dirname, '../../uploads/approval');
if (!fs.existsSync(APPROVAL_UPLOAD_DIR)) fs.mkdirSync(APPROVAL_UPLOAD_DIR, { recursive: true });

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, APPROVAL_UPLOAD_DIR),
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

// ── 결재 양식 종류 (admin only CUD) ──────────────────────────
router.get('/approval-types', authenticate, approvalFormTypeController.list);
router.post('/approval-types', authenticate, adminOnly, approvalFormTypeController.create);
router.put('/approval-types/reorder', authenticate, adminOnly, approvalFormTypeController.reorder);
router.put('/approval-types/:id', authenticate, adminOnly, approvalFormTypeController.update);
router.delete('/approval-types/:id', authenticate, adminOnly, approvalFormTypeController.remove);

// ── 결재 양식 템플릿 (admin only CUD) ────────────────────────
router.get('/approval-templates', authenticate, approvalTemplateController.list);
router.get('/approval-templates/:id', authenticate, approvalTemplateController.get);
router.get('/approval-templates/:id/resolve-line', authenticate, approvalTemplateController.resolveLine);
router.post('/approval-templates/:id/resolve-line', authenticate, approvalTemplateController.resolveLine);
router.post('/approval-templates', authenticate, adminOnly, approvalTemplateController.create);
router.put('/approval-templates/:id', authenticate, adminOnly, approvalTemplateController.update);
router.delete('/approval-templates/:id', authenticate, adminOnly, approvalTemplateController.remove);

// ── 결재 문서 ──────────────────────────────────────────────────
router.get('/approvals/pending-count', authenticate, approvalController.pendingCount);
router.get('/approvals/tree', authenticate, approvalController.tree);
router.get('/approvals', authenticate, approvalController.list);
router.post('/approvals', authenticate, approvalController.create);
router.get('/approvals/:id', authenticate, approvalController.get);
router.put('/approvals/:id', authenticate, approvalController.update);
router.post('/approvals/:id/submit', authenticate, approvalController.submit);
router.post('/approvals/:id/approve', authenticate, approvalController.approve);
router.post('/approvals/:id/reject', authenticate, approvalController.reject);
router.post('/approvals/:id/cancel', authenticate, approvalController.cancel);
router.post('/approvals/:id/delegate', authenticate, approvalController.delegate);
router.post('/approvals/:id/resubmit', authenticate, approvalController.resubmit);
router.post('/approvals/:id/resume', authenticate, approvalController.resume);
router.delete('/approvals/:id', authenticate, approvalController.remove);

// ── 결재 문서 첨부파일 ────────────────────────────────────────
router.post('/approvals/:id/attachments', authenticate, upload.single('file'), approvalController.uploadAttachment);
router.get('/approvals/:id/attachments/:aid/download', authenticate, approvalController.downloadAttachment);
router.delete('/approvals/:id/attachments/:aid', authenticate, approvalController.removeAttachment);

// ── 결재 의견 ──────────────────────────────────────────────────
router.get('/approvals/:id/comments', authenticate, approvalController.listComments);
router.post('/approvals/:id/comments', authenticate, approvalController.createComment);
router.put('/approvals/:id/comments/:cid', authenticate, approvalController.updateComment);
router.delete('/approvals/:id/comments/:cid', authenticate, approvalController.removeComment);

module.exports = router;
