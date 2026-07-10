const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/okrController');

router.use(authenticate);

// 주기
router.get('/cycles', ctrl.listCycles);
router.post('/cycles', ctrl.createCycle);
router.delete('/cycles/:id', ctrl.deleteCycle);

// 목표 트리(주기별)
router.get('/tree', ctrl.tree);

// 목표
router.post('/objectives', ctrl.createObjective);
router.put('/objectives/:id', ctrl.updateObjective);
router.delete('/objectives/:id', ctrl.deleteObjective);

// 핵심결과(KR)
router.post('/objectives/:objId/key-results', ctrl.createKeyResult);
router.put('/key-results/:krId', ctrl.updateKeyResult);
router.delete('/key-results/:krId', ctrl.deleteKeyResult);

// 체크인
router.get('/key-results/:krId/checkins', ctrl.listCheckins);
router.post('/key-results/:krId/checkins', ctrl.createCheckin);

// KR ↔ 업무 연결
router.post('/key-results/:krId/links', ctrl.addLink);
router.delete('/key-results/:krId/links/:linkId', ctrl.removeLink);

module.exports = router;
