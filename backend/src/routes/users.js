const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const userController = require('../controllers/userController');

const SIGNATURE_DIR = path.join(__dirname, '../../uploads/signatures');
if (!fs.existsSync(SIGNATURE_DIR)) fs.mkdirSync(SIGNATURE_DIR, { recursive: true });

const SIGNATURE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const signatureUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, SIGNATURE_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (SIGNATURE_MIME.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('PNG/JPG/WebP 이미지만 등록할 수 있습니다.'), { status: 400 }));
  },
});

router.use(authenticate);

router.get('/', userController.list);
router.get('/workload', userController.workload);
router.patch('/me/avatar-color', userController.updateAvatarColor);
router.put('/me/status', userController.setStatus);
router.post('/me/signature', signatureUpload.single('file'), userController.uploadSignature);
router.delete('/me/signature', userController.deleteSignature);
router.post('/', adminOnly, userController.create);
router.put('/:id', adminOnly, userController.update);
router.patch('/:id/deactivate', adminOnly, userController.deactivate);
router.patch('/:id/activate', adminOnly, userController.activate);
router.patch('/:id/reset-password', adminOnly, userController.resetPassword);

module.exports = router;
