// 범용 자동화 규칙 엔진 (F-62) — M365 Power Automate 경량판.
// 전역 이벤트(업무/결재/게시판 등) → 조건 평가 → 액션 실행(알림/이메일/채팅/웹훅/업무생성).
//
// 설계 원칙:
//  - fire-and-forget: emit()은 절대 호출자에게 예외를 전파하지 않는다(기존 업무 흐름 무손상).
//  - additive: 기존 모델/서비스를 재사용만 한다. prisma.automationRule 이 없는(구 스키마/목) 환경에서도 안전.

const prisma = require('../lib/prisma');
const { pushNotification } = require('./sseService');
const emailService = require('./emailService');
const linkedRoomService = require('./linkedRoomService');

// ── 이벤트 · 액션 카탈로그 (프론트 자동화 편집기 드롭다운용) ──────────────────
const EVENT_CATALOG = [
  { value: 'task.created',        label: '업무 생성됨',        fields: ['title', 'status', 'priority', 'partId', 'dueDate', 'createdBy', 'assigneeIds'] },
  { value: 'task.status_changed', label: '업무 상태 변경됨',    fields: ['title', 'status', 'prevStatus', 'priority', 'partId', 'dueDate', 'assigneeIds'] },
  { value: 'approval.approved',   label: '결재 승인됨',        fields: ['title', 'docNo', 'templateCode', 'authorId'] },
  { value: 'approval.rejected',   label: '결재 반려됨',        fields: ['title', 'docNo', 'templateCode', 'authorId'] },
  { value: 'bbs.post_created',    label: '게시글 등록됨',      fields: ['title', 'categoryId', 'authorId'] },
  { value: 'okr.at_risk',         label: 'OKR 위험(at_risk)',  fields: ['title', 'objectiveId', 'ownerId'] },
  { value: 'meeting.finished',    label: '회의 종료됨',        fields: ['title', 'meetingId', 'organizerId'] },
];

const ACTION_CATALOG = [
  { value: 'notify',      label: '알림 발송',       config: ['userIds', 'toAssignees', 'toCreator', 'message'] },
  { value: 'email',       label: '이메일 발송',     config: ['toUsernames', 'subject', 'body'] },
  { value: 'chat',        label: '채팅 메시지',     config: ['roomId', 'message'] },
  { value: 'webhook',     label: '아웃바운드 웹훅', config: ['url', 'method', 'headers', 'bodyTemplate'] },
  { value: 'create_task', label: '업무 자동 생성',  config: ['title', 'description', 'priority', 'assigneeIds'] },
];

const CONDITION_OPS = ['eq', 'ne', 'in', 'nin', 'contains', 'gt', 'lt', 'changed_to', 'is_empty', 'not_empty'];

// ── 조건 평가 (순수 함수 — 테스트 대상) ───────────────────────────────────────
function getField(ctx, field) {
  if (!field) return undefined;
  // 점 표기 지원 (a.b) — 얕은 경로만
  return field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

function evalCondition(cond, ctx) {
  if (!cond) return true;
  // changed_to는 field가 아니라 status 전이로 평가하므로 field 유무와 무관하게 먼저 처리한다.
  if (cond.op === 'changed_to') {
    return String(ctx.status) === String(cond.value) && String(ctx.prevStatus) !== String(cond.value);
  }
  if (!cond.field) return true;
  const actual = getField(ctx, cond.field);
  const expected = cond.value;
  switch (cond.op) {
    case 'eq': return String(actual) === String(expected);
    case 'ne': return String(actual) !== String(expected);
    case 'in': return toArray(expected).map(String).includes(String(actual));
    case 'nin': return !toArray(expected).map(String).includes(String(actual));
    case 'contains':
      if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
      return String(actual ?? '').includes(String(expected ?? ''));
    case 'gt': return Number(actual) > Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'changed_to': return String(ctx.status) === String(expected) && String(ctx.prevStatus) !== String(expected);
    case 'is_empty': return actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0);
    case 'not_empty': return !(actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0));
    default: return true;
  }
}

// 모든 조건 AND 결합. 조건 없으면 항상 통과.
function evaluateConditions(conditions, ctx) {
  const list = Array.isArray(conditions) ? conditions : [];
  return list.every((c) => evalCondition(c, ctx));
}

// ── 템플릿 렌더링: "{{field}}" → ctx 값 ────────────────────────────────────────
function render(template, ctx) {
  if (template == null) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = getField(ctx, key);
    return v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  });
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function safeParse(json, fallback) {
  if (json == null) return fallback;
  if (typeof json === 'object') return json;
  try { return JSON.parse(json); } catch { return fallback; }
}

// ── 액션 실행기 ────────────────────────────────────────────────────────────────
async function resolveNotifyTargets(cfg, ctx) {
  const ids = new Set(toArray(cfg.userIds).map(Number).filter(Boolean));
  if (cfg.toAssignees && Array.isArray(ctx.assigneeIds)) ctx.assigneeIds.forEach((id) => ids.add(Number(id)));
  if (cfg.toCreator && ctx.createdBy) ids.add(Number(ctx.createdBy));
  return [...ids].filter((n) => Number.isInteger(n) && n > 0);
}

async function runAction(action, ctx, rule) {
  const cfg = safeParse(action.config, {}) || {};
  switch (action.type) {
    case 'notify': {
      const targets = await resolveNotifyTargets(cfg, ctx);
      const message = render(cfg.message || rule.name, ctx).slice(0, 500);
      for (const userId of targets) {
        const notif = await prisma.notification.create({
          data: { userId, type: 'automation', message, link: ctx.link || null, actorId: ctx.actorId || null },
        });
        try { pushNotification(userId, notif); } catch { /* 소켓 미연결 무시 */ }
      }
      return `notify → ${targets.length}명`;
    }
    case 'email': {
      const usernames = toArray(cfg.toUsernames);
      const subject = render(cfg.subject || '[Flowdesk] 자동 알림', ctx);
      const html = render(cfg.body || '', ctx);
      let sent = 0;
      for (const u of usernames) {
        const ok = await emailService.sendGenericEmail(u, subject, html);
        if (ok) sent += 1;
      }
      return `email → ${sent}/${usernames.length}건`;
    }
    case 'chat': {
      const roomId = Number(cfg.roomId);
      if (!roomId) return 'chat → roomId 없음(스킵)';
      await linkedRoomService.postMessage({ roomId, content: render(cfg.message, ctx), senderId: rule.createdBy });
      return `chat → room ${roomId}`;
    }
    case 'webhook': {
      const url = cfg.url;
      if (!url) return 'webhook → url 없음(스킵)';
      const method = (cfg.method || 'POST').toUpperCase();
      const headers = { 'Content-Type': 'application/json', ...(safeParse(cfg.headers, {}) || {}) };
      const body = cfg.bodyTemplate ? render(cfg.bodyTemplate, ctx) : JSON.stringify({ event: ctx.__event, context: ctx });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, { method, headers, body: method === 'GET' ? undefined : body, signal: controller.signal });
        return `webhook → ${method} ${url} (${resp.status})`;
      } finally { clearTimeout(timer); }
    }
    case 'create_task': {
      const task = await prisma.task.create({
        data: {
          title: render(cfg.title || '자동 생성 업무', ctx).slice(0, 200),
          description: render(cfg.description || '', ctx) || null,
          priority: cfg.priority || 'normal',
          status: 'pending',
          createdBy: rule.createdBy,
          assignees: toArray(cfg.assigneeIds).length
            ? { create: toArray(cfg.assigneeIds).map((uid) => ({ userId: Number(uid) })) }
            : undefined,
        },
      });
      return `create_task → #${task.id}`;
    }
    default:
      return `알 수 없는 액션: ${action.type}`;
  }
}

// ── 로그 적재 (실패해도 무시) ──────────────────────────────────────────────────
async function logRun(ruleId, event, status, detail) {
  try {
    if (!prisma.automationLog) return;
    await prisma.automationLog.create({ data: { ruleId, event, status, detail: (detail || '').slice(0, 2000) } });
  } catch { /* noop */ }
}

// ── 메인 진입점: 이벤트 발생 시 호출 (fire-and-forget) ─────────────────────────
// 어떤 경우에도 예외를 던지지 않는다.
async function emit(event, context = {}) {
  try {
    if (!prisma.automationRule) return; // 구 스키마/목 환경 안전장치
    const ctx = { ...context, __event: event };
    const rules = await prisma.automationRule.findMany({ where: { event, isActive: true } });
    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
      const conditions = safeParse(rule.conditions, []);
      if (!evaluateConditions(conditions, ctx)) {
        await logRun(rule.id, event, 'skipped', '조건 불충족');
        continue;
      }
      const actions = safeParse(rule.actions, []);
      const results = [];
      let hadError = false;
      for (const action of actions) {
        try {
          results.push(await runAction(action, ctx, rule));
        } catch (err) {
          hadError = true;
          results.push(`[오류:${action.type}] ${err.message}`);
        }
      }
      try {
        await prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            runCount: { increment: 1 },
            lastRunAt: new Date(),
            lastError: hadError ? results.filter((r) => r.startsWith('[오류')).join('; ').slice(0, 500) : null,
          },
        });
      } catch { /* noop */ }
      await logRun(rule.id, event, hadError ? 'failed' : 'success', results.join(' | '));
    }
  } catch (err) {
    console.error('[automation] emit 실패:', err.message);
  }
}

// 안전한 fire-and-forget 래퍼 (호출부는 await 없이 사용)
function fire(event, context) {
  Promise.resolve().then(() => emit(event, context)).catch(() => {});
}

module.exports = {
  emit,
  fire,
  evaluateConditions,
  evalCondition,
  render,
  EVENT_CATALOG,
  ACTION_CATALOG,
  CONDITION_OPS,
};
