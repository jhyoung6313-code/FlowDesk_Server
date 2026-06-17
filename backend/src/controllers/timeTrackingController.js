
const prisma = require('../lib/prisma');

/** GET /api/time-entries/task/:taskId — 업무별 타임 엔트리 목록 */
const listByTask = async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const entries = await prisma.timeEntry.findMany({
      where: { taskId },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { startTime: 'desc' },
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
};

/** POST /api/time-entries/task/:taskId/start — 타이머 시작 */
const startTimer = async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const userId = req.user.id;

    // 이미 실행 중인 타이머가 있으면 반환
    const running = await prisma.timeEntry.findFirst({
      where: { taskId, userId, endTime: null },
    });
    if (running) {
      return res.status(400).json({ error: '이미 실행 중인 타이머가 있습니다.' });
    }

    const entry = await prisma.timeEntry.create({
      data: { taskId, userId, startTime: new Date() },
      include: { user: { select: { id: true, displayName: true } } },
    });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/time-entries/:id/stop — 타이머 정지 */
const stopTimer = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { note } = req.body;

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) return res.status(404).json({ error: '타임 엔트리를 찾을 수 없습니다.' });
    if (entry.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    if (entry.endTime) return res.status(400).json({ error: '이미 종료된 타이머입니다.' });

    const endTime = new Date();
    const duration = Math.floor((endTime - new Date(entry.startTime)) / 1000);

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: { endTime, duration, note: note || null },
      include: { user: { select: { id: true, displayName: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/time-entries/:id — 타임 엔트리 삭제 */
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) return res.status(404).json({ error: '타임 엔트리를 찾을 수 없습니다.' });
    if (entry.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    await prisma.timeEntry.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

/** GET /api/time-entries/task/:taskId/running — 실행 중인 타이머 조회 */
const getRunning = async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const userId = req.user.id;
    const running = await prisma.timeEntry.findFirst({
      where: { taskId, userId, endTime: null },
      include: { user: { select: { id: true, displayName: true } } },
    });
    res.json(running || null);
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/time-entries/:id — 타임 엔트리 메모 수정 */
const updateNote = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { note } = req.body;

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) return res.status(404).json({ error: '타임 엔트리를 찾을 수 없습니다.' });
    if (entry.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: { note },
      include: { user: { select: { id: true, displayName: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

module.exports = { listByTask, startTimer, stopTimer, remove, getRunning, updateNote };
