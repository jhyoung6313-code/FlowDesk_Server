const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const userRoutes = require('./users');
const partRoutes = require('./parts');
const taskRoutes = require('./tasks');
const notificationRoutes = require('./notifications');
const calendarNoteRoutes = require('./calendarNotes');
const memoRoutes = require('./memos');
const wbsRoutes = require('./wbs');
const recurringTaskRoutes = require('./recurringTasks');
const templateRoutes = require('./templates');
const milestoneRoutes = require('./milestones');
const tagRoutes = require('./tags');
const settingsRoutes = require('./settings');
const timeTrackingRoutes = require('./timeTracking');
const backupRoutes = require('./backup');
const adminRoutes = require('./admin');
const ledgerRoutes = require('./ledger');
const chatRoutes = require('./chat');
const boardRoutes = require('./boards');
const boardCategoryRoutes = require('./boardCategories');
const playbookRoutes = require('./playbooks');
const runRoutes = require('./runs');
const webhookCtrl = require('../controllers/webhookController');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/parts', partRoutes);
router.use('/tasks', taskRoutes);
router.use('/notifications', notificationRoutes);
router.use('/calendar-notes', calendarNoteRoutes);
router.use('/memos', memoRoutes);
router.use('/wbs', wbsRoutes);
router.use('/recurring-tasks', recurringTaskRoutes);
router.use('/templates', templateRoutes);
router.use('/milestones', milestoneRoutes);
router.use('/tags', tagRoutes);
router.use('/settings', settingsRoutes);
router.use('/time-entries', timeTrackingRoutes);
router.use('/admin', backupRoutes);
router.use('/admin', adminRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/chat', chatRoutes);
router.use('/board-categories', boardCategoryRoutes);
router.use('/boards', boardRoutes);
router.use('/playbooks', playbookRoutes);
router.use('/runs', runRoutes);

// 웹훅 트리거 (인증 불필요 - 토큰 기반)
router.post('/webhooks/trigger/:token', webhookCtrl.triggerWebhook);

module.exports = router;
