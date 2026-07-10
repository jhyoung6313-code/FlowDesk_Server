// ─────────────────────────────────────────────────────────────
// F-58 AI 어시스턴트 — Anthropic Claude API 래퍼
// - API 키는 backend/.env(ANTHROPIC_API_KEY)에만 보관, 클라이언트 미노출(백엔드 프록시 전용)
// - 개인정보(PII)는 전역 piiGuard 미들웨어가 요청 본문을 사전 차단(F-56)
// - 호출 지표는 AiUsageLog에 append-only 적재(프롬프트 원문 저장 안 함)
// ─────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../lib/prisma');

// 모델: 생성/요약 모두 최신 Opus. 필요 시 .env로 조정.
const MODEL = process.env.AI_MODEL || 'claude-opus-4-8';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('AI 기능이 설정되지 않았습니다. 관리자에게 ANTHROPIC_API_KEY 설정을 요청하세요.');
    err.status = 503;
    throw err;
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// 사용량 적재(실패해도 본 흐름을 막지 않음)
async function logUsage({ req, feature, usage, success = true }) {
  try {
    await prisma.aiUsageLog.create({
      data: {
        userId: req?.user?.id ?? null,
        username: req?.user?.username ?? null,
        feature,
        model: MODEL,
        tokensIn: usage?.input_tokens ?? 0,
        tokensOut: usage?.output_tokens ?? 0,
        success,
      },
    });
  } catch (err) {
    console.error('[ai] 사용량 기록 실패:', err.message);
  }
}

// 응답에서 첫 text 블록 추출
function firstText(message) {
  const block = (message.content || []).find((b) => b.type === 'text');
  return block ? block.text : '';
}

// ── 1) 업무 자동 생성 ────────────────────────────────────────
// 자연어 요청 → 업무 초안 배열(제목·설명·우선순위·기한·담당자 후보 이름)
const TASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'normal', 'low'] },
          dueDate: { type: 'string', description: 'YYYY-MM-DD 또는 빈 문자열' },
          assigneeHints: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'priority', 'dueDate', 'assigneeHints'],
      },
    },
  },
  required: ['tasks'],
};

async function generateTasks({ req, prompt, today, memberNames = [] }) {
  const c = getClient();
  const system = [
    '당신은 팀 업무관리 시스템의 AI 어시스턴트입니다.',
    '사용자의 자연어 요청을 실행 가능한 업무 항목으로 분해하세요.',
    `오늘 날짜는 ${today} 입니다. 상대적 기한(예: "다음주 금요일")은 이 날짜 기준 YYYY-MM-DD로 변환하세요. 기한이 불명확하면 빈 문자열.`,
    memberNames.length
      ? `팀원 목록: ${memberNames.join(', ')}. assigneeHints에는 이 목록에 있는 이름만, 요청에서 명확히 지목된 경우에만 넣으세요(추측 금지).`
      : 'assigneeHints는 요청에 이름이 명시된 경우에만 넣으세요.',
    '각 업무의 title은 간결하게, description은 실행 맥락을 담아 작성하세요. 한국어로 응답합니다.',
  ].join('\n');

  const message = await c.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: TASK_SCHEMA } },
    system,
    messages: [{ role: 'user', content: prompt }],
  });

  await logUsage({ req, feature: 'task_gen', usage: message.usage });

  let parsed;
  try {
    parsed = JSON.parse(firstText(message));
  } catch {
    const err = new Error('AI 응답을 해석하지 못했습니다. 다시 시도해주세요.');
    err.status = 502;
    throw err;
  }
  return Array.isArray(parsed.tasks) ? parsed.tasks : [];
}

// ── 2) 주간 요약 ─────────────────────────────────────────────
// 집계된 업무/활동 데이터 → 마크다운 요약 리포트
async function weeklySummary({ req, scopeLabel, periodLabel, stats, tasks }) {
  const c = getClient();
  const system = [
    '당신은 팀 업무관리 시스템의 AI 어시스턴트입니다.',
    '제공된 업무 데이터를 바탕으로 간결한 주간 업무 요약 리포트를 마크다운으로 작성하세요.',
    '구성: ① 핵심 요약(2~3문장) ② 완료한 일 ③ 진행 중 ④ 지연/주의 필요 ⑤ 다음 주 제언.',
    '데이터에 없는 내용을 지어내지 마세요. 한국어로 응답합니다.',
  ].join('\n');

  const payload = {
    대상: scopeLabel,
    기간: periodLabel,
    통계: stats,
    업무목록: tasks,
  };

  const message = await c.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: '다음 데이터를 요약해줘:\n\n' + JSON.stringify(payload, null, 2) }],
  });

  await logUsage({ req, feature: 'weekly_summary', usage: message.usage });
  return firstText(message);
}

module.exports = { isConfigured, generateTasks, weeklySummary, MODEL };
