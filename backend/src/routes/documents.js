const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/documentController');

router.use(authenticate);

// 통합 문서/첨부 허브 (F-68)
router.get('/', ctrl.list);

module.exports = router;
