// Forms(설문/투표) 엔진 (F-66). M365 Forms 경량판.
// 설문 CRUD + 상태(개시/마감) + 응답 제출 + 결과 집계. 결과 열람은 작성자·관리자만.
const prisma = require('../lib/prisma');

const FIELD_TYPES = ['text', 'textarea', 'single', 'multiple', 'rating', 'number', 'date'];
const CHOICE_TYPES = ['single', 'multiple'];

const canManage = (form, user) => form.createdBy === user.id || user.role === 'admin';

function parseOptions(o) { try { return JSON.parse(o || '[]'); } catch { return []; } }

// 입력 문항 → DB create 형태
function fieldCreates(fields) {
  return (Array.isArray(fields) ? fields : []).map((f, i) => ({
    order: i,
    type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
    label: String(f.label || '').slice(0, 300),
    required: !!f.required,
    options: CHOICE_TYPES.includes(f.type) ? JSON.stringify(Array.isArray(f.options) ? f.options : []) : null,
  })).filter((f) => f.label);
}

const serializeField = (f) => ({ ...f, options: f.options ? parseOptions(f.options) : [] });

// GET /api/forms — 목록(개시된 설문 + 내가 만든 설문). 관리자는 전체.
const list = async (req, res, next) => {
  try {
    const where = { delYn: '0' };
    if (req.user.role !== 'admin') {
      where.OR = [{ status: 'open' }, { createdBy: req.user.id }];
    }
    const forms = await prisma.form.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { responses: true, fields: true } } },
    });
    res.json(forms);
  } catch (err) { next(err); }
};

// GET /api/forms/:id — 상세(문항 포함). 응답 작성용.
const detail = async (req, res, next) => {
  try {
    const form = await prisma.form.findUnique({
      where: { id: Number(req.params.id) },
      include: { fields: { orderBy: { order: 'asc' } }, _count: { select: { responses: true } } },
    });
    if (!form || form.delYn === '1') return res.status(404).json({ error: '설문을 찾을 수 없습니다.' });
    // 초안은 작성자·관리자만 열람
    if (form.status === 'draft' && !canManage(form, req.user)) return res.status(403).json({ error: '접근 권한이 없습니다.' });

    // 이미 응답했는지(비익명·단일응답) 여부
    let alreadyResponded = false;
    if (!form.anonymous && !form.multiResponse) {
      alreadyResponded = !!(await prisma.formResponse.findFirst({ where: { formId: form.id, respondentId: req.user.id } }));
    }
    res.json({ ...form, fields: form.fields.map(serializeField), alreadyResponded });
  } catch (err) { next(err); }
};

// POST /api/forms
const create = async (req, res, next) => {
  try {
    const { title, description, anonymous, multiResponse, fields } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '설문 제목은 필수입니다.' });
    const form = await prisma.form.create({
      data: {
        title: title.trim().slice(0, 200),
        description: description ? String(description).slice(0, 1000) : null,
        anonymous: !!anonymous,
        multiResponse: !!multiResponse,
        createdBy: req.user.id,
        fields: { create: fieldCreates(fields) },
      },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    res.status(201).json({ ...form, fields: form.fields.map(serializeField) });
  } catch (err) { next(err); }
};

// PUT /api/forms/:id — 메타 수정 + 문항 교체(작성자·관리자)
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const form = await prisma.form.findUnique({ where: { id } });
    if (!form || form.delYn === '1') return res.status(404).json({ error: '설문을 찾을 수 없습니다.' });
    if (!canManage(form, req.user)) return res.status(403).json({ error: '수정 권한이 없습니다.' });

    const { title, description, anonymous, multiResponse, fields } = req.body;
    const data = {};
    if (title !== undefined) data.title = title.trim().slice(0, 200);
    if (description !== undefined) data.description = description ? String(description).slice(0, 1000) : null;
    if (anonymous !== undefined) data.anonymous = !!anonymous;
    if (multiResponse !== undefined) data.multiResponse = !!multiResponse;

    // 문항 교체는 응답이 없을 때만 허용(집계 정합성 보호)
    if (fields !== undefined) {
      const respCount = await prisma.formResponse.count({ where: { formId: id } });
      if (respCount > 0) return res.status(409).json({ error: '이미 응답이 있어 문항을 변경할 수 없습니다.' });
      await prisma.formField.deleteMany({ where: { formId: id } });
      data.fields = { create: fieldCreates(fields) };
    }

    const updated = await prisma.form.update({
      where: { id }, data,
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    res.json({ ...updated, fields: updated.fields.map(serializeField) });
  } catch (err) { next(err); }
};

// PATCH /api/forms/:id/status  { status: open|closed|draft }
const setStatus = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!['draft', 'open', 'closed'].includes(status)) return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
    const form = await prisma.form.findUnique({ where: { id } });
    if (!form || form.delYn === '1') return res.status(404).json({ error: '설문을 찾을 수 없습니다.' });
    if (!canManage(form, req.user)) return res.status(403).json({ error: '권한이 없습니다.' });
    const updated = await prisma.form.update({ where: { id }, data: { status } });
    res.json({ id: updated.id, status: updated.status });
  } catch (err) { next(err); }
};

// DELETE /api/forms/:id (소프트 삭제)
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const form = await prisma.form.findUnique({ where: { id } });
    if (!form || form.delYn === '1') return res.status(404).json({ error: '설문을 찾을 수 없습니다.' });
    if (!canManage(form, req.user)) return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    await prisma.form.update({ where: { id }, data: { delYn: '1' } });
    res.json({ message: '설문이 삭제되었습니다.' });
  } catch (err) { next(err); }
};

// POST /api/forms/:id/responses  { answers: [{ fieldId, value }] }
const submit = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const form = await prisma.form.findUnique({
      where: { id },
      include: { fields: true },
    });
    if (!form || form.delYn === '1') return res.status(404).json({ error: '설문을 찾을 수 없습니다.' });
    if (form.status !== 'open') return res.status(409).json({ error: '현재 응답을 받지 않는 설문입니다.' });

    if (!form.anonymous && !form.multiResponse) {
      const dup = await prisma.formResponse.findFirst({ where: { formId: id, respondentId: req.user.id } });
      if (dup) return res.status(409).json({ error: '이미 응답한 설문입니다.' });
    }

    const answersIn = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const byField = new Map(answersIn.map((a) => [Number(a.fieldId), a.value]));

    // 필수 문항 검증
    for (const f of form.fields) {
      if (f.required) {
        const v = byField.get(f.id);
        const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
        if (empty) return res.status(400).json({ error: `필수 문항에 응답해주세요: ${f.label}` });
      }
    }

    const validFieldIds = new Set(form.fields.map((f) => f.id));
    const answerCreates = answersIn
      .filter((a) => validFieldIds.has(Number(a.fieldId)))
      .map((a) => ({
        fieldId: Number(a.fieldId),
        value: Array.isArray(a.value) ? JSON.stringify(a.value) : (a.value == null ? null : String(a.value)),
      }));

    await prisma.formResponse.create({
      data: {
        formId: id,
        respondentId: form.anonymous ? null : req.user.id,
        answers: { create: answerCreates },
      },
    });
    res.status(201).json({ message: '응답이 제출되었습니다.' });
  } catch (err) { next(err); }
};

// GET /api/forms/:id/results — 결과 집계(작성자·관리자만)
const results = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const form = await prisma.form.findUnique({
      where: { id },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!form || form.delYn === '1') return res.status(404).json({ error: '설문을 찾을 수 없습니다.' });
    if (!canManage(form, req.user)) return res.status(403).json({ error: '결과 열람 권한이 없습니다.' });

    const responses = await prisma.formResponse.findMany({
      where: { formId: id },
      include: { answers: true },
      orderBy: { createdAt: 'desc' },
    });

    // 문항별 집계
    const summary = form.fields.map((f) => {
      const answers = responses.flatMap((r) => r.answers.filter((a) => a.fieldId === f.id));
      if (CHOICE_TYPES.includes(f.type)) {
        const counts = {};
        for (const opt of parseOptions(f.options)) counts[opt] = 0;
        for (const a of answers) {
          let vals = [];
          try { vals = JSON.parse(a.value); if (!Array.isArray(vals)) vals = [a.value]; } catch { vals = a.value ? [a.value] : []; }
          for (const v of vals) counts[v] = (counts[v] || 0) + 1;
        }
        return { fieldId: f.id, label: f.label, type: f.type, counts };
      }
      if (f.type === 'rating' || f.type === 'number') {
        const nums = answers.map((a) => Number(a.value)).filter((n) => !isNaN(n));
        const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
        return { fieldId: f.id, label: f.label, type: f.type, count: nums.length, avg: Math.round(avg * 100) / 100 };
      }
      // 텍스트류: 응답 값 목록
      return { fieldId: f.id, label: f.label, type: f.type, values: answers.map((a) => a.value).filter(Boolean) };
    });

    res.json({ id: form.id, title: form.title, responseCount: responses.length, summary });
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, update, setStatus, remove, submit, results };
