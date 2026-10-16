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
const { isEmailOptedOut } = require('./emailPreference');

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
    // changed_to는 이 switch 이전의 조기 return(41-46행)에서 이미 처리되어 여기 도달하지 않는다.
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
  // "작성자에게(toCreator)" 액션은 이벤트마다 소유자 필드 이름이 다르다(task는 createdBy, 결재/게시판은
  // authorId, OKR은 ownerId, 회의는 organizerId — EVENT_CATALOG의 fields 참조). 하나만 보면 새로 배선한
  // 이벤트에서 이 액션이 대상자 0명으로 조용히 무동작한다.
  if (cfg.toCreator) {
    const ownerId = ctx.createdBy ?? ctx.authorId ?? ctx.ownerId ?? ctx.organizerId;
    if (ownerId) ids.add(Number(ownerId));
  }
  return [...ids].filter((n) => Number.isInteger(n) && n > 0);
}

async function runAction(action, ctx, rule) {
  const cfg = safeParse(action.config, {}) || {};
  switch (action.type) {
    case 'notify': {
      const targets = await resolveNotifyTargets(cfg, ctx);
      const message = render(cfg.message || rule.name, ctx).slice(0, 500);
      // 대상자별로 순차 create+push하면 수신자 수만큼 DB 왕복이 직렬화된다 — 서로 독립적이므로 병렬 처리.
      await Promise.all(targets.map(async (userId) => {
        const notif = await prisma.notification.create({
          data: { userId, type: 'automation', message, link: ctx.link || null, actorId: ctx.actorId || null },
        });
        try { pushNotification(userId, notif); } catch { /* 소켓 미연결 무시 */ }
      }));
      return `notify → ${targets.length}명`;
    }
    case 'email': {
      const usernames = toArray(cfg.toUsernames);
      const subject = render(cfg.subject || '[Flowdesk] 자동 알림', ctx);
      const html = render(cfg.body || '', ctx);
      // approvalController/notificationService의 결재 이메일은 이미 "알림 이메일 받지 않기"
      // 설정(isEmailOptedOut)을 존중하는데, 자동화 규칙의 이메일 액션만 이 설정을 무시하고
      // 무조건 발송하고 있었다 — 사용자 수신거부 설정에 구멍이 생기는 지점.
      const recipients = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true, username: true } });
      const optOutFlags = await Promise.all(recipients.map((u) => isEmailOptedOut(u.id)));
      const optedOutUsernames = new Set(recipients.filter((_, i) => optOutFlags[i]).map((u) => u.username));
      const targets = usernames.filter((u) => !optedOutUsernames.has(u));
      const oks = await Promise.all(targets.map((u) => emailService.sendGenericEmail(u, subject, html)));
      const sent = oks.filter(Boolean).length;
      return `email → ${sent}/${usernames.length}건${optedOutUsernames.size ? ` (수신거부 ${optedOutUsernames.size}건 제외)` : ''}`;
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

// 규칙 하나를 평가·실행. 절대 예외를 던지지 않는다(emit()이 Promise.all로 여러 규칙을
// 병렬 처리하므로, 한 규칙의 실패가 다른 규칙 처리를 막아서는 안 된다).
async function runRule(rule, event, ctx) {
  const conditions = safeParse(rule.conditions, []);
  if (!evaluateConditions(conditions, ctx)) {
    await logRun(rule.id, event, 'skipped', '조건 불충족');
    return;
  }
  const actions = safeParse(rule.actions, []);
  // 액션끼리는 서로의 출력을 참조하지 않으므로(ctx는 액션 실행 중 갱신되지 않음) 병렬 실행 가능.
  // 다만 하나의 규칙 안에서라도 webhook의 8초 타임아웃이 다른 액션까지 지연시키던 문제가 있었음.
  const settled = await Promise.allSettled(actions.map((action) => runAction(action, ctx, rule)));
  const results = settled.map((r, i) => (r.status === 'fulfilled' ? r.value : `[오류:${actions[i].type}] ${r.reason?.message || r.reason}`));
  const hadError = settled.some((r) => r.status === 'rejected');
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

// ── 메인 진입점: 이벤트 발생 시 호출 (fire-and-forget) ─────────────────────────
// 어떤 경우에도 예외를 던지지 않는다.
// onlyRuleId를 넘기면(관리자 "테스트 실행") 같은 이벤트의 다른 활성 규칙은 절대 건드리지 않고
// 지정된 규칙 하나만 평가·실행한다 — 그렇지 않으면 테스트가 다른 규칙의 실제 이메일/웹훅/업무생성까지
// 의도치 않게 트리거하게 된다.
async function emit(event, context = {}, { onlyRuleId } = {}) {
  try {
    if (!prisma.automationRule) return; // 구 스키마/목 환경 안전장치
    const ctx = { ...context, __event: event };
    const where = { event, isActive: true, delYn: '0', ...(onlyRuleId ? { id: onlyRuleId } : {}) };
    const rules = await prisma.automationRule.findMany({ where });
    if (!rules || rules.length === 0) return;

    // 규칙끼리도 서로 독립적 — 순차 실행 시 한 규칙의 느린 웹훅이 뒤 규칙 전체를 지연시켰다.
    await Promise.all(rules.map((rule) => runRule(rule, event, ctx)));
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
