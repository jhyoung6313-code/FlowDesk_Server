const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const ctrl = require('../controllers/holidayController');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', adminOnly, ctrl.create);
router.delete('/:id', adminOnly, ctrl.remove);

module.exports = router;
