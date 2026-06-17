const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/boardCategoryController');

router.use(authenticate);

router.get('/', c.list);
router.post('/', c.create);
router.patch('/reorder', c.reorder);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
