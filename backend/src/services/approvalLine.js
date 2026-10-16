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

  // 각 프리셋 항목의 해석(고정 사용자/그룹/직급규칙 조회)은 서로 독립적인데, 기존 코드는
  // for 루프 안에서 매 항목마다 순차로 await 했다 — 결재선이 길어질수록(항목 수 G) 상신
  // 요청 하나가 순서대로 G번의 DB 라운드트립을 기다려야 했다. Promise.all로 항목별 해석을
  // 동시에 수행하고, 항목 순서는 resolvedList(배열 인덱스)가 그대로 보존하므로 이후 steps/
  // unresolved로 펼쳐도 기존과 동일한 순서가 유지된다.
  const resolvedList = await Promise.all(preset.map(async (entry, i) => {
    const type = entry.type || 'approval';
    const stepOrder = type === 'reference' ? 0 : (entry.stepOrder || i + 1);
    const hasCond = !!(entry.condition && entry.condition.field);

    // 조건이 있고 통과하지 못하면 제외
    if (hasCond && !evalCondition(entry.condition, formData)) return { steps: [], unresolved: [] };

    if (entry.approverId) {
      const u = await prisma.user.findUnique({
        where: { id: Number(entry.approverId) },
        select: { id: true, displayName: true, isActive: true },
      });
      if (u && u.isActive !== false) {
        return { steps: [{ approverId: u.id, approverName: u.displayName, type, stepOrder, conditional: hasCond }], unresolved: [] };
      }
      return { steps: [], unresolved: [{ ...entry, reason: '지정 사용자를 찾을 수 없음' }] };
    }

    if (entry.group) {
      // 재사용 가능한 결재자 그룹 — 현재 멤버 전원을 같은 차수(병렬)로 확장한다.
      // 조직 변경 시 그룹 멤버만 바꾸면 이 그룹을 쓰는 모든 양식에 자동 반영된다.
      const group = await prisma.approvalApproverGroup.findUnique({ where: { id: Number(entry.group) } });
      if (!group || group.memberIds.length === 0) {
        return { steps: [], unresolved: [{ ...entry, reason: '그룹을 찾을 수 없거나 멤버가 없음' }] };
      }
      const members = await prisma.user.findMany({
        where: { id: { in: group.memberIds }, isActive: true },
        select: { id: true, displayName: true },
      });
      if (members.length === 0) {
        return { steps: [], unresolved: [{ ...entry, reason: `그룹 '${group.name}'에 활성 사용자가 없음` }] };
      }
      return {
        steps: members.map((m) => ({ approverId: m.id, approverName: m.displayName, type, stepOrder, conditional: hasCond, ruleLabel: `그룹:${group.name}` })),
        unresolved: [],
      };
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
        return { steps: [{ approverId: u.id, approverName: u.displayName, type, stepOrder, conditional: hasCond, ruleLabel: `${value}(${scope})` }], unresolved: [] };
      }
      return { steps: [], unresolved: [{ ...entry, reason: `'${value}' 직급/직책 사용자 없음` }] };
    }

    return { steps: [], unresolved: [{ ...entry, reason: '알 수 없는 프리셋 항목' }] };
  }));

  const steps = [];
  const unresolved = [];
  for (const r of resolvedList) {
    steps.push(...r.steps);
    unresolved.push(...r.unresolved);
  }

  return { steps, unresolved };
}

module.exports = { evalCondition, resolvePresetLine };
