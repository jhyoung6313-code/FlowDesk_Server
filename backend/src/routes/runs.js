const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/playbookRunController');

router.use(authenticate);

// 통계 (/:id보다 먼저)
router.get('/stats', ctrl.getStats);

// 안읽음 카운트 (/:id 보다 먼저)
router.get('/unread-count', ctrl.getUnreadCount);
router.post('/read', ctrl.markRead);

// Run CRUD
router.get('/', ctrl.listRuns);
router.post('/', ctrl.createRun);
router.get('/:id', ctrl.getRun);
router.put('/:id', ctrl.updateRun);
router.delete('/:id', ctrl.deleteRun);

// Run 상태 전환
router.post('/:id/finish', ctrl.finishRun);
router.post('/:id/pause', ctrl.pauseRun);
router.post('/:id/resume', ctrl.resumeRun);
router.post('/:id/archive', ctrl.archiveRun);

// 스텝 추가/삭제/실행
router.post('/:id/steps', ctrl.addStep);
router.delete('/:id/steps/:stepId', ctrl.deleteStep);
router.patch('/:id/steps/:stepId', ctrl.updateStep);

// 스텝 체크리스트
router.get('/:id/steps/:stepId/checklists', ctrl.getChecklists);
router.post('/:id/steps/:stepId/checklists', ctrl.addChecklist);
router.patch('/:id/steps/:stepId/checklists/:checkId', ctrl.updateChecklist);
router.delete('/:id/steps/:stepId/checklists/:checkId', ctrl.deleteChecklist);

// 참여자
router.post('/:id/participants', ctrl.addParticipant);
router.delete('/:id/participants/:userId', ctrl.removeParticipant);

// 업데이트
router.post('/:id/updates', ctrl.addUpdate);
router.delete('/:id/updates/:updateId', ctrl.deleteUpdate);

module.exports = router;
