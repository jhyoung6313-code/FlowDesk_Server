const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/playbookController');
const webhookCtrl = require('../controllers/webhookController');
const schedCtrl = require('../controllers/playbookScheduleController');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.detail);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/clone', ctrl.clone);

// 버전 이력
router.get('/:id/versions', ctrl.listVersions);
router.post('/:id/versions/:versionId/restore', ctrl.restoreVersion);

// 웹훅
router.get('/:playbookId/webhooks', webhookCtrl.listWebhooks);
router.post('/:playbookId/webhooks', webhookCtrl.createWebhook);
router.delete('/:playbookId/webhooks/:hookId', webhookCtrl.deleteWebhook);

// 자동 실행 스케줄
router.get('/:id/schedules', schedCtrl.list);
router.post('/:id/schedules', schedCtrl.create);
router.put('/:id/schedules/:scheduleId', schedCtrl.update);
router.delete('/:id/schedules/:scheduleId', schedCtrl.remove);
router.post('/:id/schedules/:scheduleId/run', schedCtrl.runNow);

module.exports = router;
