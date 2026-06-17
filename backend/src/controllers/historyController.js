
const prisma = require('../lib/prisma');

// GET /api/tasks/:id/history
const list = async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    const histories = await prisma.taskHistory.findMany({
      where: { taskId },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(histories);
  } catch (err) {
    next(err);
  }
};

module.exports = { list };
