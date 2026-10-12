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
 * 범용 이메일 발송 (자동화 규칙 엔진 등에서 사용).
 * SMTP 미설정 시 조용히 스킵하고 false 반환.
 * @param {string} toEmail
 * @param {string} subject
 * @param {string} html
 * @returns {Promise<boolean>} 발송 여부
 */
async function sendGenericEmail(toEmail, subject, html) {
  const transporter = await createTransporter();
  if (!transporter || !toEmail) return false;

  const settings = await prisma.appSetting.findMany({ where: { key: { in: ['smtp_from'] } } });
  const cfg = {};
  for (const s of settings) cfg[s.key] = s.value;
  const from = cfg.smtp_from || 'Flowdesk <noreply@flowdesk.local>';

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: subject || '[Flowdesk] 알림',
    html: html || '',
    encoding: 'utf-8',
  });
  return true;
}

/**
 * 결재 관련 알림(요청/리마인더/멘션/다이제스트)이 공유하는 이메일 템플릿.
 * approvalController.js와 notificationService.js가 각자 동일한 HTML 문자열을 들고 있던 것을
 * 한 곳으로 모았다 — 문구/스타일을 바꿀 때 한쪽만 고치고 다른 쪽을 놓치는 걸 방지한다.
 * @param {string} toEmail
 * @param {string} subject    "[FlowDesk] ..." 형태로 호출부에서 접두사까지 만들어 전달
 * @param {string} displayName
 * @param {string} message
 * @returns {Promise<boolean>} 발송 여부
 */
async function sendApprovalStyledEmail(toEmail, subject, displayName, message) {
  return sendGenericEmail(
    toEmail,
    subject,
    `<p>안녕하세요, <strong>${displayName}</strong>님.</p><p>${message}</p><p style="color:#888;font-size:13px;">FlowDesk에 접속해 결재 문서를 확인해주세요.</p>`,
  );
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

module.exports = { sendDeadlineEmail, testSmtpConnection, sendGenericEmail, sendApprovalStyledEmail };
