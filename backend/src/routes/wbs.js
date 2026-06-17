const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { adminOnly } = require('../middlewares/adminOnly');
const { auditAction } = require('../middlewares/auditLogger');
const { AUDIT_ACTION } = require('../config/security');
const wbs = require('../controllers/wbsController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── 프로젝트 ─────────────────────────────────────────
router.get('/projects', authenticate, wbs.getProjects);
router.post('/projects', authenticate, adminOnly, wbs.createProject);
router.get('/projects/:id', authenticate, wbs.getProject);
router.put('/projects/:id', authenticate, adminOnly, wbs.updateProject);
router.delete('/projects/:id', authenticate, adminOnly, wbs.deleteProject);

// ─── WBS 항목 ─────────────────────────────────────────
router.get('/projects/:id/tasks/export', authenticate, auditAction(AUDIT_ACTION.DATA_EXPORT), wbs.exportTasksExcel);
router.post('/projects/:id/tasks/import', authenticate, adminOnly, upload.single('file'), wbs.importTasksExcel);
router.get('/projects/:id/tasks', authenticate, wbs.getTasks);
router.post('/projects/:id/tasks', authenticate, wbs.createTask);
router.patch('/projects/:id/tasks/reorder', authenticate, wbs.reorderTasks);
router.put('/tasks/:taskId', authenticate, wbs.updateTask);
router.delete('/tasks/:taskId', authenticate, wbs.deleteTask);
router.post('/tasks/:taskId/deliverable', authenticate, upload.single('file'), wbs.uploadDeliverable);
router.get('/tasks/:taskId/deliverable', authenticate, auditAction(AUDIT_ACTION.DATA_EXPORT), wbs.downloadDeliverable);
router.delete('/tasks/:taskId/deliverable', authenticate, wbs.deleteDeliverable);

// ─── 이슈사항 ─────────────────────────────────────────
router.get('/projects/:id/issues/export', authenticate, auditAction(AUDIT_ACTION.DATA_EXPORT), wbs.exportIssuesExcel);
router.post('/projects/:id/issues/import', authenticate, adminOnly, upload.single('file'), wbs.importIssuesExcel);
router.get('/projects/:id/issues', authenticate, wbs.getIssues);
router.post('/projects/:id/issues', authenticate, wbs.createIssue);
router.put('/issues/:issueId', authenticate, wbs.updateIssue);
router.delete('/issues/:issueId', authenticate, wbs.deleteIssue);

module.exports = router;
