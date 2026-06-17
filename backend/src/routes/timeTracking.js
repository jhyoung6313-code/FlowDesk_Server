const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/timeTrackingController');

router.use(authenticate);

router.get('/task/:taskId', ctrl.listByTask);
router.get('/task/:taskId/running', ctrl.getRunning);
router.post('/task/:taskId/start', ctrl.startTimer);
router.patch('/:id/stop', ctrl.stopTimer);
router.patch('/:id', ctrl.updateNote);
router.delete('/:id', ctrl.remove);

module.exports = router;
