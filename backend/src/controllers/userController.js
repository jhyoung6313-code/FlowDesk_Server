const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const prisma = require('../lib/prisma');

const SIGNATURE_DIR = path.join(__dirname, '../../uploads/signatures');
if (!fs.existsSync(SIGNATURE_DIR)) fs.mkdirSync(SIGNATURE_DIR, { recursive: true });
const pwPolicy = require('../utils/passwordPolicy');
const { AUTH } = require('../config/security');
const { sanitize: sanitizePermissions } = require('../config/permissions');

const USER_SELECT = {
  id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, avatarColor: true,
  departmentId: true, teamId: true,
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  position: true, jobGrade: true, permissions: true, signImagePath: true, sealImagePath: true,
  lockedUntil: true, failedLoginCount: true, lastLoginAt: true, totpEnabled: true,
};

const list = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { username, password, displayName, role, departmentId, teamId, permissions, position, jobGrade } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: '아이디, 비밀번호, 이름은 필수입니다.' });
    }
    const formatError = pwPolicy.validateFormat(password, username);
    if (formatError) {
      return res.status(400).json({ error: formatError });
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, AUTH.BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        username, passwordHash, displayName, role: role || 'member',
        departmentId: departmentId ? Number(departmentId) : null,
        teamId: teamId ? Number(teamId) : null,
        position: position?.trim() || null,
        jobGrade: jobGrade?.trim() || null,
        permissions: sanitizePermissions(permissions),
      },
      select: USER_SELECT,
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { displayName, role, password, departmentId, teamId, permissions, position, jobGrade } = req.body;

    const data = {};
    if (displayName) data.displayName = displayName;
    if (role) data.role = role;
    if (departmentId !== undefined) data.departmentId = departmentId ? Number(departmentId) : null;
    if (teamId !== undefined) data.teamId = teamId ? Number(teamId) : null;
    if (permissions !== undefined) data.permissions = sanitizePermissions(permissions);
    if (position !== undefined) data.position = position?.trim() || null;
    if (jobGrade !== undefined) data.jobGrade = jobGrade?.trim() || null;
    if (password) {
      const formatError = pwPolicy.validateFormat(password);
      if (formatError) {
        return res.status(400).json({ error: formatError });
      }
      data.passwordHash = await bcrypt.hash(password, AUTH.BCRYPT_ROUNDS);
    }

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data,
      select: USER_SELECT,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

const deactivate = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) {
      return res.status(400).json({ error: '자기 자신은 비활성화할 수 없습니다.' });
    }
    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { isActive: false },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

const activate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { isActive: true },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

function generateTempPassword() {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  let pwd =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    special[Math.floor(Math.random() * special.length)];

  for (let i = 4; i < 10; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

const resetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.update({
      where: { id: Number(id) },
      data: { passwordHash },
    });
    res.json({ tempPassword });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/users/me/avatar-color — 내 아바타 색상 변경 */
const updateAvatarColor = async (req, res, next) => {
  try {
    const { color } = req.body;
    if (!color || !/^#[0-9a-fA-F]{3,8}$/.test(color)) {
      return res.status(400).json({ error: '유효한 HEX 색상을 입력하세요.' });
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarColor: color },
      select: USER_SELECT,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

/** PUT /api/users/me/status — 내 상태 이모지·텍스트 설정 */
const setStatus = async (req, res, next) => {
  try {
    const { statusEmoji, statusText } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        statusEmoji: statusEmoji?.trim() || null,
        statusText: statusText?.trim() || null,
      },
      select: { id: true, statusEmoji: true, statusText: true },
    });
    res.json(user);
  } catch (err) { next(err); }
};

// kind → User 필드 매핑 (sign=서명, seal=인감)
const SIGN_FIELD = { sign: 'signImagePath', seal: 'sealImagePath' };

/** POST /api/users/me/signature — 서명/인감 이미지 등록 (multipart: file, field kind=sign|seal) */
const uploadSignature = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const kind = req.body?.kind === 'seal' ? 'seal' : 'sign';
    const field = SIGN_FIELD[kind];

    // 기존 파일 정리
    const prev = await prisma.user.findUnique({ where: { id: req.user.id }, select: { [field]: true } });
    if (prev?.[field]) {
      const oldPath = path.join(SIGNATURE_DIR, path.basename(prev[field]));
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch {} }
    }

    const relPath = `/uploads/signatures/${req.file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { [field]: relPath },
      select: { id: true, signImagePath: true, sealImagePath: true },
    });
    res.json(user);
  } catch (err) { next(err); }
};

/** DELETE /api/users/me/signature — 서명/인감 이미지 삭제 (query kind=sign|seal) */
const deleteSignature = async (req, res, next) => {
  try {
    const kind = req.query?.kind === 'seal' ? 'seal' : 'sign';
    const field = SIGN_FIELD[kind];
    const prev = await prisma.user.findUnique({ where: { id: req.user.id }, select: { [field]: true } });
    if (prev?.[field]) {
      const oldPath = path.join(SIGNATURE_DIR, path.basename(prev[field]));
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch {} }
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { [field]: null } });
    res.json({ message: (kind === 'seal' ? '인감' : '서명') + '이 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// GET /api/users/workload
// 활성 사용자별 진행 중(pending/in_progress) 업무 부하를 집계해 반환
const workload = async (req, res, next) => {
  try {
    // 과부하 임계치 (진행 중 업무 수) — 설정값 있으면 사용, 없으면 기본 8
    const OVERLOAD_THRESHOLD = Number(process.env.WORKLOAD_OVERLOAD_THRESHOLD) || 8;
    const WARN_THRESHOLD = Math.ceil(OVERLOAD_THRESHOLD * 0.625); // 기본 5

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true, displayName: true, username: true, avatarColor: true, position: true,
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const assignees = await prisma.taskAssignee.findMany({
      where: {
        task: { delYn: '0', status: { in: ['pending', 'in_progress'] } },
      },
      select: {
        userId: true,
        task: { select: { id: true, priority: true, status: true, dueDate: true } },
      },
    });

    const byUser = new Map();
    for (const a of assignees) {
      if (!byUser.has(a.userId)) byUser.set(a.userId, []);
      byUser.get(a.userId).push(a.task);
    }

    const result = users.map((u) => {
      const tasks = byUser.get(u.id) || [];
      const counts = {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === 'pending').length,
        inProgress: tasks.filter((t) => t.status === 'in_progress').length,
        high: tasks.filter((t) => t.priority === 'high' || t.priority === 'urgent').length,
        overdue: tasks.filter((t) => t.dueDate && new Date(t.dueDate) < today).length,
      };
      let level = 'normal';
      if (counts.total >= OVERLOAD_THRESHOLD) level = 'overload';
      else if (counts.total >= WARN_THRESHOLD) level = 'warning';
      else if (counts.total === 0) level = 'idle';
      return { ...u, counts, level };
    });

    res.json({
      thresholds: { warning: WARN_THRESHOLD, overload: OVERLOAD_THRESHOLD },
      users: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, deactivate, activate, resetPassword, updateAvatarColor, setStatus, workload, uploadSignature, deleteSignature };
