const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const partController = require('../controllers/partController');

router.use(authenticate);

router.get('/', partController.list);
router.post('/', adminOnly, partController.create);
router.put('/:id', adminOnly, partController.update);
router.delete('/:id', adminOnly, partController.remove);

module.exports = router;
