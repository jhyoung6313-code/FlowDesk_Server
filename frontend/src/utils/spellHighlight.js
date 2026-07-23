/* contenteditable/에디터 DOM에 CSS Custom Highlight API로 오타 밑줄 적용
   - DOM을 변형하지 않아 커서/undo/편집을 깨지 않음 (Chrome/Edge 지원)
   - applySpellHighlight(rootEl, name) → 검출 matches 반환 */
import { check } from './koSpell';

function locate(map, pos) {
  for (let i = map.length - 1; i >= 0; i--) {
    if (pos >= map[i].start) return { node: map[i].node, offset: pos - map[i].start };
  }
  return null;
}

export function computeSpellRanges(rootEl) {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  let text = '';
  const map = [];
  let n;
  while ((n = walker.nextNode())) {
    map.push({ node: n, start: text.length });
    text += n.nodeValue;
  }
  const matches = check(text);
  const ranges = [];
  for (const m of matches) {
    const s = locate(map, m.start);
    const e = locate(map, m.end);
    if (!s || !e) continue;
    try {
      const r = document.createRange();
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset);
      ranges.push(r);
    } catch { /* ignore */ }
  }
  return { ranges, matches };
}

export const spellSupported = () =>
  typeof window !== 'undefined' && window.CSS && CSS.highlights && typeof Highlight !== 'undefined';

export function applySpellHighlight(rootEl, name = 'ko-spell') {
  if (!rootEl || !spellSupported()) return [];
  const { ranges, matches } = computeSpellRanges(rootEl);
  try {
    if (ranges.length) CSS.highlights.set(name, new Highlight(...ranges));
    else CSS.highlights.delete(name);
  } catch { /* ignore */ }
  return matches;
}

export function clearSpellHighlight(name = 'ko-spell') {
  try { if (spellSupported()) CSS.highlights.delete(name); } catch { /* ignore */ }
}
