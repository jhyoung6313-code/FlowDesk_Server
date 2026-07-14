const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/meController');

router.use(authenticate);

// 개인 "내 하루" 통합 홈 (F-64)
router.get('/today', ctrl.today);

module.exports = router;
