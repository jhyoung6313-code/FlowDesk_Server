// ─────────────────────────────────────────────────────────────
// F-60 OKR/목표 관리 — 주기 · 목표 · 핵심결과(KR) · 체크인 · 업무 연결
// 인증 필요(routes에서 authenticate).
// 진척: KR = (current-start)/(target-start) 0~100 클램프, Objective = KR 평균.
// autoProgress KR은 연결된 업무 완료율로 currentValue 자동 갱신.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');

const USER_SEL = { id: true, displayName: true, avatarColor: true };
function isAdmin(req) { return req.user.role === 'admin'; }

// KR 하나의 진척률(0~100)
function krProgress(kr) {
  const start = Number(kr.startValue);
  const target = Number(kr.targetValue);
  const cur = Number(kr.currentValue);
  if (kr.metricType === 'boolean') return cur >= target ? 100 : 0;
  if (target === start) return cur >= target ? 100 : 0;
  const pct = ((cur - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// autoProgress KR: 연결 업무 완료율 → currentValue 갱신
async function refreshAutoProgress(krId) {
  const kr = await prisma.keyResult.findUnique({ where: { id: krId }, include: { links: true } });
  if (!kr || !kr.autoProgress) return;
  const taskIds = kr.links.filter((l) => l.refType === 'task').map((l) => l.refId);
  if (!taskIds.length) return;
  const tasks = await prisma.task.findMany({ where: { id: { in: taskIds }, delYn: '0' }, select: { status: true } });
  if (!tasks.length) return;
  const done = tasks.filter((t) => t.status === 'done').length;
  const ratio = done / tasks.length;
  // 진척률(%)을 start~target 사이 값으로 환산
  const start = Number(kr.startValue), target = Number(kr.targetValue);
  const value = start + (target - start) * ratio;
  await prisma.keyResult.update({ where: { id: krId }, data: { currentValue: value } });
}

// Objective 진척률 재계산(= 소속 KR 평균) 후 저장
async function recomputeObjective(objId) {
  const krs = await prisma.keyResult.findMany({ where: { objectiveId: objId } });
  const progress = krs.length ? Math.round(krs.reduce((s, k) => s + krProgress(k), 0) / krs.length) : 0;
  await prisma.objective.update({ where: { id: objId }, data: { progress } });
  return progress;
}

// ── 주기(Cycle) ───────────────────────────────────────────────
exports.listCycles = async (req, res, next) => {
  try {
    const cycles = await prisma.okrCycle.findMany({ orderBy: { startDate: 'desc' } });
    res.json(cycles);
  } catch (err) { next(err); }
};

exports.createCycle = async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: '주기 생성은 관리자만 가능합니다.' });
    const { name, startDate, endDate } = req.body || {};
    if (!name || !startDate || !endDate) return res.status(400).json({ error: '이름·시작일·종료일을 입력하세요.' });
    const cycle = await prisma.okrCycle.create({
      data: { name: name.trim().slice(0, 50), startDate: new Date(startDate), endDate: new Date(endDate) },
    });
    res.status(201).json(cycle);
  } catch (err) { next(err); }
};

exports.deleteCycle = async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: '주기 삭제는 관리자만 가능합니다.' });
    await prisma.okrCycle.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 목표 트리 (주기별) ────────────────────────────────────────
exports.tree = async (req, res, next) => {
  try {
    const cycleId = Number(req.query.cycleId);
    if (!cycleId) return res.status(400).json({ error: 'cycleId가 필요합니다.' });
    const objectives = await prisma.objective.findMany({
      where: { cycleId, delYn: '0' },
      orderBy: { id: 'asc' },
      include: {
        owner: { select: USER_SEL },
        keyResults: {
          orderBy: { id: 'asc' },
          include: { owner: { select: USER_SEL }, _count: { select: { links: true } } },
        },
      },
    });
    // KR별 진척 계산치 부가
    const withProgress = objectives.map((o) => ({
      ...o,
      keyResults: o.keyResults.map((k) => ({ ...k, progress: krProgress(k) })),
    }));
    res.json(withProgress);
  } catch (err) { next(err); }
};

// ── 목표(Objective) ───────────────────────────────────────────
function canEditObjective(obj, req) { return isAdmin(req) || obj.ownerId === req.user.id; }

exports.createObjective = async (req, res, next) => {
  try {
    const { cycleId, parentId, title, description, scope, scopeRefId, ownerId } = req.body || {};
    if (!cycleId || !title || !title.trim()) return res.status(400).json({ error: '주기와 목표 제목이 필요합니다.' });
    const obj = await prisma.objective.create({
      data: {
        cycleId: Number(cycleId),
        parentId: parentId ? Number(parentId) : null,
        title: title.trim().slice(0, 300),
        description: description || null,
        scope: ['company', 'dept', 'team', 'personal'].includes(scope) ? scope : 'team',
        scopeRefId: scopeRefId ? Number(scopeRefId) : null,
        ownerId: ownerId ? Number(ownerId) : req.user.id,
      },
      include: { owner: { select: USER_SEL }, keyResults: true },
    });
    res.status(201).json(obj);
  } catch (err) { next(err); }
};

exports.updateObjective = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const obj = await prisma.objective.findFirst({ where: { id, delYn: '0' } });
    if (!obj) return res.status(404).json({ error: '목표를 찾을 수 없습니다.' });
    if (!canEditObjective(obj, req)) return res.status(403).json({ error: '수정 권한이 없습니다.' });
    const { title, description, scope, scopeRefId, ownerId, status, parentId } = req.body || {};
    const updated = await prisma.objective.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title).slice(0, 300) } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(scopeRefId !== undefined ? { scopeRefId: scopeRefId ? Number(scopeRefId) : null } : {}),
        ...(ownerId !== undefined ? { ownerId: Number(ownerId) } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(parentId !== undefined ? { parentId: parentId ? Number(parentId) : null } : {}),
      },
      include: { owner: { select: USER_SEL } },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

exports.deleteObjective = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const obj = await prisma.objective.findFirst({ where: { id, delYn: '0' } });
    if (!obj) return res.status(404).json({ error: '목표를 찾을 수 없습니다.' });
    if (!canEditObjective(obj, req)) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    await prisma.objective.update({ where: { id }, data: { delYn: '1' } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 핵심결과(KeyResult) ───────────────────────────────────────
async function loadObjectiveForKr(krId) {
  const kr = await prisma.keyResult.findUnique({ where: { id: krId }, include: { objective: true } });
  return kr;
}

exports.createKeyResult = async (req, res, next) => {
  try {
    const objectiveId = Number(req.params.objId);
    const obj = await prisma.objective.findFirst({ where: { id: objectiveId, delYn: '0' } });
    if (!obj) return res.status(404).json({ error: '목표를 찾을 수 없습니다.' });
    if (!canEditObjective(obj, req)) return res.status(403).json({ error: '권한이 없습니다.' });
    const { title, metricType, startValue, targetValue, currentValue, autoProgress, ownerId } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'KR 제목을 입력하세요.' });
    const kr = await prisma.keyResult.create({
      data: {
        objectiveId,
        title: title.trim().slice(0, 300),
        metricType: ['number', 'percent', 'boolean'].includes(metricType) ? metricType : 'percent',
        startValue: startValue !== undefined ? Number(startValue) : 0,
        targetValue: targetValue !== undefined ? Number(targetValue) : 100,
        currentValue: currentValue !== undefined ? Number(currentValue) : 0,
        autoProgress: !!autoProgress,
        ownerId: ownerId ? Number(ownerId) : null,
      },
      include: { owner: { select: USER_SEL } },
    });
    await recomputeObjective(objectiveId);
    res.status(201).json({ ...kr, progress: krProgress(kr) });
  } catch (err) { next(err); }
};

exports.updateKeyResult = async (req, res, next) => {
  try {
    const krId = Number(req.params.krId);
    const kr = await loadObjectiveForKr(krId);
    if (!kr) return res.status(404).json({ error: 'KR을 찾을 수 없습니다.' });
    if (!canEditObjective(kr.objective, req)) return res.status(403).json({ error: '권한이 없습니다.' });
    const { title, metricType, startValue, targetValue, currentValue, autoProgress, ownerId } = req.body || {};
    const updated = await prisma.keyResult.update({
      where: { id: krId },
      data: {
        ...(title !== undefined ? { title: String(title).slice(0, 300) } : {}),
        ...(metricType !== undefined ? { metricType } : {}),
        ...(startValue !== undefined ? { startValue: Number(startValue) } : {}),
        ...(targetValue !== undefined ? { targetValue: Number(targetValue) } : {}),
        ...(currentValue !== undefined ? { currentValue: Number(currentValue) } : {}),
        ...(autoProgress !== undefined ? { autoProgress: !!autoProgress } : {}),
        ...(ownerId !== undefined ? { ownerId: ownerId ? Number(ownerId) : null } : {}),
      },
      include: { owner: { select: USER_SEL } },
    });
    const progress = await recomputeObjective(kr.objectiveId);
    res.json({ ...updated, progress: krProgress(updated), objectiveProgress: progress });
  } catch (err) { next(err); }
};

exports.deleteKeyResult = async (req, res, next) => {
  try {
    const krId = Number(req.params.krId);
    const kr = await loadObjectiveForKr(krId);
    if (!kr) return res.status(404).json({ error: 'KR을 찾을 수 없습니다.' });
    if (!canEditObjective(kr.objective, req)) return res.status(403).json({ error: '권한이 없습니다.' });
    await prisma.keyResult.delete({ where: { id: krId } });
    await recomputeObjective(kr.objectiveId);
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 체크인 ────────────────────────────────────────────────────
exports.listCheckins = async (req, res, next) => {
  try {
    const krId = Number(req.params.krId);
    const checkins = await prisma.keyResultCheckin.findMany({
      where: { keyResultId: krId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: USER_SEL } },
      take: 50,
    });
    res.json(checkins);
  } catch (err) { next(err); }
};

exports.createCheckin = async (req, res, next) => {
  try {
    const krId = Number(req.params.krId);
    const kr = await loadObjectiveForKr(krId);
    if (!kr) return res.status(404).json({ error: 'KR을 찾을 수 없습니다.' });
    const { value, confidence, comment } = req.body || {};
    if (value === undefined || value === null || value === '') return res.status(400).json({ error: '현재값을 입력하세요.' });
    const checkin = await prisma.keyResultCheckin.create({
      data: {
        keyResultId: krId,
        value: Number(value),
        confidence: confidence ? Number(confidence) : null,
        comment: comment ? String(comment).slice(0, 500) : null,
        createdBy: req.user.id,
      },
      include: { author: { select: USER_SEL } },
    });
    // 체크인 값으로 KR 현재값 갱신 + Objective 재계산
    await prisma.keyResult.update({ where: { id: krId }, data: { currentValue: Number(value) } });
    await recomputeObjective(kr.objectiveId);
    res.status(201).json(checkin);
  } catch (err) { next(err); }
};

// ── KR ↔ 업무 연결 ────────────────────────────────────────────
exports.addLink = async (req, res, next) => {
  try {
    const krId = Number(req.params.krId);
    const kr = await loadObjectiveForKr(krId);
    if (!kr) return res.status(404).json({ error: 'KR을 찾을 수 없습니다.' });
    if (!canEditObjective(kr.objective, req)) return res.status(403).json({ error: '권한이 없습니다.' });
    const { refType, refId } = req.body || {};
    if (refType !== 'task') return res.status(400).json({ error: '현재는 업무(task) 연결만 지원합니다.' });
    await prisma.keyResultLink.create({ data: { keyResultId: krId, refType: 'task', refId: Number(refId) } });
    await refreshAutoProgress(krId);
    await recomputeObjective(kr.objectiveId);
    res.status(201).json({ message: '연결되었습니다.' });
  } catch (err) { next(err); }
};

exports.removeLink = async (req, res, next) => {
  try {
    const krId = Number(req.params.krId);
    const kr = await loadObjectiveForKr(krId);
    if (!kr) return res.status(404).json({ error: 'KR을 찾을 수 없습니다.' });
    if (!canEditObjective(kr.objective, req)) return res.status(403).json({ error: '권한이 없습니다.' });
    await prisma.keyResultLink.deleteMany({ where: { id: Number(req.params.linkId), keyResultId: krId } });
    res.json({ message: '연결 해제되었습니다.' });
  } catch (err) { next(err); }
};
