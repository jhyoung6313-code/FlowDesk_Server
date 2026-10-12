const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const { getEmailSettings, updateEmailSettings, testEmail, getWidgetSettings, updateWidgetSettings, getThemePrefs, updateThemePrefs, getDashboardLayout, updateDashboardLayout, getApprovalLinePresets, updateApprovalLinePresets, getSharedApprovalLinePresets, addSharedApprovalLinePreset, deleteSharedApprovalLinePreset, getApprovalAutoDelegate, updateApprovalAutoDelegate, getEmailOptOut, updateEmailOptOut } = require('../controllers/settingsController');

router.get('/email', authenticate, adminOnly, getEmailSettings);
router.put('/email', authenticate, adminOnly, updateEmailSettings);
router.post('/email/test', authenticate, adminOnly, testEmail);

router.get('/widgets', authenticate, getWidgetSettings);
router.put('/widgets', authenticate, updateWidgetSettings);

router.get('/theme', authenticate, getThemePrefs);
router.put('/theme', authenticate, updateThemePrefs);

router.get('/dashboard-layout', authenticate, getDashboardLayout);
router.put('/dashboard-layout', authenticate, updateDashboardLayout);

router.get('/approval-lines', authenticate, getApprovalLinePresets);
router.put('/approval-lines', authenticate, updateApprovalLinePresets);
router.get('/approval-lines/shared', authenticate, getSharedApprovalLinePresets);
// PUT(전체 배열 교체)는 동시 편집 시 lost-update를 유발해 POST(1건 추가)/DELETE(1건 삭제)로 교체—
// 서버가 그 순간의 최신 배열을 다시 읽어 수정하므로 두 사용자가 동시에 각자 다른 프리셋을
// 추가/삭제해도 서로의 변경을 지우지 않는다.
router.post('/approval-lines/shared', authenticate, addSharedApprovalLinePreset);
router.delete('/approval-lines/shared/:id', authenticate, deleteSharedApprovalLinePreset);

router.get('/approval-auto-delegate', authenticate, getApprovalAutoDelegate);
router.put('/approval-auto-delegate', authenticate, updateApprovalAutoDelegate);

router.get('/email-opt-out', authenticate, getEmailOptOut);
router.put('/email-opt-out', authenticate, updateEmailOptOut);

module.exports = router;
