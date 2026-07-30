// 전자결재 프리셋 결재선 해석 + 조건 평가
// lineJson 항목:
//   { stepOrder, type, approverId }                              (고정 사용자)
//   { stepOrder, type, rule: { by:'position', value, scope } }   (직급/직책 규칙)
//   위 항목에 선택적으로 condition 추가:
//   { ..., condition: { field, op, value } }                     (기능별 자동 결재라인)

// 조건 평가 — formData의 field 값을 op로 비교
function evalCondition(cond, formData) {
  if (!cond || !cond.field) return true; // 조건 없으면 항상 포함
  const v = formData?.[cond.field];
  const target = cond.value;
  switch (cond.op) {
    case 'truthy':   return !!v && v !== '0' && v !== 'false' && v !== '아니오' && v !== 'N';
    case 'eq':       return String(v ?? '') === String(target ?? '');
    case 'ne':       return String(v ?? '') !== String(target ?? '');
    case 'gt':       return Number(v) > Number(target);
    case 'gte':      return Number(v) >= Number(target);
    case 'lt':       return Number(v) < Number(target);
    case 'lte':      return Number(v) <= Number(target);
    case 'contains': return Array.isArray(v) ? v.includes(target) : String(v ?? '').includes(String(target));
    default:         return true;
  }
}

// 프리셋 결재선을 요청자(기안자) 조직 기준으로 실제 사용자로 해석하고,
// formData 기준으로 조건을 평가한다.
// 반환: { steps: [{approverId, approverName, type, stepOrder, conditional, ruleLabel}], unresolved: [...] }
async function resolvePresetLine(prisma, template, formData, drafterId) {
  let preset = [];
  if (template?.lineJson) {
    try { preset = JSON.parse(template.lineJson); } catch { preset = []; }
  }
  // 템플릿에 결재선이 없으면 상위 '양식 종류'의 기본 결재선으로 폴백
  if (preset.length === 0 && template?.formTypeId) {
    try {
      const ft = await prisma.approvalFormType.findUnique({
        where: { id: template.formTypeId },
        select: { lineJson: true },
      });
      if (ft?.lineJson) preset = JSON.parse(ft.lineJson);
    } catch { /* ignore */ }
  }

  const drafter = await prisma.user.findUnique({
    where: { id: drafterId },
    select: { departmentId: true, teamId: true },
  });

  const steps = [];
  const unresolved = [];

  for (let i = 0; i < preset.length; i++) {
    const entry = preset[i];
    const type = entry.type || 'approval';
    const stepOrder = type === 'reference' ? 0 : (entry.stepOrder || i + 1);
    const hasCond = !!(entry.condition && entry.condition.field);

    // 조건이 있고 통과하지 못하면 제외
    if (hasCond && !evalCondition(entry.condition, formData)) continue;

    if (entry.approverId) {
      const u = await prisma.user.findUnique({
        where: { id: Number(entry.approverId) },
        select: { id: true, displayName: true, isActive: true },
      });
      if (u && u.isActive !== false) {
        steps.push({ approverId: u.id, approverName: u.displayName, type, stepOrder, conditional: hasCond });
      } else {
        unresolved.push({ ...entry, reason: '지정 사용자를 찾을 수 없음' });
      }
      continue;
    }

    if (entry.rule?.by === 'position') {
      const value = String(entry.rule.value || '').trim();
      const scope = entry.rule.scope || 'all';
      const where = { isActive: true, OR: [{ position: value }, { jobGrade: value }] };
      if (scope === 'team' && drafter?.teamId) where.teamId = drafter.teamId;
      if (scope === 'department' && drafter?.departmentId) where.departmentId = drafter.departmentId;

      const matches = await prisma.user.findMany({ where, select: { id: true, displayName: true }, orderBy: { id: 'asc' } });
      if (matches.length > 0) {
        const u = matches[0];
        steps.push({ approverId: u.id, approverName: u.displayName, type, stepOrder, conditional: hasCond, ruleLabel: `${value}(${scope})` });
      } else {
        unresolved.push({ ...entry, reason: `'${value}' 직급/직책 사용자 없음` });
      }
      continue;
    }

    unresolved.push({ ...entry, reason: '알 수 없는 프리셋 항목' });
  }

  return { steps, unresolved };
}

module.exports = { evalCondition, resolvePresetLine };
