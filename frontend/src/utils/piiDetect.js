// ─────────────────────────────────────────────────────────────
// 개인정보/신용정보 입력 탐지 (프론트 UX 안내용)
// backend/src/utils/piiPatterns.js 와 동일 정책을 미러링한다.
// ⚠️ 실제 차단은 서버(piiGuard)가 수행한다. 여기선 저장 전 경고만 담당.
// ─────────────────────────────────────────────────────────────

const DATE_LIKE = /^\d{4}[-\s.]\d{1,2}[-\s.]\d{1,2}$/;

const PII_RULES = [
  { type: '주민등록번호', re: /\b(\d{6})[-\s]?([1-4])(\d{6})\b/ },
  { type: '신용카드번호', re: /\b([3-6]\d{3})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{1,4})\b/ },
  { type: '연락처', re: /\b010[-\s]?\d{3,4}[-\s]?\d{4}\b/ },
  {
    type: '계좌번호',
    re: /\b\d{2,6}[-\s]\d{2,6}[-\s]\d{2,7}\b/,
    valid: (m) => !DATE_LIKE.test(m) && (m.replace(/\D/g, '').length >= 10),
  },
];

// 첫 번째로 탐지된 개인정보 유형을 반환. 없으면 null.
export function detectPii(text) {
  if (typeof text !== 'string' || text.length < 6) return null;
  for (const rule of PII_RULES) {
    const m = rule.re.exec(text);
    if (m && (!rule.valid || rule.valid(m[0]))) return { type: rule.type, match: m[0] };
  }
  return null;
}

// Ant Design Form 검증기: rules={[{ validator: piiValidator }]}
export function piiValidator(_rule, value) {
  const hit = detectPii(typeof value === 'string' ? value : '');
  if (hit) {
    return Promise.reject(new Error(`${hit.type}는 입력할 수 없습니다 (개인정보·신용정보 제한).`));
  }
  return Promise.resolve();
}
