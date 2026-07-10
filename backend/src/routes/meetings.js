const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/meetingController');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

router.patch('/:id/rsvp', ctrl.rsvp);

router.post('/:id/decisions', ctrl.addDecision);
router.delete('/:id/decisions/:did', ctrl.removeDecision);

router.post('/:id/action-items', ctrl.addActionItem);
router.put('/:id/action-items/:aid', ctrl.updateActionItem);
router.delete('/:id/action-items/:aid', ctrl.removeActionItem);
router.post('/:id/action-items/:aid/to-task', ctrl.actionItemToTask);

module.exports = router;
