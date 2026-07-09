const prisma = require('../lib/prisma');
const { resolvePresetLine } = require('../services/approvalLine');

// GET /api/approval-templates  (query: formTypeId)
const list = async (req, res, next) => {
  try {
    const { formTypeId } = req.query;
    const templates = await prisma.approvalTemplate.findMany({
      where: {
        isActive: true,
        ...(formTypeId && { formTypeId: Number(formTypeId) }),
      },
      include: {
        formType: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(templates);
  } catch (err) {
    next(err);
  }
};

// GET /api/approval-templates/:id
const get = async (req, res, next) => {
  try {
    const template = await prisma.approvalTemplate.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        formType: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
      },
    });
    if (!template) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });
    res.json(template);
  } catch (err) {
    next(err);
  }
};

// POST /api/approval-templates  (admin only)
const create = async (req, res, next) => {
  try {
    const { formTypeId, name, description, fieldsJson, lineJson, code } = req.body;
    if (!formTypeId || !name || !fieldsJson) {
      return res.status(400).json({ error: '양식 종류, 이름, 폼 필드는 필수입니다.' });
    }
    // 문서번호 채번용 양식코드 — 영대문자·숫자 2~10자
    const docCode = (code || 'DOC').toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(docCode)) {
      return res.status(400).json({ error: '양식코드는 영대문자·숫자 2~10자로 입력하세요.' });
    }

    // JSON 유효성 검사
    try { JSON.parse(fieldsJson); } catch {
      return res.status(400).json({ error: 'fieldsJson이 올바른 JSON 형식이 아닙니다.' });
    }
    if (lineJson) {
      try { JSON.parse(lineJson); } catch {
        return res.status(400).json({ error: 'lineJson이 올바른 JSON 형식이 아닙니다.' });
      }
    }

    const template = await prisma.approvalTemplate.create({
      data: {
        formTypeId: Number(formTypeId),
        name,
        description: description ?? null,
        fieldsJson,
        lineJson: lineJson ?? null,
        code: docCode,
        createdBy: req.user.id,
      },
      include: { formType: { select: { id: true, name: true } } },
    });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
};

// PUT /api/approval-templates/:id  (admin only)
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const template = await prisma.approvalTemplate.findUnique({ where: { id } });
    if (!template) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

    const { name, description, fieldsJson, lineJson, isActive, code } = req.body;

    if (fieldsJson) {
      try { JSON.parse(fieldsJson); } catch {
        return res.status(400).json({ error: 'fieldsJson이 올바른 JSON 형식이 아닙니다.' });
      }
    }
    let docCode;
    if (code !== undefined) {
      docCode = String(code).toUpperCase();
      if (!/^[A-Z0-9]{2,10}$/.test(docCode)) {
        return res.status(400).json({ error: '양식코드는 영대문자·숫자 2~10자로 입력하세요.' });
      }
    }

    const updated = await prisma.approvalTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(fieldsJson !== undefined && { fieldsJson }),
        ...(lineJson !== undefined && { lineJson }),
        ...(isActive !== undefined && { isActive }),
        ...(docCode !== undefined && { code: docCode }),
      },
      include: { formType: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// GET/POST /api/approval-templates/:id/resolve-line
// 프리셋 결재선을 기안자 조직 기준으로 해석하고, formData 기준으로 조건을 평가한다.
// base: 조건 없는 기본 결재자(편집 가능), conditional: 조건 통과한 자동 결재자(상신 시 자동 추가)
const resolveLine = async (req, res, next) => {
  try {
    const template = await prisma.approvalTemplate.findUnique({ where: { id: Number(req.params.id) } });
    if (!template) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

    // formData는 POST body 또는 GET query(JSON 문자열)로 전달 가능
    let formData = req.body?.formData;
    if (!formData && req.query.formData) {
      try { formData = JSON.parse(req.query.formData); } catch { formData = {}; }
    }
    formData = formData || {};

    const { steps, unresolved } = await resolvePresetLine(prisma, template, formData, req.user.id);
    res.json({
      steps: steps.filter(s => !s.conditional),
      conditional: steps.filter(s => s.conditional),
      unresolved,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/approval-templates/:id  (admin only)
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const template = await prisma.approvalTemplate.findUnique({ where: { id } });
    if (!template) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

    await prisma.approvalTemplate.update({ where: { id }, data: { isActive: false } });
    res.json({ message: '템플릿이 비활성화되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, get, create, update, remove, resolveLine };
