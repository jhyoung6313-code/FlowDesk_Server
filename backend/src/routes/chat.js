const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate } = require('../middlewares/auth');
const {
  getRooms, getPublicRooms, createRoom, joinPublicRoom,
  updateRoom, toggleArchive, toggleFavorite, toggleMute,
  getMessages, getThread, markRead, markUnread,
  editMessage, deleteMessage,
  toggleReaction, getPinnedMessages, togglePin,
  getSavedMessages, toggleSave, forwardMessage,
  searchMessages, addMember, leaveRoom, uploadFile,
  getLinkPreview, setAnnouncement,
  createScheduledMessage, listScheduledMessages, cancelScheduledMessage,
} = require('../controllers/chatController');

const uploadDir = path.join(__dirname, '../../uploads/chat');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

// 채팅방
router.get('/rooms', getRooms);
router.get('/rooms/public', getPublicRooms);
router.post('/rooms', createRoom);
router.post('/rooms/:id/join', joinPublicRoom);
router.put('/rooms/:id', updateRoom);
router.put('/rooms/:id/archive', toggleArchive);
router.put('/rooms/:id/favorite', toggleFavorite);
router.put('/rooms/:id/mute', toggleMute);
router.put('/rooms/:id/announcement', setAnnouncement);
router.post('/rooms/:id/members', addMember);
router.delete('/rooms/:id/leave', leaveRoom);
router.post('/rooms/:id/upload', upload.single('file'), uploadFile);

// 메시지
router.get('/rooms/:id/messages', getMessages);
router.put('/rooms/:id/read', markRead);
router.put('/rooms/:id/unread', markUnread);
router.get('/rooms/:id/pinned', getPinnedMessages);

// 예약 발송
router.post('/rooms/:id/scheduled', createScheduledMessage);
router.get('/rooms/:id/scheduled', listScheduledMessages);
router.delete('/rooms/:id/scheduled/:msgId', cancelScheduledMessage);

// 메시지 단건 조작
router.get('/messages/:id/thread', getThread);
router.put('/messages/:id', editMessage);
router.delete('/messages/:id', deleteMessage);
router.post('/messages/:id/reaction', toggleReaction);
router.post('/messages/:id/pin', togglePin);
router.post('/messages/:id/save', toggleSave);
router.post('/messages/:id/forward', forwardMessage);

// 저장 & 검색 & 유틸
router.get('/saved', getSavedMessages);
router.get('/search', searchMessages);
router.get('/link-preview', getLinkPreview);

module.exports = router;
