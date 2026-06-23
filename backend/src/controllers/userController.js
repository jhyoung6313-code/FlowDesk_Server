const bcrypt = require('bcrypt');

const prisma = require('../lib/prisma');
const pwPolicy = require('../utils/passwordPolicy');
const { AUTH } = require('../config/security');

const USER_SELECT = { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, avatarColor: true, department: true, position: true };

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
    const { username, password, displayName, role } = req.body;
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
      data: { username, passwordHash, displayName, role: role || 'member' },
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { displayName, role, password } = req.body;

    const data = {};
    if (displayName) data.displayName = displayName;
    if (role) data.role = role;
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
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
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

module.exports = { list, create, update, deactivate, activate, resetPassword, updateAvatarColor, setStatus };
