import useAuthStore from '../store/authStore';

// 부서가 지정되지 않은 사용자를 묶는 그룹 라벨
const NO_DEPT_LABEL = '부서 미지정';

/**
 * 현재 로그인 사용자의 부서명을 반환한다. (비반응형 조회 — 렌더/이벤트 어디서든 호출 가능)
 * @returns {string}
 */
export function getMyDepartment() {
  return useAuthStore.getState().user?.department || '';
}

/**
 * 사용자 배열을 Ant Design Select 의 그룹화 옵션으로 변환한다.
 * - 현재 로그인 사용자와 같은 부서원을 최상단 그룹으로 노출(1차 표시)
 * - 나머지 부서는 부서명 가나다순 그룹으로 묶어 검색으로 찾을 수 있게 함
 *
 * @param {Array}  users  사용자 배열 (id, displayName, department, position ...)
 * @param {string} myDept 현재 사용자 부서명 (getMyDepartment() 결과)
 * @param {object} opts
 *   - valuePrefix: 옵션 value 접두사 (예: 'uid:'). 기본 ''.
 *   - valueKey:    value 로 사용할 필드 ('id' | 'displayName'). 기본 'id'.
 * @returns {Array} Select options (그룹 구조)
 */
export function buildUserOptions(users, myDept, opts = {}) {
  const { valuePrefix = '', valueKey = 'id' } = opts;

  const toOption = (u) => ({
    value: valuePrefix ? `${valuePrefix}${u[valueKey]}` : u[valueKey],
    label: u.displayName,
    // 이름·부서·직책을 모두 검색 대상에 포함
    keywords: `${u.displayName || ''} ${u.department || ''} ${u.position || ''}`.toLowerCase(),
  });

  const myDeptNorm = (myDept || '').trim();
  const sameDept = [];
  const others = new Map(); // 부서명 -> 사용자[]

  (users || []).forEach((u) => {
    const dept = (u.department || '').trim();
    if (myDeptNorm && dept === myDeptNorm) {
      sameDept.push(u);
    } else {
      const key = dept || NO_DEPT_LABEL;
      if (!others.has(key)) others.set(key, []);
      others.get(key).push(u);
    }
  });

  const byName = (a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'ko');
  const groups = [];

  if (sameDept.length) {
    groups.push({
      label: `같은 부서 · ${myDeptNorm}`,
      options: sameDept.sort(byName).map(toOption),
    });
  }

  // 부서명 가나다순 정렬, '부서 미지정'은 항상 마지막
  const otherKeys = [...others.keys()].sort((a, b) => {
    if (a === NO_DEPT_LABEL) return 1;
    if (b === NO_DEPT_LABEL) return -1;
    return a.localeCompare(b, 'ko');
  });
  otherKeys.forEach((k) => {
    groups.push({ label: k, options: others.get(k).sort(byName).map(toOption) });
  });

  return groups;
}

/**
 * Ant Select 의 filterOption — 이름·부서·직책 텍스트로 검색한다.
 * 그룹화 옵션에서는 leaf 옵션 단위로 호출된다.
 */
export function filterUserOption(input, option) {
  if (!input) return true;
  const kw = option?.keywords;
  if (kw) return kw.includes(input.toLowerCase());
  return String(option?.label ?? '').toLowerCase().includes(input.toLowerCase());
}
