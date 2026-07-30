// ─────────────────────────────────────────────────────────────
// F-58 AI 어시스턴트 컨트롤러 — 업무 자동 생성 · 주간 요약
// 인증 필요(routes에서 authenticate). 모든 호출은 감사로그(AI_REQUEST) 적재.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');
const ai = require('../services/aiService');
const rag = require('../services/ragService');
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

// POST /api/ai/ask  { question } — RAG 질의응답(F-63)
exports.ask = async (req, res, next) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI 기능이 설정되지 않았습니다. 관리자에게 문의하세요.' });
    const question = (req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: '질문을 입력해주세요.' });
    if (question.length > 1000) return res.status(400).json({ error: '질문이 너무 깁니다(최대 1000자).' });

    const contexts = await rag.gatherContexts({ userId: req.user.id, question });
    if (contexts.length === 0) {
      return res.json({ answer: '관련 정보를 찾지 못했습니다. 다른 키워드로 질문해 보세요.', sources: [] });
    }
    const answer = await ai.answerFromContext({ req, question, contexts });
    // 인용용 출처 목록(제목·경로)
    const sources = contexts.map((c, i) => ({ n: i + 1, source: c.source, title: c.title, path: c.path }));

    await audit.record({ action: AUDIT_ACTION.AI_REQUEST, req, resource: 'rag_answer', detail: `질의 (${contexts.length}건 근거)` });
    res.json({ answer, sources });
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/chat-summary  { roomId } — 채팅방/스레드 요약(F-63)
exports.chatSummary = async (req, res, next) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI 기능이 설정되지 않았습니다. 관리자에게 문의하세요.' });
    const roomId = Number(req.body?.roomId);
    if (!roomId) return res.status(400).json({ error: '채팅방을 지정해주세요.' });

    // 본인이 속한 방만 요약 허용
    const membership = await prisma.chatRoomMember.findFirst({ where: { roomId, userId: req.user.id } });
    if (!membership) return res.status(403).json({ error: '해당 채팅방에 접근 권한이 없습니다.' });

    const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { name: true } });
    const rows = await prisma.chatMessage.findMany({
      where: { roomId, isDeleted: false },
      select: { content: true, sender: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (rows.length === 0) return res.json({ summary: '', empty: true });

    const messages = rows.reverse().map((m) => ({ sender: m.sender?.displayName || '알수없음', content: m.content }));
    const summary = await ai.summarizeChat({ req, roomName: room?.name || '채팅', messages });

    await audit.record({ action: AUDIT_ACTION.AI_REQUEST, req, resource: 'chat_summary', detail: `room ${roomId} (${messages.length}건)` });
    res.json({ summary });
  } catch (err) {
    next(err);
  }
};
