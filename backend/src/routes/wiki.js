const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/wikiController');

router.use(authenticate);

// 스페이스
router.get('/spaces', ctrl.listSpaces);
router.post('/spaces', ctrl.createSpace);
router.put('/spaces/:id', ctrl.updateSpace);
router.delete('/spaces/:id', ctrl.deleteSpace);

// 문서
router.post('/docs', ctrl.createDoc);
router.get('/docs/:id', ctrl.getDoc);
router.put('/docs/:id', ctrl.updateDoc);
router.delete('/docs/:id', ctrl.deleteDoc);

// 버전 이력
router.get('/docs/:id/versions', ctrl.listVersions);
router.post('/docs/:id/versions/:vid/restore', ctrl.restoreVersion);

// 댓글
router.get('/docs/:id/comments', ctrl.listComments);
router.post('/docs/:id/comments', ctrl.createComment);
router.delete('/docs/comments/:cid', ctrl.deleteComment);

module.exports = router;
