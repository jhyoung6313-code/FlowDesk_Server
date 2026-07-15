const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const { getEmailSettings, updateEmailSettings, testEmail, getWidgetSettings, updateWidgetSettings, getThemePrefs, updateThemePrefs, getDashboardLayout, updateDashboardLayout } = require('../controllers/settingsController');

router.get('/email', authenticate, adminOnly, getEmailSettings);
router.put('/email', authenticate, adminOnly, updateEmailSettings);
router.post('/email/test', authenticate, adminOnly, testEmail);

router.get('/widgets', authenticate, getWidgetSettings);
router.put('/widgets', authenticate, updateWidgetSettings);

router.get('/theme', authenticate, getThemePrefs);
router.put('/theme', authenticate, updateThemePrefs);

router.get('/dashboard-layout', authenticate, getDashboardLayout);
router.put('/dashboard-layout', authenticate, updateDashboardLayout);

module.exports = router;
