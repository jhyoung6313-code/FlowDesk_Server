const nodemailer = require('nodemailer');

const prisma = require('../lib/prisma');

/**
 * AppSetting 테이블에서 SMTP 설정을 읽어 transporter를 생성합니다.
 * 설정이 없거나 이메일 기능이 비활성화된 경우 null을 반환합니다.
 */
async function createTransporter() {
  try {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'email_enabled'] } },
    });

    const cfg = {};
    for (const s of settings) cfg[s.key] = s.value;

    if (cfg.email_enabled !== 'true') return null;
    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) return null;

    return nodemailer.createTransport({
      host: cfg.smtp_host,
      port: Number(cfg.smtp_port) || 587,
      secure: Number(cfg.smtp_port) === 465,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });
  } catch {
    return null;
  }
}

/**
 * 마감 알림 이메일을 발송합니다.
 * @param {string} toEmail
 * @param {string} displayName
 * @param {{ title: string, dueDate: string, type: string }} task
 */
async function sendDeadlineEmail(toEmail, displayName, task) {
  const transporter = await createTransporter();
  if (!transporter) return;

  const settings = await prisma.appSetting.findMany({ where: { key: { in: ['smtp_from'] } } });
  const cfg = {};
  for (const s of settings) cfg[s.key] = s.value;

  const from = cfg.smtp_from || 'Flowdesk <noreply@flowdesk.local>';

  const typeLabel = {
    overdue: '마감 초과',
    due_today: '오늘 마감',
    due_soon: '마감 임박 (3일 이내)',
  }[task.type] || task.type;

  const dueDateStr = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('ko-KR')
    : '미설정';

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1677ff; margin-bottom: 4px;">Flowdesk 업무 알림</h2>
      <p style="color: #555; margin-top: 0;">안녕하세요, <strong>${displayName}</strong>님.</p>
      <div style="background: #f5f5f5; border-radius: 6px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0;"><strong>업무명:</strong> ${task.title}</p>
        <p style="margin: 0 0 8px 0;"><strong>마감일:</strong> ${dueDateStr}</p>
        <p style="margin: 0; color: ${task.type === 'overdue' ? '#f5222d' : '#fa8c16'};"><strong>상태:</strong> ${typeLabel}</p>
      </div>
      <p style="color: #888; font-size: 13px;">Flowdesk에 접속하여 업무를 확인해주세요.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `[Flowdesk] 업무 알림: ${typeLabel} - ${task.title}`,
    html,
    encoding: 'utf-8',
  });
}

/**
 * SMTP 연결 테스트
 */
async function testSmtpConnection(config) {
  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: Number(config.smtp_port) || 587,
    secure: Number(config.smtp_port) === 465,
    auth: { user: config.smtp_user, pass: config.smtp_pass },
  });
  await transporter.verify();
}

module.exports = { sendDeadlineEmail, testSmtpConnection };
