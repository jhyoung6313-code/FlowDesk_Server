// 범용 자동화 규칙 관리 (F-62). 관리자 전용 CRUD + 수동 테스트 실행 + 실행 로그 조회.
const prisma = require('../lib/prisma');
const automation = require('../services/automationService');

// 규칙 저장 시 event 유효성만 가볍게 검증 (액션/조건은 JSON 그대로 보관)
const VALID_EVENTS = new Set(automation.EVENT_CATALOG.map((e) => e.value));

function serializeIn(body) {
  return {
    name: (body.name || '').trim().slice(0, 200),
    description: body.description ? String(body.description).slice(0, 500) : null,
    isActive: body.isActive !== undefined ? !!body.isActive : true,
    event: body.event,
    conditions: JSON.stringify(Array.isArray(body.conditions) ? body.conditions : []),
    actions: JSON.stringify(Array.isArray(body.actions) ? body.actions : []),
  };
}

function serializeOut(rule) {
  return {
    ...rule,
    conditions: (() => { try { return JSON.parse(rule.conditions || '[]'); } catch { return []; } })(),
    actions: (() => { try { return JSON.parse(rule.actions || '[]'); } catch { return []; } })(),
  };
}

// 편집기용 카탈로그(이벤트/액션/연산자)
const catalog = (req, res) => {
  res.json({
    events: automation.EVENT_CATALOG,
    actions: automation.ACTION_CATALOG,
    ops: automation.CONDITION_OPS,
  });
};

const list = async (req, res, next) => {
  try {
    const rules = await prisma.automationRule.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rules.map(serializeOut));
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    const rule = await prisma.automationRule.findUnique({
      where: { id: Number(req.params.id) },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!rule) return res.status(404).json({ error: '규칙을 찾을 수 없습니다.' });
    res.json({ ...serializeOut(rule), logs: rule.logs });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const data = serializeIn(req.body);
    if (!data.name) return res.status(400).json({ error: '규칙 이름은 필수입니다.' });
    if (!VALID_EVENTS.has(data.event)) return res.status(400).json({ error: '유효하지 않은 이벤트입니다.' });
    const rule = await prisma.automationRule.create({ data: { ...data, createdBy: req.user.id } });
    res.status(201).json(serializeOut(rule));
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const data = serializeIn(req.body);
    if (!data.name) return res.status(400).json({ error: '규칙 이름은 필수입니다.' });
    if (!VALID_EVENTS.has(data.event)) return res.status(400).json({ error: '유효하지 않은 이벤트입니다.' });
    const rule = await prisma.automationRule.update({ where: { id: Number(req.params.id) }, data });
    res.json(serializeOut(rule));
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await prisma.automationRule.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: '규칙이 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// 수동 테스트 실행: 저장된 규칙을 임의 컨텍스트로 즉시 실행
const testRun = async (req, res, next) => {
  try {
    const rule = await prisma.automationRule.findUnique({ where: { id: Number(req.params.id) } });
    if (!rule) return res.status(404).json({ error: '규칙을 찾을 수 없습니다.' });
    const ctx = req.body?.context || {};
    await automation.emit(rule.event, { ...ctx, actorId: req.user.id, __test: true });
    res.json({ message: '테스트 실행 요청됨. 실행 로그를 확인하세요.' });
  } catch (err) { next(err); }
};

module.exports = { catalog, list, detail, create, update, remove, testRun };
