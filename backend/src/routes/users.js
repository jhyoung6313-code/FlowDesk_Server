const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const userController = require('../controllers/userController');

router.use(authenticate);

router.get('/', userController.list);
router.patch('/me/avatar-color', userController.updateAvatarColor);
router.put('/me/status', userController.setStatus);
router.post('/', adminOnly, userController.create);
router.put('/:id', adminOnly, userController.update);
router.patch('/:id/deactivate', adminOnly, userController.deactivate);
router.patch('/:id/activate', adminOnly, userController.activate);
router.patch('/:id/reset-password', adminOnly, userController.resetPassword);

module.exports = router;
