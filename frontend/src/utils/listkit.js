/* ══════════════════════════════════════════════════════════════
   listkit — 목록/상세(2-pane) 화면 공용 헬퍼
   ・avatarColor : 이름 → 안정적인 아바타 색상 (테마 조화 팔레트)
   ・initial     : 이름 → 첫 글자
   ・bodyPreview : HTML 본문 → 미리보기 한 줄 텍스트
   ══════════════════════════════════════════════════════════════ */

export const AVATAR_COLORS = [
  '#6366f1', '#0891b2', '#ea580c', '#16a34a',
  '#db2777', '#7c3aed', '#0284c7', '#d97706',
];

/* 이름 문자열을 해시해 팔레트에서 안정적으로 색을 고른다 (같은 이름 = 같은 색) */
export function avatarColor(name = '') {
  const s = name || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initial(name = '') {
  return (name || '?').charAt(0);
}

/* HTML 본문 → 태그 제거 후 앞부분 텍스트 미리보기 */
export function bodyPreview(html = '', len = 90) {
  const text = (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, len);
}
