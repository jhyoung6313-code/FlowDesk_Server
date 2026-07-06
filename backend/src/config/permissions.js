// ─────────────────────────────────────────────────────────────
// 권한 그룹 레지스트리 (조합형 권한)
// role(admin/member)과 별개로, 사용자에게 추가로 부여하는 권한 집합.
// 예: 일반사용자(member) + PII_AUDIT(감사권한).
// 새 권한을 추가하려면 여기에 한 줄만 등록하면 API·검증·UI가 함께 확장된다.
// ─────────────────────────────────────────────────────────────

const PERMISSIONS = {
  PII_AUDIT: {
    key: 'PII_AUDIT',
    label: '개인정보 감사권한',
    desc: '개인정보 검출내역(입력 차단 로그) 열람',
  },
};

// 유효한 권한 키 목록 (부여 시 화이트리스트 검증용)
const PERMISSION_KEYS = Object.keys(PERMISSIONS);

// UI 노출용 목록 (부여 화면에서 사용)
const PERMISSION_LIST = Object.values(PERMISSIONS);

// 알 수 없는 키를 걸러 유효한 권한만 남긴다.
function sanitize(keys) {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter((k) => PERMISSION_KEYS.includes(k)))];
}

module.exports = { PERMISSIONS, PERMISSION_KEYS, PERMISSION_LIST, sanitize };
