const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { auditAction } = require('../middlewares/auditLogger');
const { AUDIT_ACTION } = require('../config/security');
const backupController = require('../controllers/backupController');

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '관리자만 접근 가능합니다.' });
  next();
};

const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.enc')) cb(null, true);
    else cb(Object.assign(new Error('백업 파일(.enc)만 허용됩니다.'), { status: 400 }));
  },
});

router.use(authenticate, adminOnly);

router.get('/backup', auditAction(AUDIT_ACTION.DATA_EXPORT), backupController.backup);
router.post('/restore', auditAction(AUDIT_ACTION.DATA_EXPORT, () => 'admin/restore'), restoreUpload.single('backup'), backupController.restore);

module.exports = router;
