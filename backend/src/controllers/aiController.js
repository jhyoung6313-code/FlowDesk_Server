// ─────────────────────────────────────────────────────────────
// F-58 AI 어시스턴트 컨트롤러 — 업무 자동 생성 · 주간 요약
// 인증 필요(routes에서 authenticate). 모든 호출은 감사로그(AI_REQUEST) 적재.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');
const ai = require('../services/aiService');
const audit = require('../services/auditService');
const { AUDIT_ACTION } = require('../config/security');

const STATUS_LABEL = { pending: '대기', in_progress: '진행중', done: '완료', hold: '보류' };
const PRIORITY_LABEL = { high: '높음', normal: '보통', low: '낮음' };

function toDateStr(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

// AI 설정 여부 (프론트에서 버튼 노출 제어용)
exports.status = (req, res) => {
  res.json({ enabled: ai.isConfigured(), model: ai.MODEL });
};

// POST /api/ai/tasks/generate  { prompt }
exports.generateTasks = async (req, res, next) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI 기능이 설정되지 않았습니다. 관리자에게 문의하세요.' });
    const prompt = (req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: '요청 내용을 입력해주세요.' });
    if (prompt.length > 2000) return res.status(400).json({ error: '요청이 너무 깁니다(최대 2000자).' });

    const members = await prisma.user.findMany({
      where: { isActive: true },
      select: { displayName: true },
    });
    const memberNames = members.map((m) => m.displayName);
    const today = toDateStr(new Date());

    const drafts = await ai.generateTasks({ req, prompt, today, memberNames });

    // 담당자 힌트 → 실제 사용자 매칭(정확 일치만, 자동배정 아님·후보 제시용)
    const nameToId = new Map(
      (await prisma.user.findMany({ where: { isActive: true }, select: { id: true, displayName: true } }))
        .map((u) => [u.displayName, u.id])
    );
    const tasks = drafts.map((d) => ({
      title: String(d.title || '').slice(0, 200),
      description: String(d.description || ''),
      priority: ['high', 'normal', 'low'].includes(d.priority) ? d.priority : 'normal',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(d.dueDate) ? d.dueDate : null,
      assigneeIds: (Array.isArray(d.assigneeHints) ? d.assigneeHints : [])
        .map((n) => nameToId.get(n)).filter(Boolean),
      assigneeHints: Array.isArray(d.assigneeHints) ? d.assigneeHints : [],
    }));

    await audit.record({ action: AUDIT_ACTION.AI_REQUEST, req, resource: 'task_gen', detail: `업무초안 ${tasks.length}건` });
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/summary  { scope: 'me'|'all', from?, to? }
exports.weeklySummary = async (req, res, next) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI 기능이 설정되지 않았습니다. 관리자에게 문의하세요.' });
    const scope = req.body?.scope === 'all' ? 'all' : 'me';
    // 기본 기간: 최근 7일
    const to = req.body?.to ? new Date(req.body.to) : new Date();
    const from = req.body?.from ? new Date(req.body.from) : new Date(Date.now() - 7 * 24 * 3600 * 1000);

    // 관리자만 전체(all) 요약 허용
    if (scope === 'all' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '전체 요약은 관리자만 사용할 수 있습니다.' });
    }

    const where = { delYn: '0' };
    if (scope === 'me') {
      where.OR = [
        { createdBy: req.user.id },
        { assignees: { some: { userId: req.user.id } } },
      ];
    }
    // 기간 내 갱신되었거나 마감 예정인 업무
    where.AND = [{
      OR: [
        { updatedAt: { gte: from, lte: to } },
        { dueDate: { gte: from, lte: to } },
      ],
    }];

    const rows = await prisma.task.findMany({
      where,
      select: {
        title: true, status: true, priority: true, dueDate: true, updatedAt: true,
        assignees: { select: { user: { select: { displayName: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    if (!rows.length) {
      return res.json({ summary: '', empty: true });
    }

    const now = new Date();
    const stats = { 전체: rows.length, 완료: 0, 진행중: 0, 대기: 0, 보류: 0, 지연: 0 };
    const tasks = rows.map((t) => {
      stats[STATUS_LABEL[t.status]] = (stats[STATUS_LABEL[t.status]] || 0) + 1;
      const overdue = t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now;
      if (overdue) stats.지연 += 1;
      return {
        제목: t.title,
        상태: STATUS_LABEL[t.status],
        우선순위: PRIORITY_LABEL[t.priority],
        마감일: toDateStr(t.dueDate),
        담당자: t.assignees.map((a) => a.user.displayName),
        지연여부: overdue ? '지연' : '',
      };
    });

    const scopeLabel = scope === 'all' ? '팀 전체' : `${req.user.displayName}(본인)`;
    const periodLabel = `${toDateStr(from)} ~ ${toDateStr(to)}`;
    const summary = await ai.weeklySummary({ req, scopeLabel, periodLabel, stats, tasks });

    await audit.record({ action: AUDIT_ACTION.AI_REQUEST, req, resource: 'weekly_summary', detail: `${scopeLabel} ${periodLabel}` });
    res.json({ summary, stats, period: periodLabel });
  } catch (err) {
    next(err);
  }
};
