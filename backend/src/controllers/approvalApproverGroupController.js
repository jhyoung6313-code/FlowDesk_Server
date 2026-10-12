const prisma = require('../lib/prisma');

// GET /api/approval-approver-groups — 전원 열람(결재선 작성 시 선택해야 하므로 admin 전용 아님)
const list = async (req, res, next) => {
  try {
    const groups = await prisma.approvalApproverGroup.findMany({ orderBy: { name: 'asc' } });
    res.json(groups);
  } catch (err) {
    next(err);
  }
};

// POST /api/approval-approver-groups  (admin only)
const create = async (req, res, next) => {
  try {
    const { name, memberIds } = req.body;
    if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: '이름과 1명 이상의 멤버가 필요합니다.' });
    }
    const group = await prisma.approvalApproverGroup.create({
      data: { name, memberIds: memberIds.map(Number), createdBy: req.user.id },
    });
    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
};

// PUT /api/approval-approver-groups/:id  (admin only)
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const group = await prisma.approvalApproverGroup.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });

    const { name, memberIds } = req.body;
    if (memberIds !== undefined && (!Array.isArray(memberIds) || memberIds.length === 0)) {
      return res.status(400).json({ error: '멤버는 1명 이상이어야 합니다.' });
    }
    const updated = await prisma.approvalApproverGroup.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(memberIds !== undefined && { memberIds: memberIds.map(Number) }),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/approval-approver-groups/:id  (admin only)
// 하드 삭제 — 이 그룹을 참조하는 템플릿/양식종류의 lineJson은 그대로 남지만, 결재선 해석 시
// (approvalLine.js) 그룹을 찾지 못하면 unresolved로 분류되어 관리자가 알아챌 수 있다.
const remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const group = await prisma.approvalApproverGroup.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });

    await prisma.approvalApproverGroup.delete({ where: { id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
