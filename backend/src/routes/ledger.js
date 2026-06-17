const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { auditAction } = require('../middlewares/auditLogger');
const { AUDIT_ACTION } = require('../config/security');
const c = require('../controllers/ledgerController');

router.use(authenticate);

// 카테고리
router.get('/categories', c.listCategories);
router.post('/categories', c.createCategory);
router.put('/categories/:id', c.updateCategory);
router.delete('/categories/:id', c.deleteCategory);

// 요약 통계
router.get('/summary', c.summary);

// 예산
router.get('/budget', c.listBudgets);
router.put('/budget', c.upsertBudget);
router.delete('/budget/:id', c.deleteBudget);

// 반복 거래
router.get('/recurring', c.listRecurrings);
router.post('/recurring', c.createRecurring);
router.put('/recurring/:id', c.updateRecurring);
router.delete('/recurring/:id', c.deleteRecurring);
router.post('/recurring/apply', c.applyRecurring);

// Excel 내보내기
router.get('/export', auditAction(AUDIT_ACTION.DATA_EXPORT), c.exportExcel);

// 거래 내역
router.get('/', c.listEntries);
router.post('/', c.createEntry);
router.put('/:id', c.updateEntry);
router.delete('/:id', c.deleteEntry);

module.exports = router;
