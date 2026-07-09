const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const departmentController = require('../controllers/departmentController');

router.use(authenticate);

router.get('/', departmentController.list);
router.post('/', adminOnly, departmentController.create);
router.put('/:id', adminOnly, departmentController.update);
router.delete('/:id', adminOnly, departmentController.remove);

module.exports = router;
