// 결재선 편집 공용 모듈 — ApprovalAdmin.jsx의 FormTypeTab/TemplateTab이 공유한다.
// (frontend/src/pages/Approval/DocumentForm.jsx의 결재선 편집기는 의도적으로 별개로 남겨둔다:
//  그쪽은 "직급/직책 규칙(kind:'rule')"이나 "조건부 결재자"가 아니라 이미 확정된 실제 사용자만
//  다루는 다른 데이터 모양이라 하나로 합치면 오히려 옵셔널 분기가 늘어나 더 헷갈린다.)
import { useState } from 'react';
import { Select, Input, Button, Space, Tag, Typography, InputNumber, message } from 'antd';
import { PlusCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { nextGroupNo } from '../../utils/approvalLine';

const { Text } = Typography;

export const ROLE_OPTIONS = [
  { value: 'approval', label: '승인' },
  { value: 'agreement', label: '합의' },
  { value: 'delegation', label: '전결' },
  { value: 'reference', label: '참조' },
];
export const SCOPE_OPTIONS = [
  { value: 'team', label: '같은 팀' },
  { value: 'department', label: '같은 부서' },
  { value: 'all', label: '전체' },
];
export const OP_OPTIONS = [
  { value: 'truthy', label: '값 있음/예' },
  { value: 'eq', label: '= 같음' },
  { value: 'ne', label: '≠ 다름' },
  { value: 'gt', label: '> 초과' },
  { value: 'gte', label: '≥ 이상' },
  { value: 'lt', label: '< 미만' },
  { value: 'lte', label: '≤ 이하' },
  { value: 'contains', label: '포함' },
];

// 결재선 상태 + 변형 함수. FormTypeTab(조건 없음)·TemplateTab(조건 있음) 둘 다 이 훅 하나를 쓴다.
export function useApprovalLine(initial = []) {
  const [line, setLine] = useState(initial);

  // 중복 체크를 setLine 업데이터 내부에서 수행 — 바깥 스코프의 line 상태로 체크하면
  // 연속 클릭(이전 렌더의 setLine이 아직 반영 안 된 시점)에서 둘 다 같은 스냅샷을 보고 중복
  // 통과시켜 같은 대상이 두 번 추가될 수 있다.
  const addUser = (users, userId) => {
    if (!userId) return;
    const u = users.find((x) => x.id === userId);
    setLine((prev) => {
      if (prev.some((s) => s.kind === 'user' && s.approverId === userId)) return prev;
      return [...prev, {
        key: `u${userId}`, kind: 'user', approverId: userId, approverName: u?.displayName || '',
        type: 'approval', stepOrder: nextGroupNo(prev),
      }];
    });
  };
  const addGroup = (groups, groupId) => {
    if (!groupId) return;
    const g = groups.find((x) => x.id === groupId);
    setLine((prev) => {
      if (prev.some((s) => s.kind === 'group' && s.groupId === groupId)) return prev;
      return [...prev, {
        key: `g${groupId}`, kind: 'group', groupId, groupName: g?.name || '',
        type: 'approval', stepOrder: nextGroupNo(prev),
      }];
    });
  };
  // 반환값(true/false)으로 호출부가 입력창을 비울지 판단한다.
  const addRule = (position, scope) => {
    const pos = (position || '').trim();
    if (!pos) return false;
    setLine((prev) => [...prev, {
      key: `r${Date.now()}`, kind: 'rule', position: pos, scope,
      type: 'approval', stepOrder: nextGroupNo(prev),
    }]);
    return true;
  };
  const remove = (idx) => setLine((prev) => prev.filter((_, i) => i !== idx));
  const setRole = (idx, type) => setLine((prev) => prev.map((s, i) => (
    i !== idx ? s : { ...s, type, stepOrder: type === 'reference' ? 0 : (s.stepOrder || nextGroupNo(prev)) }
  )));
  const setGroup = (idx, v) => setLine((prev) => prev.map((s, i) => (
    i === idx ? { ...s, stepOrder: Math.max(1, Number(v) || 1) } : s
  )));
  const toggleCondition = (idx) => setLine((prev) => prev.map((s, i) => (
    i !== idx ? s : (s.condition ? { ...s, condition: null } : { ...s, condition: { field: '', op: 'truthy', value: '' } })
  )));
  const setCondition = (idx, patch) => setLine((prev) => prev.map((s, i) => (
    i === idx ? { ...s, condition: { ...s.condition, ...patch } } : s
  )));

  return { line, setLine, addUser, addRule, addGroup, remove, setRole, setGroup, toggleCondition, setCondition };
}

// 서버에 저장된 lineJson(rule/user/group + stepOrder + 선택적 condition) → 편집기 상태 배열
export function parseApprovalLine(lineJson, users, groups = []) {
  if (!lineJson) return [];
  let l = [];
  try { l = JSON.parse(lineJson); } catch { return []; }
  return l.map((s, i) => {
    const type = s.type || 'approval';
    const stepOrder = type === 'reference' ? 0 : (s.stepOrder || i + 1);
    const condition = s.condition?.field ? { ...s.condition } : null;
    if (s.rule?.by === 'position') {
      return { key: `r${i}-${Date.now()}`, kind: 'rule', position: s.rule.value || '', scope: s.rule.scope || 'all', type, stepOrder, condition };
    }
    if (s.group) {
      const g = groups.find((x) => x.id === s.group);
      return { key: `g${s.group}`, kind: 'group', groupId: s.group, groupName: g?.name || `그룹 ${s.group}`, type, stepOrder, condition };
    }
    const u = users.find((x) => x.id === s.approverId);
    return { key: `u${s.approverId}`, kind: 'user', approverId: s.approverId, approverName: u?.displayName || `사용자 ${s.approverId}`, type, stepOrder, condition };
  });
}

// 편집기 상태 배열 → 저장용 lineJson 문자열(빈 결재선은 null)
export function serializeApprovalLine(line) {
  if (!line.length) return null;
  return JSON.stringify(line.map((s) => {
    const stepOrder = s.type === 'reference' ? 0 : s.stepOrder;
    let base;
    if (s.kind === 'rule') base = { stepOrder, type: s.type, rule: { by: 'position', value: s.position, scope: s.scope } };
    else if (s.kind === 'group') base = { stepOrder, type: s.type, group: s.groupId };
    else base = { stepOrder, type: s.type, approverId: s.approverId };
    if (s.condition?.field) base.condition = { field: s.condition.field, op: s.condition.op || 'truthy', value: s.condition.value ?? '' };
    return base;
  }));
}

// 결재선 편집 UI(대상 추가 툴바 + 행 목록). withCondition=false면 조건 버튼/편집 UI를 아예 숨긴다
// — "종류(FormType)"의 공통 기본 결재선은 조건 개념이 없고(양식 필드가 없으므로 조건을 걸 대상이
// 없음), "템플릿"의 기본 결재선만 조건부 결재자를 지원한다.
export function ApprovalLineEditor({
  users, line, onAddUser, onAddRule, onAddGroup, onRemove, onSetRole, onSetGroup,
  approverGroups = [],
  withCondition = false, onToggleCondition, onSetCondition, conditionFieldOptions = [],
}) {
  const [rulePosition, setRulePosition] = useState('');
  const [ruleScope, setRuleScope] = useState('team');
  const handleAddRule = () => {
    if (onAddRule(rulePosition, ruleScope)) setRulePosition('');
    else message.warning('직급/직책을 입력하세요.');
  };

  return (
    <>
      <Space size={6} wrap style={{ marginBottom: 8 }}>
        <Select
          placeholder="지정 사용자 추가" style={{ width: 190 }} size="small"
          showSearch optionFilterProp="children" onChange={onAddUser} value={null}
        >
          {users.map((u) => <Select.Option key={u.id} value={u.id}>{u.displayName} ({u.username})</Select.Option>)}
        </Select>
        {approverGroups.length > 0 && (
          <Select
            placeholder="결재자 그룹 추가" style={{ width: 160 }} size="small"
            onChange={(v) => onAddGroup?.(v)} value={null}
          >
            {approverGroups.map((g) => <Select.Option key={g.id} value={g.id}>{g.name} ({g.memberIds?.length || 0}명)</Select.Option>)}
          </Select>
        )}
        <Input.Group compact>
          <Input
            size="small" placeholder="직급/직책 (예: 팀장)" style={{ width: 130 }}
            value={rulePosition} onChange={(e) => setRulePosition(e.target.value)} onPressEnter={handleAddRule}
          />
          <Select size="small" value={ruleScope} onChange={setRuleScope} options={SCOPE_OPTIONS} style={{ width: 90 }} />
          <Button size="small" icon={<PlusCircleOutlined />} onClick={handleAddRule}>규칙 추가</Button>
        </Input.Group>
      </Space>
      {line.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 13 }}>지정된 결재선이 없습니다.</Text>
      ) : line.map((step, i) => (
        <div key={step.key || i} style={{ padding: '4px 0', borderBottom: '1px dashed #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {step.kind === 'rule' && (
              <Tag color="geekblue" style={{ margin: 0 }}>규칙: {step.position} · {SCOPE_OPTIONS.find((o) => o.value === step.scope)?.label}</Tag>
            )}
            {step.kind === 'group' && (
              <Tag color="purple" style={{ margin: 0 }}>그룹: {step.groupName}</Tag>
            )}
            {step.kind === 'user' && <Text style={{ fontSize: 13, minWidth: 90 }}>{step.approverName}</Text>}
            <Select size="small" value={step.type} style={{ width: 78 }} onChange={(v) => onSetRole(i, v)} options={ROLE_OPTIONS} />
            {step.type === 'reference'
              ? <Text type="secondary" style={{ fontSize: 13, width: 56 }}>열람</Text>
              : (
                <Space size={2} style={{ width: 56 }}>
                  <InputNumber size="small" min={1} value={step.stepOrder} controls={false} onChange={(v) => onSetGroup(i, v)} style={{ width: 42 }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>차</Text>
                </Space>
              )}
            {withCondition && (
              <Button size="small" type={step.condition ? 'primary' : 'default'} ghost={!!step.condition} onClick={() => onToggleCondition(i)}>조건</Button>
            )}
            <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => onRemove(i)} />
          </div>
          {withCondition && step.condition && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 12 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>조건:</Text>
              <Select
                size="small" placeholder="필드" style={{ width: 120 }}
                value={step.condition.field || undefined}
                onChange={(v) => onSetCondition(i, { field: v })}
                options={conditionFieldOptions}
              />
              <Select size="small" style={{ width: 110 }} value={step.condition.op} onChange={(v) => onSetCondition(i, { op: v })} options={OP_OPTIONS} />
              {!['truthy'].includes(step.condition.op) && (
                <Input size="small" placeholder="값" style={{ width: 90 }} value={step.condition.value} onChange={(e) => onSetCondition(i, { value: e.target.value })} />
              )}
              <Text type="secondary" style={{ fontSize: 13 }}>일 때만 결재</Text>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
