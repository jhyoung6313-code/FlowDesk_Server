const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const ctrl = require('../controllers/scheduleController');

router.use(authenticate);

// 자원(회의실·차량) — /:id 보다 먼저 선언
router.get('/resources', ctrl.listResources);
router.post('/resources', adminOnly, ctrl.createResource);
router.put('/resources/:id', adminOnly, ctrl.updateResource);
router.delete('/resources/:id', adminOnly, ctrl.removeResource);

// 일정 이벤트
router.get('/', ctrl.listEvents);
router.post('/', ctrl.createEvent);
router.put('/:id', ctrl.updateEvent);
router.delete('/:id', ctrl.removeEvent);

module.exports = router;
