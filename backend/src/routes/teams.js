const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const teamController = require('../controllers/teamController');

router.use(authenticate);

router.get('/', teamController.list);
router.post('/', adminOnly, teamController.create);
router.put('/:id', adminOnly, teamController.update);
router.delete('/:id', adminOnly, teamController.remove);

module.exports = router;
