const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const { getEmailSettings, updateEmailSettings, testEmail, getWidgetSettings, updateWidgetSettings } = require('../controllers/settingsController');

router.get('/email', authenticate, adminOnly, getEmailSettings);
router.put('/email', authenticate, adminOnly, updateEmailSettings);
router.post('/email/test', authenticate, adminOnly, testEmail);

router.get('/widgets', authenticate, getWidgetSettings);
router.put('/widgets', authenticate, updateWidgetSettings);

module.exports = router;
