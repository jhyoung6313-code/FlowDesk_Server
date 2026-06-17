const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

// SSE 스트림: 쿼리파라미터 토큰 자체 인증 처리
router.get('/stream', notificationController.stream);

router.use(authenticate);
router.get('/', notificationController.list);
router.patch('/read-all', notificationController.readAll);
router.patch('/:id/read', notificationController.read);

module.exports = router;
