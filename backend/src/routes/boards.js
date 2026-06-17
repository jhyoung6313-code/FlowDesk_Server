const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/boardController');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/board-cards');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
]);

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('허용되지 않는 파일 형식입니다.'), { status: 400 }));
  },
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('이미지 파일만 업로드할 수 있습니다.'), { status: 400 }));
  },
});

router.use(authenticate);

// 안읽음 카운트 (/:id 보다 먼저)
router.get('/unread-count', c.getUnreadCount);

// 보드 CRUD
router.get('/', c.list);
router.post('/', c.create);
router.post('/import', c.importBoard);
router.patch('/reorder', c.reorderBoards);
router.get('/:id', c.get);
router.post('/:id/read', c.markRead);
router.put('/:id', c.update);
router.delete('/:id', c.remove);
router.get('/:id/export', c.exportBoard);

// 카드
router.get('/:id/cards', c.listCards);
router.post('/:id/cards', c.createCard);
router.patch('/:id/cards/reorder', c.reorderCards);
router.put('/:id/cards/:cardId', c.updateCard);
router.delete('/:id/cards/:cardId', c.deleteCard);
router.patch('/:id/cards/:cardId/properties', c.updateCardProperties);

// 카드 커버 이미지
router.post('/:id/cards/:cardId/cover-image', uploadImage.single('file'), c.uploadCoverImage);
router.delete('/:id/cards/:cardId/cover-image', c.deleteCoverImage);

// 카드 미리보기 (채팅 링크용)
router.get('/:id/cards/:cardId/preview', c.cardPreview);

// 카드 댓글
router.post('/:id/cards/:cardId/comments', c.createComment);
router.put('/:id/cards/:cardId/comments/:commentId', c.updateComment);
router.delete('/:id/cards/:cardId/comments/:commentId', c.deleteComment);
router.post('/:id/cards/:cardId/comments/:commentId/attachment', upload.single('file'), c.uploadCommentAttachment);

// 카드 첨부파일
router.post('/:id/cards/:cardId/attachments', upload.single('file'), c.uploadAttachment);
router.get('/:id/cards/:cardId/attachments/:attachmentId/download', c.downloadAttachment);
router.delete('/:id/cards/:cardId/attachments/:attachmentId', c.deleteAttachment);

// 카드 체크리스트
router.post('/:id/cards/:cardId/checklists', c.createChecklistItem);
router.patch('/:id/cards/:cardId/checklists/:itemId', c.updateChecklistItem);
router.delete('/:id/cards/:cardId/checklists/:itemId', c.deleteChecklistItem);

// 저장 뷰
router.get('/:id/views', c.listViews);
router.post('/:id/views', c.createView);
router.patch('/:id/views/reorder', c.reorderViews);
router.put('/:id/views/:viewId', c.updateView);
router.delete('/:id/views/:viewId', c.deleteView);

// 속성
router.get('/:id/properties', c.listProperties);
router.post('/:id/properties', c.createProperty);
router.put('/:id/properties/:propId', c.updateProperty);
router.delete('/:id/properties/:propId', c.deleteProperty);

// 멤버
router.get('/:id/members', c.listMembers);
router.post('/:id/members', c.addMember);
router.delete('/:id/members/:userId', c.removeMember);

// 즐겨찾기
router.post('/:id/favorite', c.toggleFavorite);

// 카드 복제
router.post('/:id/cards/:cardId/duplicate', c.duplicateCard);

// 카드 의존성
router.get('/:id/cards/:cardId/dependencies', c.listDependencies);
router.post('/:id/cards/:cardId/dependencies', c.addDependency);
router.delete('/:id/cards/:cardId/dependencies/:depId', c.removeDependency);

// 카드 업무 연결
router.patch('/:id/cards/:cardId/link-task', c.linkTask);

// 자동화
router.get('/:id/automations', c.listAutomations);
router.post('/:id/automations', c.createAutomation);
router.put('/:id/automations/:autoId', c.updateAutomation);
router.delete('/:id/automations/:autoId', c.deleteAutomation);

module.exports = router;
