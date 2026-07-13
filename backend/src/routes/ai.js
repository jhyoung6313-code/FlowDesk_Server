const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/aiController');

router.use(authenticate);

router.get('/status', ctrl.status);
router.post('/tasks/generate', ctrl.generateTasks);
router.post('/summary', ctrl.weeklySummary);

module.exports = router;
