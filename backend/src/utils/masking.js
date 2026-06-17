// ─────────────────────────────────────────────────────────────
// 개인정보 마스킹 유틸 (화면 표시·로그 출력용)
// 개인정보보호법 안전성 확보조치 기준: 표시 시 일부 마스킹 권고.
// ⚠️ 마스킹은 "표시"용 비식별이며, 저장 보호(암호화)와는 별개다.
// ─────────────────────────────────────────────────────────────

// 홍길동 → 홍*동 / 김철 → 김*
function maskName(name) {
  if (!name) return name;
  const chars = [...String(name)];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return chars[0] + '*';
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

// 010-1234-5678 → 010-****-5678
function maskPhone(phone) {
  if (!phone) return phone;
  return String(phone).replace(/(\d{2,3})[-\s]?(\d{3,4})[-\s]?(\d{4})/, '$1-****-$3');
}

// user@example.com → us***@example.com
function maskEmail(email) {
  if (!email || !String(email).includes('@')) return email;
  const [local, domain] = String(email).split('@');
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

// 901201-1234567 → 901201-1******  (생년월일 뒤 성별자리까지만)
function maskRrn(rrn) {
  if (!rrn) return rrn;
  return String(rrn).replace(/(\d{6})[-\s]?(\d)\d{6}/, '$1-$2******');
}

// 1234567890123 → ******7890123 (뒤 4자리 외 마스킹은 정책에 따라 조정)
function maskAccount(account) {
  if (!account) return account;
  const s = String(account).replace(/\s/g, '');
  if (s.length <= 4) return s;
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

module.exports = { maskName, maskPhone, maskEmail, maskRrn, maskAccount };
