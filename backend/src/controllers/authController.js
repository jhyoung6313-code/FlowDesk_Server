const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const prisma = require('../lib/prisma');
const { kickUserSockets } = require('../socket');
const audit = require('../services/auditService');
const pwPolicy = require('../utils/passwordPolicy');
const { AUTH, LOCKOUT, AUDIT_ACTION } = require('../config/security');

// 미사용 화면 잠금 시간 허용값(분). 0 = 사용 안 함
const ALLOWED_IDLE_TIMEOUTS = [0, 10, 30, 60, 120, 240];

// ── 일반 JWT 발급 ──────────────────────────────────────────
// pwAt(=passwordChangedAt)을 토큰에 넣어, 비밀번호 변경 시 기존 토큰을 무효화한다.
function issueToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      pwAt: user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0,
      sn: user.sessionNonce,
    },
    process.env.JWT_SECRET,
    { expiresIn: AUTH.JWT_EXPIRES_IN }
  );
}

// ── 임시 JWT (5분, pre-auth / register 용) ─────────────────
function issueTempToken(userId, type) {
  return jwt.sign(
    { userId, type },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
}

function verifyTempToken(token, expectedType) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== expectedType) throw new Error('invalid type');
    return payload;
  } catch {
    return null;
  }
}

// ── 로그인 (1단계: 아이디+비밀번호) ───────────────────────
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      await audit.record({ action: AUDIT_ACTION.LOGIN_FAIL, req, username, resource: 'auth/login', success: false, detail: 'unknown-or-inactive' });
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 계정 잠금 확인 (무차별 대입 방어)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await audit.record({ action: AUDIT_ACTION.LOGIN_FAIL, req, userId: user.id, username, resource: 'auth/login', success: false, detail: 'locked' });
      const mins = Math.ceil((user.lockedUntil - new Date()) / 60000);
      return res.status(423).json({ error: `계정이 잠겼습니다. ${mins}분 후 다시 시도해주세요.` });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // 실패 횟수 누적 → 임계치 초과 시 잠금
      const failed = (user.failedLoginCount || 0) + 1;
      const lock = failed >= LOCKOUT.MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCKOUT.LOCK_DURATION_MINUTES * 60000) : user.lockedUntil,
        },
      });
      await audit.record({ action: AUDIT_ACTION.LOGIN_FAIL, req, userId: user.id, username, resource: 'auth/login', success: false, detail: `attempt=${failed}` });
      if (lock) {
        await audit.record({ action: AUDIT_ACTION.ACCOUNT_LOCKED, req, userId: user.id, username, resource: 'auth/login', success: false });
        return res.status(423).json({ error: `로그인 ${LOCKOUT.MAX_FAILED_ATTEMPTS}회 실패로 계정이 잠겼습니다. ${LOCKOUT.LOCK_DURATION_MINUTES}분 후 다시 시도해주세요.` });
      }
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // OTP 2단계 인증: 전사 강제(ENFORCE_OTP) 또는 사용자 개별 활성화 시
    // [개발용 임시 제외] .env의 DISABLE_OTP=true 이면 OTP 단계를 통째로 건너뛴다.
    // 운영 배포 전 반드시 DISABLE_OTP를 제거(또는 false)할 것.
    const otpDisabled = process.env.DISABLE_OTP === 'true';
    if (!otpDisabled && (AUTH.ENFORCE_OTP || user.totpEnabled)) {
      if (!user.totpEnabled || !user.totpSecret) {
        // 강제 정책인데 아직 OTP 미등록 → 등록 유도
        const preAuthToken = issueTempToken(user.id, 'pre-auth');
        return res.json({ requireTotpSetup: true, preAuthToken });
      }
      const preAuthToken = issueTempToken(user.id, 'pre-auth');
      return res.json({ requireTotp: true, preAuthToken });
    }

    const finalUser = await finalizeLogin(user, req);
    res.json(buildLoginResponse(finalUser));
  } catch (err) {
    next(err);
  }
};

// 로그인 성공 후처리: 실패카운트 초기화 + 세션 nonce 갱신 + 최종 로그인 기록 + 감사로그
// 반환값: sessionNonce가 반영된 최신 user 객체 (issueToken에 전달해야 함)
async function finalizeLogin(user, req) {
  // 기존 소켓 연결 강제 종료 (중복 로그인 차단)
  kickUserSockets(user.id);
  const sessionNonce = crypto.randomUUID();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: audit.getClientIp(req),
      sessionNonce,
    },
  });
  await audit.record({ action: AUDIT_ACTION.LOGIN_SUCCESS, req, userId: user.id, username: user.username, resource: 'auth/login' });
  return updated;
}

// 로그인 응답 본문 (비밀번호 변경 필요 여부 포함)
function buildLoginResponse(user) {
  return {
    token: issueToken(user),
    mustChangePassword: user.mustChangePassword || pwPolicy.isExpired(user.passwordChangedAt),
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, totpEnabled: user.totpEnabled, avatarColor: user.avatarColor, idleTimeoutMin: user.idleTimeoutMin },
  };
}

// ── 로그인 (2단계: OTP 검증) ───────────────────────────────
const verifyLoginTotp = async (req, res, next) => {
  try {
    const { preAuthToken, otpCode } = req.body;
    if (!preAuthToken || !otpCode) {
      return res.status(400).json({ error: 'OTP 코드를 입력해주세요.' });
    }

    const payload = verifyTempToken(preAuthToken, 'pre-auth');
    if (!payload) {
      return res.status(401).json({ error: '인증 세션이 만료되었습니다. 다시 로그인해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
      return res.status(401).json({ error: '인증 정보가 올바르지 않습니다.' });
    }

    const isValid = authenticator.verify({ token: otpCode, secret: user.totpSecret });
    if (!isValid) {
      await audit.record({ action: AUDIT_ACTION.LOGIN_FAIL, req, userId: user.id, username: user.username, resource: 'auth/verify-totp', success: false, detail: 'otp-mismatch' });
      return res.status(401).json({ error: 'OTP 코드가 올바르지 않습니다.' });
    }

    const finalUser = await finalizeLogin(user, req);
    res.json(buildLoginResponse(finalUser));
  } catch (err) {
    next(err);
  }
};

// ── 로그인 중 OTP 등록 (1단계: pre-auth 토큰으로 QR 생성) ──
// ENFORCE_OTP=true 인데 아직 OTP 미등록인 사용자가 로그인 과정에서 등록.
const setupLoginTotp = async (req, res, next) => {
  try {
    const { preAuthToken } = req.body;
    const payload = verifyTempToken(preAuthToken, 'pre-auth');
    if (!payload) {
      return res.status(401).json({ error: '인증 세션이 만료되었습니다. 다시 로그인해주세요.' });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: '인증 정보가 올바르지 않습니다.' });
    }

    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    const otpAuthUrl = authenticator.keyuri(user.username, 'Flowdesk', secret);
    const qrDataUrl = await QRCode.toDataURL(otpAuthUrl);
    res.json({ qrDataUrl });
  } catch (err) {
    next(err);
  }
};

// ── 로그인 중 OTP 등록 (2단계: 코드 검증 → 활성화 + 로그인 완료) ──
const verifyLoginTotpSetup = async (req, res, next) => {
  try {
    const { preAuthToken, otpCode } = req.body;
    if (!preAuthToken || !otpCode) {
      return res.status(400).json({ error: 'OTP 코드를 입력해주세요.' });
    }
    const payload = verifyTempToken(preAuthToken, 'pre-auth');
    if (!payload) {
      return res.status(401).json({ error: '인증 세션이 만료되었습니다. 다시 로그인해주세요.' });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive || !user.totpSecret) {
      return res.status(400).json({ error: 'OTP 설정을 먼저 시작하세요.' });
    }
    const isValid = authenticator.verify({ token: otpCode, secret: user.totpSecret });
    if (!isValid) {
      return res.status(401).json({ error: 'OTP 코드가 올바르지 않습니다.' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    const enabled = { ...user, totpEnabled: true };
    const finalUser = await finalizeLogin(enabled, req);
    res.json(buildLoginResponse(finalUser));
  } catch (err) {
    next(err);
  }
};

// ── 계정 신청 (1단계: 정보 입력) ──────────────────────────
const register = async (req, res, next) => {
  try {
    const { username, displayName, password } = req.body;
    if (!username || !displayName || !password) {
      return res.status(400).json({ error: '아이디, 이름, 비밀번호를 모두 입력해주세요.' });
    }
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
      return res.status(400).json({ error: '아이디는 영문자, 숫자, 밑줄(_)만 사용 가능합니다. (3~50자)' });
    }
    const formatError = pwPolicy.validateFormat(password, username);
    if (formatError) {
      return res.status(400).json({ error: formatError });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, AUTH.BCRYPT_ROUNDS);
    const totpSecret = authenticator.generateSecret();

    // isActive: false → OTP 인증 완료 후 활성화
    const user = await prisma.user.create({
      data: { username, displayName, passwordHash, totpSecret, totpEnabled: false, isActive: false },
    });

    const otpAuthUrl = authenticator.keyuri(username, 'Flowdesk', totpSecret);
    const qrDataUrl = await QRCode.toDataURL(otpAuthUrl);
    const tempToken = issueTempToken(user.id, 'register');

    res.status(201).json({ tempToken, qrDataUrl });
  } catch (err) {
    next(err);
  }
};

// ── 계정 신청 (2단계: OTP 인증 + 계정 활성화) ─────────────
const verifyRegisterTotp = async (req, res, next) => {
  try {
    const { tempToken, otpCode } = req.body;
    if (!tempToken || !otpCode) {
      return res.status(400).json({ error: 'OTP 코드를 입력해주세요.' });
    }

    const payload = verifyTempToken(tempToken, 'register');
    if (!payload) {
      return res.status(401).json({ error: '인증 세션이 만료되었습니다. 처음부터 다시 시도해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.isActive) {
      return res.status(400).json({ error: '올바르지 않은 요청입니다.' });
    }

    const isValid = authenticator.verify({ token: otpCode, secret: user.totpSecret });
    if (!isValid) {
      return res.status(401).json({ error: 'OTP 코드가 올바르지 않습니다.' });
    }

    // 계정 활성화
    const activated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true, totpEnabled: true, sessionNonce: crypto.randomUUID() },
    });

    const token = issueToken(activated);
    res.json({
      token,
      user: {
        id: activated.id,
        username: activated.username,
        displayName: activated.displayName,
        role: activated.role,
        totpEnabled: activated.totpEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 로그아웃 ──────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { sessionNonce: null },
    });
    res.json({ message: '로그아웃 되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ── 내 정보 조회 ──────────────────────────────────────────
const me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, username: true, displayName: true,
        role: true, isActive: true, totpEnabled: true, createdAt: true, avatarColor: true,
        idleTimeoutMin: true, department: true, position: true, jobGrade: true,
      },
    });
    res.json({ ...user, clientIp: audit.getClientIp(req) });
  } catch (err) {
    next(err);
  }
};

// ── 미사용 화면 잠금 시간 설정 ────────────────────────────
const updateIdleTimeout = async (req, res, next) => {
  try {
    const { idleTimeoutMin } = req.body;
    if (!ALLOWED_IDLE_TIMEOUTS.includes(idleTimeoutMin)) {
      return res.status(400).json({ error: '허용되지 않은 타임아웃 값입니다.' });
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { idleTimeoutMin },
    });
    res.json({ idleTimeoutMin });
  } catch (err) {
    next(err);
  }
};

// ── 내 프로필(조직 정보) 수정 ─────────────────────────────
const PROFILE_FIELD_MAX_LEN = 100;

const updateProfile = async (req, res, next) => {
  try {
    const { department, position, jobGrade } = req.body;
    // 빈 문자열은 null로 정규화하고, 길이 제한을 검증한다
    const normalize = (v) => {
      if (v === undefined || v === null) return null;
      const trimmed = String(v).trim();
      return trimmed === '' ? null : trimmed;
    };
    const data = {
      department: normalize(department),
      position: normalize(position),
      jobGrade: normalize(jobGrade),
    };
    for (const value of Object.values(data)) {
      if (value && value.length > PROFILE_FIELD_MAX_LEN) {
        return res.status(400).json({ error: `각 항목은 ${PROFILE_FIELD_MAX_LEN}자 이하로 입력해주세요.` });
      }
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { department: true, position: true, jobGrade: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ── 비밀번호 검증 (화면 잠금 해제용) ──────────────────────
const verifyPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: '비밀번호를 입력해주세요.' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── 비밀번호 변경 ─────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }

    const formatError = pwPolicy.validateFormat(newPassword, user.username);
    if (formatError) {
      return res.status(400).json({ error: formatError });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ error: '현재 비밀번호와 다른 비밀번호를 사용해주세요.' });
    }
    const reuseError = await pwPolicy.checkReuse(prisma, user.id, newPassword);
    if (reuseError) {
      return res.status(400).json({ error: reuseError });
    }

    const newHash = await bcrypt.hash(newPassword, AUTH.BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await pwPolicy.pushHistory(prisma, user.id, newHash);
    await audit.record({ action: AUDIT_ACTION.PASSWORD_CHANGE, req, userId: user.id, username: user.username, resource: 'auth/change-password' });

    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ── OTP 설정 (1단계: QR 코드 생성) ────────────────────────
const setupOtp = async (req, res, next) => {
  try {
    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(req.user.username, 'Flowdesk', secret);
    const qrDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // 임시 저장 (아직 totpEnabled는 true로 변경 안 함)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { totpSecret: secret },
    });

    res.json({ qrDataUrl, secret });
  } catch (err) {
    next(err);
  }
};

// ── OTP 설정 (2단계: 코드 검증 → 활성화) ─────────────────
const verifySetupOtp = async (req, res, next) => {
  try {
    const { otpCode } = req.body;
    if (!otpCode) {
      return res.status(400).json({ error: 'OTP 코드를 입력해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.totpSecret) {
      return res.status(400).json({ error: 'OTP 설정을 먼저 시작하세요.' });
    }

    const isValid = authenticator.verify({ token: otpCode, secret: user.totpSecret });
    if (!isValid) {
      return res.status(401).json({ error: 'OTP 코드가 올바르지 않습니다.' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { totpEnabled: true },
    });

    res.json({ message: 'OTP가 활성화되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ── 비밀번호 초기화 (1단계: 아이디 확인 → reset-otp 토큰) ──
const requestPasswordReset = async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: '아이디를 입력해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    // 존재하지 않거나 비활성 또는 OTP 미설정 모두 동일 메시지 (열거 방지)
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
      return res.status(404).json({ error: '해당 계정을 찾을 수 없거나 OTP가 설정되지 않은 계정입니다.' });
    }

    const resetOtpToken = issueTempToken(user.id, 'reset-otp');
    res.json({ resetOtpToken });
  } catch (err) {
    next(err);
  }
};

// ── 비밀번호 초기화 (2단계: OTP 검증 → reset-pw 토큰) ──────
const verifyResetOtp = async (req, res, next) => {
  try {
    const { resetOtpToken, otpCode } = req.body;
    if (!resetOtpToken || !otpCode) {
      return res.status(400).json({ error: 'OTP 코드를 입력해주세요.' });
    }

    const payload = verifyTempToken(resetOtpToken, 'reset-otp');
    if (!payload) {
      return res.status(401).json({ error: '인증 세션이 만료되었습니다. 처음부터 다시 시도해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
      return res.status(401).json({ error: '인증 정보가 올바르지 않습니다.' });
    }

    const isValid = authenticator.verify({ token: otpCode, secret: user.totpSecret });
    if (!isValid) {
      return res.status(401).json({ error: 'OTP 코드가 올바르지 않습니다.' });
    }

    const resetPwToken = issueTempToken(user.id, 'reset-pw');
    res.json({ resetPwToken });
  } catch (err) {
    next(err);
  }
};

// ── 비밀번호 초기화 (3단계: 새 비밀번호 설정) ──────────────
const confirmPasswordReset = async (req, res, next) => {
  try {
    const { resetPwToken, newPassword } = req.body;
    if (!resetPwToken || !newPassword) {
      return res.status(400).json({ error: '새 비밀번호를 입력해주세요.' });
    }

    const payload = verifyTempToken(resetPwToken, 'reset-pw');
    if (!payload) {
      return res.status(401).json({ error: '인증 세션이 만료되었습니다. 처음부터 다시 시도해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: '인증 정보가 올바르지 않습니다.' });
    }

    const formatError = pwPolicy.validateFormat(newPassword, user.username);
    if (formatError) {
      return res.status(400).json({ error: formatError });
    }
    const reuseError = await pwPolicy.checkReuse(prisma, user.id, newPassword);
    if (reuseError) {
      return res.status(400).json({ error: reuseError });
    }

    const newHash = await bcrypt.hash(newPassword, AUTH.BCRYPT_ROUNDS);
    // 비밀번호 초기화 시 잠금도 함께 해제
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    });
    await pwPolicy.pushHistory(prisma, user.id, newHash);
    await audit.record({ action: AUDIT_ACTION.PASSWORD_RESET, req, userId: user.id, username: user.username, resource: 'auth/reset-password' });

    res.json({ message: '비밀번호가 초기화되었습니다.' });
  } catch (err) {
    next(err);
  }
};

// ── OTP 해제 ───────────────────────────────────────────────
const disableOtp = async (req, res, next) => {
  try {
    const { otpCode } = req.body;
    if (!otpCode) {
      return res.status(400).json({ error: 'OTP 코드를 입력해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.totpEnabled || !user?.totpSecret) {
      return res.status(400).json({ error: 'OTP가 활성화되어 있지 않습니다.' });
    }

    const isValid = authenticator.verify({ token: otpCode, secret: user.totpSecret });
    if (!isValid) {
      return res.status(401).json({ error: 'OTP 코드가 올바르지 않습니다.' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { totpEnabled: false, totpSecret: null },
    });

    res.json({ message: 'OTP가 해제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, logout, me, changePassword, updateIdleTimeout, updateProfile, verifyPassword, verifyLoginTotp, setupLoginTotp, verifyLoginTotpSetup, register, verifyRegisterTotp, setupOtp, verifySetupOtp, disableOtp, requestPasswordReset, verifyResetOtp, confirmPasswordReset };
