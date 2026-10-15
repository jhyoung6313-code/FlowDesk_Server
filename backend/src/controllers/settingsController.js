const { testSmtpConnection } = require('../services/emailService');
const { isEmailOptedOut, setEmailOptOut } = require('../services/emailPreference');

const prisma = require('../lib/prisma');

const EMAIL_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'email_enabled'];

/** GET /api/settings/email — SMTP 설정 조회 (Admin) */
const getEmailSettings = async (req, res, next) => {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: EMAIL_KEYS } },
    });
    const cfg = {};
    for (const r of rows) cfg[r.key] = r.value;
    // smtp_pass 는 존재 여부만 반환 (마스킹)
    if (cfg.smtp_pass) cfg.smtp_pass_set = true;
    delete cfg.smtp_pass;
    res.json(cfg);
  } catch (err) {
    next(err);
  }
};

/** PUT /api/settings/email — SMTP 설정 저장 (Admin) */
const updateEmailSettings = async (req, res, next) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, email_enabled } = req.body;

    const upserts = [];

    if (smtp_host !== undefined) upserts.push({ key: 'smtp_host', value: smtp_host });
    if (smtp_port !== undefined) upserts.push({ key: 'smtp_port', value: String(smtp_port) });
    if (smtp_user !== undefined) upserts.push({ key: 'smtp_user', value: smtp_user });
    if (smtp_pass !== undefined && smtp_pass !== '') upserts.push({ key: 'smtp_pass', value: smtp_pass });
    if (smtp_from !== undefined) upserts.push({ key: 'smtp_from', value: smtp_from });
    if (email_enabled !== undefined) upserts.push({ key: 'email_enabled', value: String(email_enabled) });

    await prisma.$transaction(
      upserts.map((u) =>
        prisma.appSetting.upsert({
          where: { key: u.key },
          create: { key: u.key, value: u.value },
          update: { value: u.value },
        })
      )
    );

    res.json({ message: '이메일 설정이 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
};

/** POST /api/settings/email/test — SMTP 연결 테스트 (Admin) */
const testEmail = async (req, res, next) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass } = req.body;

    if (!smtp_host || !smtp_user || !smtp_pass) {
      return res.status(400).json({ error: 'SMTP 호스트, 사용자, 비밀번호를 입력하세요.' });
    }

    await testSmtpConnection({ smtp_host, smtp_port, smtp_user, smtp_pass });
    res.json({ message: 'SMTP 연결에 성공했습니다.' });
  } catch (err) {
    res.status(400).json({ error: `SMTP 연결 실패: ${err.message}` });
  }
};

/** GET /api/settings/widgets — 대시보드 위젯 설정 조회 (본인) */
const getWidgetSettings = async (req, res, next) => {
  try {
    const key = `dashboard_widgets_${req.user.id}`;
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const defaults = {
      urgentAlert: true, statusCards: true, overdueTasks: true,
      todayTasks: true, weekTasks: true, ledgerCard: false,
      chartStatus: true, chartPart: true, chartAssignee: true,
    };
    if (!row) return res.json(defaults);
    try {
      res.json({ ...defaults, ...JSON.parse(row.value) });
    } catch {
      res.json(defaults);
    }
  } catch (err) {
    next(err);
  }
};

/** PUT /api/settings/widgets — 대시보드 위젯 설정 저장 (본인) */
const updateWidgetSettings = async (req, res, next) => {
  try {
    const key = `dashboard_widgets_${req.user.id}`;
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(req.body) },
      update: { value: JSON.stringify(req.body) },
    });
    res.json({ message: '위젯 설정이 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
};

/** GET /api/settings/theme — 개인 테마·화면 설정 조회 (본인) */
const getThemePrefs = async (req, res, next) => {
  try {
    const key = `theme_prefs_${req.user.id}`;
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row) return res.json({});
    try {
      res.json(JSON.parse(row.value));
    } catch {
      res.json({});
    }
  } catch (err) {
    next(err);
  }
};

/** PUT /api/settings/theme — 개인 테마·화면 설정 저장 (본인) */
const updateThemePrefs = async (req, res, next) => {
  try {
    const key = `theme_prefs_${req.user.id}`;
    const { themeKey, isDark, customAccent, density, skin } = req.body;
    const value = JSON.stringify({ themeKey, isDark, customAccent, density, skin });
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    res.json({ message: '테마 설정이 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
};

const PREF_KEY_RE = /^[a-zA-Z0-9_]{1,40}$/;
const PREF_RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PREF_MAX_KEYS = 30;
const PREF_MAX_BYTES = 32 * 1024;
const PREF_MAX_DEPTH = 6;

/** JSON 값의 중첩 깊이 (원시값 0, 빈 객체/배열 1) */
function jsonDepth(v) {
  if (v === null || typeof v !== 'object') return 0;
  let max = 0;
  for (const c of Object.values(v)) max = Math.max(max, jsonDepth(c));
  return max + 1;
}

/** GET /api/settings/preferences — 개인 화면 설정(내비게이션 등) 전체 조회 (본인) */
const getPreferences = async (req, res, next) => {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: `user_prefs_${req.user.id}` } });
    if (!row) return res.json({});
    try {
      const v = JSON.parse(row.value);
      res.json(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    } catch {
      res.json({});
    }
  } catch (err) { next(err); }
};

/** PUT /api/settings/preferences — 전달된 최상위 키만 병합 저장 (값이 null이면 해당 키 삭제)
 *  body: { nav: {...}, ... }
 *  읽기→병합→저장을 한 트랜잭션 + 사용자별 advisory lock 으로 묶어, 같은 사용자의 동시 PUT
 *  (여러 탭 등)이 서로의 키를 덮어쓰지 않게 한다. */
const updatePreferences = async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }
    const keys = Object.keys(body);
    if (keys.some((k) => !PREF_KEY_RE.test(k) || PREF_RESERVED_KEYS.has(k))) {
      return res.status(400).json({ error: '허용되지 않는 설정 키입니다.' });
    }
    if (keys.some((k) => jsonDepth(body[k]) > PREF_MAX_DEPTH)) {
      return res.status(400).json({ error: '설정 값의 중첩이 너무 깊습니다.' });
    }
    const key = `user_prefs_${req.user.id}`;

    const result = await prisma.$transaction(async (tx) => {
      // pg_advisory_xact_lock 은 void 를 반환하므로 $queryRaw 는 역직렬화에 실패한다 → $executeRaw 사용
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const row = await tx.appSetting.findUnique({ where: { key } });
      let cur = {};
      try {
        const v = row ? JSON.parse(row.value) : {};
        cur = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      } catch { cur = {}; }
      if (keys.length === 0) return { prefs: cur };   // 빈 요청은 쓰기 없이 현재값 반환
      const merged = { ...cur };
      for (const k of keys) {
        if (body[k] === null) delete merged[k]; else merged[k] = body[k];
      }
      const value = JSON.stringify(merged);
      if (Object.keys(merged).length > PREF_MAX_KEYS || Buffer.byteLength(value) > PREF_MAX_BYTES) {
        return { tooLarge: true };
      }
      await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      return { prefs: merged };
    });

    if (result.tooLarge) return res.status(413).json({ error: '저장할 수 있는 설정 크기를 초과했습니다.' });
    res.json(result.prefs);
  } catch (err) { next(err); }
};

/** GET /api/settings/dashboard-layout — 개인 대시보드 레이아웃 조회 (본인) */
const getDashboardLayout = async (req, res, next) => {
  try {
    const key = `dashboard_layout_${req.user.id}`;
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row) return res.json(null);
    try {
      res.json(JSON.parse(row.value));
    } catch {
      res.json(null);
    }
  } catch (err) {
    next(err);
  }
};

/** PUT /api/settings/dashboard-layout — 개인 대시보드 레이아웃 저장 (본인)
 *  body: { layout: [{i,x,y,w,h}...], enabled: {blockId: bool}, v: number } */
const updateDashboardLayout = async (req, res, next) => {
  try {
    const key = `dashboard_layout_${req.user.id}`;
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(req.body) },
      update: { value: JSON.stringify(req.body) },
    });
    res.json({ message: '대시보드 레이아웃이 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
};

/** GET /api/settings/approval-lines — 개인 결재선 프리셋 조회 (본인) */
const getApprovalLinePresets = async (req, res, next) => {
  try {
    const key = `approval_lines_${req.user.id}`;
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row) return res.json([]);
    try {
      const v = JSON.parse(row.value);
      res.json(Array.isArray(v) ? v : []);
    } catch { res.json([]); }
  } catch (err) { next(err); }
};

/** PUT /api/settings/approval-lines — 개인 결재선 프리셋 저장 (본인)
 *  body: [{ id, name, steps: [{approverId, approverName, type, stepOrder}] }] */
const updateApprovalLinePresets = async (req, res, next) => {
  try {
    const key = `approval_lines_${req.user.id}`;
    const value = JSON.stringify(Array.isArray(req.body) ? req.body.slice(0, 30) : []);
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    res.json({ message: '결재선 프리셋이 저장되었습니다.' });
  } catch (err) { next(err); }
};

const SHARED_APPROVAL_LINES_KEY = 'approval_lines_shared';

/** GET /api/settings/approval-lines/shared — 팀 공유 결재선 프리셋 조회 (전원 열람) */
const getSharedApprovalLinePresets = async (req, res, next) => {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SHARED_APPROVAL_LINES_KEY } });
    if (!row) return res.json([]);
    try {
      const v = JSON.parse(row.value);
      res.json(Array.isArray(v) ? v : []);
    } catch { res.json([]); }
  } catch (err) { next(err); }
};

// 팀 공유 프리셋 1건 추가/삭제는 "현재 최신 배열을 서버가 다시 읽어 수정"하는 방식으로
// 처리한다. 과거에는 PUT으로 클라이언트가 들고 있던 전체 배열을 통째로 덮어썼는데, 두
// 사용자가 거의 동시에 서로 다른 프리셋을 추가/삭제하면 나중에 저장한 쪽이 먼저 저장한
// 쪽의 변경을 그대로 지워버리는 lost-update가 발생했다(각자 로드 시점의 스냅샷을 기준으로
// "배열+1건"을 통째로 PUT 했기 때문). advisory lock으로 동시 요청을 직렬화해 이 키에 대한
// read-modify-write 자체를 원자적으로 만든다.
const SHARED_PRESET_LOCK_ID = 911001;

async function readSharedPresetList(tx) {
  const row = await tx.appSetting.findUnique({ where: { key: SHARED_APPROVAL_LINES_KEY } });
  if (!row) return [];
  try {
    const v = JSON.parse(row.value);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

/** POST /api/settings/approval-lines/shared — 팀 공유 결재선 프리셋 1건 추가(원자적) */
const addSharedApprovalLinePreset = async (req, res, next) => {
  try {
    const entry = req.body;
    if (!entry || !entry.name || !Array.isArray(entry.steps)) {
      return res.status(400).json({ error: '프리셋 이름과 결재선(steps)이 필요합니다.' });
    }
    const list = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SHARED_PRESET_LOCK_ID})`;
      const current = await readSharedPresetList(tx);
      const next = [...current, entry].slice(-50); // 최대 50개(기존 cap 유지) — 오래된 것부터 제거
      await tx.appSetting.upsert({
        where: { key: SHARED_APPROVAL_LINES_KEY },
        create: { key: SHARED_APPROVAL_LINES_KEY, value: JSON.stringify(next) },
        update: { value: JSON.stringify(next) },
      });
      return next;
    });
    res.json(list);
  } catch (err) { next(err); }
};

/** DELETE /api/settings/approval-lines/shared/:id — 팀 공유 결재선 프리셋 1건 삭제(원자적) */
const deleteSharedApprovalLinePreset = async (req, res, next) => {
  try {
    const { id } = req.params;
    const list = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SHARED_PRESET_LOCK_ID})`;
      const current = await readSharedPresetList(tx);
      const next = current.filter((p) => String(p.id) !== String(id));
      await tx.appSetting.upsert({
        where: { key: SHARED_APPROVAL_LINES_KEY },
        create: { key: SHARED_APPROVAL_LINES_KEY, value: JSON.stringify(next) },
        update: { value: JSON.stringify(next) },
      });
      return next;
    });
    res.json(list);
  } catch (err) { next(err); }
};

/** GET /api/settings/approval-auto-delegate — 내가 휴가 중일 때 결재를 자동 위임할 대상 조회 */
const getApprovalAutoDelegate = async (req, res, next) => {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: `approval_auto_delegate_${req.user.id}` } });
    if (!row) return res.json({ toUserId: null });
    try { res.json(JSON.parse(row.value)); } catch { res.json({ toUserId: null }); }
  } catch (err) { next(err); }
};

/** PUT /api/settings/approval-auto-delegate — 자동 위임 대상 설정/해제(toUserId: null이면 해제)
 *  일정(F-55)에 본인이 '휴가'로 등록된 기간 동안, 새로 결재 차례가 된 문서를 이 대상에게
 *  자동으로 위임한다(approvalController.applyAutoDelegation 참조). */
const updateApprovalAutoDelegate = async (req, res, next) => {
  try {
    const toUserId = req.body?.toUserId ? Number(req.body.toUserId) : null;
    if (toUserId === req.user.id) return res.status(400).json({ error: '본인을 위임 대상으로 지정할 수 없습니다.' });
    const key = `approval_auto_delegate_${req.user.id}`;
    const value = JSON.stringify({ toUserId });
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    res.json({ message: toUserId ? '자동 위임 대상이 설정되었습니다.' : '자동 위임이 해제되었습니다.' });
  } catch (err) { next(err); }
};

/** GET /api/settings/email-opt-out — 본인의 "알림 이메일 받지 않기" 여부 조회 */
const getEmailOptOut = async (req, res, next) => {
  try { res.json({ optOut: await isEmailOptedOut(req.user.id) }); }
  catch (err) { next(err); }
};

/** PUT /api/settings/email-opt-out — 알림 이메일 수신 여부 설정(인앱 알림은 영향 없음) */
const updateEmailOptOut = async (req, res, next) => {
  try {
    await setEmailOptOut(req.user.id, !!req.body?.optOut);
    res.json({ message: req.body?.optOut ? '알림 이메일을 받지 않습니다.' : '알림 이메일을 받습니다.' });
  } catch (err) { next(err); }
};

module.exports = { getPreferences, updatePreferences, getEmailSettings, updateEmailSettings, testEmail, getWidgetSettings, updateWidgetSettings, getThemePrefs, updateThemePrefs, getDashboardLayout, updateDashboardLayout, getApprovalLinePresets, updateApprovalLinePresets, getSharedApprovalLinePresets, addSharedApprovalLinePreset, deleteSharedApprovalLinePreset, getApprovalAutoDelegate, updateApprovalAutoDelegate, getEmailOptOut, updateEmailOptOut };
