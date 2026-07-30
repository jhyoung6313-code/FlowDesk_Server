const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const ctrl = require('../controllers/automationController');

router.use(authenticate);

// 카탈로그는 인증된 사용자면 조회 가능(편집기 로드용)
router.get('/catalog', ctrl.catalog);

// 규칙 관리는 관리자 전용
router.get('/', adminOnly, ctrl.list);
router.post('/', adminOnly, ctrl.create);
router.get('/:id', adminOnly, ctrl.detail);
router.put('/:id', adminOnly, ctrl.update);
router.delete('/:id', adminOnly, ctrl.remove);
router.post('/:id/test', adminOnly, ctrl.testRun);

module.exports = router;
