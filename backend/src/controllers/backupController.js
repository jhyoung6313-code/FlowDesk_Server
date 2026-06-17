const crypto = require('crypto');

const prisma = require('../lib/prisma');
const MAGIC = Buffer.from('FLW1');

function deriveKey() {
  return crypto.scryptSync(process.env.JWT_SECRET, 'flowdesk-backup-salt-v1', 32);
}

function encryptBackup(jsonStr) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

function decryptBackup(buf) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw Object.assign(new Error('올바른 백업 파일이 아닙니다.'), { status: 400 });
  const key = deriveKey();
  const iv = buf.subarray(4, 16);
  const tag = buf.subarray(16, 32);
  const ciphertext = buf.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const backup = async (req, res, next) => {
  try {
    const [
      users, parts, tasks, taskAssignees, taskExtraAssignees, taskDependencies,
      taskComments, taskAttachments, taskHistories, taskTags,
      tags, milestones, notifications, recurringTasks, taskTemplates,
      calendarNotes, wbsProjects, wbsProjectMembers, wbsTasks, wbsIssues,
      timeEntries, appSettings,
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, totpEnabled: true } }),
      prisma.part.findMany(),
      prisma.task.findMany(),
      prisma.taskAssignee.findMany(),
      prisma.taskExtraAssignee.findMany(),
      prisma.taskDependency.findMany(),
      prisma.taskComment.findMany(),
      prisma.taskAttachment.findMany(),
      prisma.taskHistory.findMany(),
      prisma.taskTag.findMany(),
      prisma.tag.findMany(),
      prisma.milestone.findMany(),
      prisma.notification.findMany(),
      prisma.recurringTask.findMany(),
      prisma.taskTemplate.findMany(),
      prisma.calendarNote.findMany(),
      prisma.wbsProject.findMany(),
      prisma.wbsProjectMember.findMany(),
      prisma.wbsTask.findMany(),
      prisma.wbsIssue.findMany(),
      prisma.timeEntry.findMany(),
      prisma.appSetting.findMany(),
    ]);

    const backupData = {
      version: '1.8',
      exportedAt: new Date().toISOString(),
      data: {
        users, parts, tasks, taskAssignees, taskExtraAssignees, taskDependencies,
        taskComments, taskAttachments, taskHistories, taskTags,
        tags, milestones, notifications, recurringTasks, taskTemplates,
        calendarNotes, wbsProjects, wbsProjectMembers, wbsTasks, wbsIssues,
        timeEntries, appSettings,
      },
    };

    const encrypted = encryptBackup(JSON.stringify(backupData));
    const filename = `flowdesk_backup_${new Date().toISOString().slice(0, 10)}.enc`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(encrypted);
  } catch (err) {
    next(err);
  }
};

const restore = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '백업 파일이 없습니다.' });

    let parsed;
    try {
      const jsonStr = decryptBackup(req.file.buffer);
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(400).json({ error: '백업 파일을 복호화할 수 없습니다. 올바른 파일인지 확인하세요.' });
    }

    const { data } = parsed;
    if (!data) return res.status(400).json({ error: '백업 데이터가 없습니다.' });

    // 트랜잭션으로 복원 (기존 데이터 유지하고 누락된 데이터만 추가)
    await prisma.$transaction(async (tx) => {
      // parts
      for (const part of (data.parts || [])) {
        await tx.part.upsert({
          where: { id: part.id },
          update: { name: part.name, description: part.description },
          create: part,
        });
      }

      // tags
      for (const tag of (data.tags || [])) {
        await tx.tag.upsert({
          where: { id: tag.id },
          update: { name: tag.name, color: tag.color },
          create: tag,
        });
      }

      // milestones
      for (const m of (data.milestones || [])) {
        await tx.milestone.upsert({
          where: { id: m.id },
          update: { name: m.name, date: new Date(m.date), color: m.color, description: m.description },
          create: { ...m, date: new Date(m.date), createdAt: new Date(m.createdAt), updatedAt: new Date(m.updatedAt) },
        });
      }

      // tasks
      for (const task of (data.tasks || [])) {
        await tx.task.upsert({
          where: { id: task.id },
          update: {
            title: task.title, description: task.description, partId: task.partId,
            priority: task.priority, status: task.status,
            startDate: task.startDate ? new Date(task.startDate) : null,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            delYn: task.delYn,
          },
          create: {
            ...task,
            startDate: task.startDate ? new Date(task.startDate) : null,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt),
          },
        });
      }

      // taskAssignees
      for (const ta of (data.taskAssignees || [])) {
        await tx.taskAssignee.upsert({
          where: { taskId_userId: { taskId: ta.taskId, userId: ta.userId } },
          update: {},
          create: { ...ta, assignedAt: new Date(ta.assignedAt) },
        });
      }

      // taskDependencies
      for (const dep of (data.taskDependencies || [])) {
        await tx.taskDependency.upsert({
          where: { predecessorId_successorId: { predecessorId: dep.predecessorId, successorId: dep.successorId } },
          update: {},
          create: dep,
        });
      }

      // calendarNotes
      for (const note of (data.calendarNotes || [])) {
        await tx.calendarNote.upsert({
          where: { id: note.id },
          update: { content: note.content, date: new Date(note.date) },
          create: { ...note, date: new Date(note.date), createdAt: new Date(note.createdAt), updatedAt: new Date(note.updatedAt) },
        });
      }

      // wbsProjects
      for (const proj of (data.wbsProjects || [])) {
        await tx.wbsProject.upsert({
          where: { id: proj.id },
          update: { name: proj.name, description: proj.description },
          create: {
            ...proj,
            startDate: proj.startDate ? new Date(proj.startDate) : null,
            endDate: proj.endDate ? new Date(proj.endDate) : null,
            createdAt: new Date(proj.createdAt),
            updatedAt: new Date(proj.updatedAt),
          },
        });
      }

      // appSettings
      for (const setting of (data.appSettings || [])) {
        await tx.appSetting.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: setting,
        });
      }
    });

    res.json({ message: '복원이 완료되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { backup, restore };
