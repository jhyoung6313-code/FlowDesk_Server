const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controllers/formController');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.detail);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.patch('/:id/status', ctrl.setStatus);
router.post('/:id/responses', ctrl.submit);
router.get('/:id/results', ctrl.results);

module.exports = router;
