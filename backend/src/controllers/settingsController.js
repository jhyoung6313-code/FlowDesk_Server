const { testSmtpConnection } = require('../services/emailService');

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

module.exports = { getEmailSettings, updateEmailSettings, testEmail, getWidgetSettings, updateWidgetSettings };
