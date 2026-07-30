/* ────────────────────────────────────────────────────────────────
   한국어 오타·맞춤법 검출 (오프라인 · 규칙/패턴 기반)
   - 외부 네트워크/AI 없이 브라우저에서 동작
   - "표시만" 용도: 자주 틀리는 고신뢰 패턴만 잡아 오탐 최소화
   - check(text) → [{ start, end, wrong, suggestion, reason }]
   - 사용자 사전(무시 목록)·추가 규칙으로 확장 가능
   ──────────────────────────────────────────────────────────────── */

// 고신뢰 맞춤법/오타 교정쌍 (거의 항상 오류인 것만) — { wrong, right }
export const COMMON_MISTAKES = [
  // 종결/어미
  { wrong: '있읍니다', right: '있습니다' },
  { wrong: '없읍니다', right: '없습니다' },
  { wrong: '습니가', right: '습니까' },
  { wrong: '안되요', right: '안 돼요' },
  { wrong: '안되서', right: '안 돼서' },
  { wrong: '되요', right: '돼요' },
  { wrong: '되서', right: '돼서' },
  { wrong: '되써', right: '돼서' },
  { wrong: '됬', right: '됐' },
  { wrong: '됀', right: '됐' },
  { wrong: '어떻해', right: '어떡해' },
  { wrong: '갈께', right: '갈게' },
  { wrong: '할께', right: '할게' },
  { wrong: '줄께', right: '줄게' },
  { wrong: '먹을께', right: '먹을게' },
  // 자주 틀리는 단어
  { wrong: '몇일', right: '며칠' },
  { wrong: '역활', right: '역할' },
  { wrong: '어의없', right: '어이없' },
  { wrong: '희안', right: '희한' },
  { wrong: '금새', right: '금세' },
  { wrong: '오랫만', right: '오랜만' },
  { wrong: '설겆이', right: '설거지' },
  { wrong: '뇌졸증', right: '뇌졸중' },
  { wrong: '구지', right: '굳이' },
  { wrong: '왠만', right: '웬만' },
  { wrong: '웬지', right: '왠지' },
  { wrong: '바꼈', right: '바뀌었' },
  // 도메인(전자결재)
  { wrong: '결제선', right: '결재선' },
  { wrong: '결제자', right: '결재자' },
  { wrong: '결제 문서', right: '결재 문서' },
];

const APPLIED = COMMON_MISTAKES;

// 정규식 규칙 (패턴형) — { re, suggestion, reason }
const REGEX_RULES = [
  { re: /([가-힣])읍니다/g, suggestion: '$1습니다', reason: "'읍니다'는 '습니다'가 올바른 표기" },
];

// 사용자 무시 목록(로컬 저장) — 특정 표기를 오타로 잡지 않도록
const IGNORE_KEY = 'ko_spell_ignore';
export function getIgnoreList() {
  try { return JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]'); } catch { return []; }
}
export function addIgnore(word) {
  const list = new Set(getIgnoreList());
  list.add(word);
  localStorage.setItem(IGNORE_KEY, JSON.stringify([...list]));
}

// 선택: 광범위 사전(있을 때만 보조) — setDictionary 로 주입
let DICT = null; // Set<string> | null
export function setDictionary(wordSet) { DICT = wordSet instanceof Set ? wordSet : (Array.isArray(wordSet) ? new Set(wordSet) : null); }

/* 텍스트에서 오타 후보 찾기 */
export function check(text) {
  if (!text) return [];
  const ignore = new Set(getIgnoreList());
  const matches = [];

  // 1) 확정 교정쌍
  for (const { wrong, right } of APPLIED) {
    if (ignore.has(wrong)) continue;
    let idx = text.indexOf(wrong);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + wrong.length, wrong, suggestion: right, reason: `'${wrong}' → '${right}'` });
      idx = text.indexOf(wrong, idx + wrong.length);
    }
  }

  // 2) 정규식 규칙
  for (const { re, suggestion, reason } of REGEX_RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const wrong = m[0];
      if (ignore.has(wrong)) continue;
      const sugg = suggestion.replace('$1', m[1] ?? '');
      matches.push({ start: m.index, end: m.index + wrong.length, wrong, suggestion: sugg, reason });
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width 방지
    }
  }

  // 3) (보조) 사전 기반 — 사전 주입 시에만. 조사/어미 스테밍 후 미등록 한글 어절 표시
  if (DICT) {
    const tokenRe = /[가-힣]{2,}/g;
    let m;
    while ((m = tokenRe.exec(text)) !== null) {
      const token = m[0];
      if (ignore.has(token)) continue;
      if (isKnown(token)) continue;
      matches.push({ start: m.index, end: m.index + token.length, wrong: token, suggestion: null, reason: '사전에 없는 단어', dict: true });
    }
  }

  // 중복/겹침 제거 (시작 위치 우선, 확정 교정쌍 우선)
  matches.sort((a, b) => a.start - b.start || (a.dict ? 1 : 0) - (b.dict ? 1 : 0));
  const out = [];
  let lastEnd = -1;
  for (const mt of matches) {
    if (mt.start >= lastEnd) { out.push(mt); lastEnd = mt.end; }
  }
  return out;
}

// 조사/어미를 벗겨 사전 조회 (사전 주입 시에만 사용)
const JOSA = ['으로써', '으로서', '에서', '에게', '한테', '까지', '부터', '으로', '이라', '라고', '이나', '나마', '조차', '마저', '처럼', '보다', '만큼', '은', '는', '이', '가', '을', '를', '에', '와', '과', '도', '만', '의', '로', '께', '야', '아'];
const EOMI = ['습니다', '했습니다', '합니다', '하였다', '였다', '한다', '하고', '해서', '하며', '하면', '하니', '해요', '했다', '이다', '입니다', '다', '요', '고', '게', '지', '자', '어', '아', '워'];
function isKnown(token) {
  if (!DICT) return true;
  if (DICT.has(token)) return true;
  for (const j of JOSA) if (token.endsWith(j) && DICT.has(token.slice(0, -j.length))) return true;
  for (const e of EOMI) if (token.endsWith(e) && DICT.has(token.slice(0, -e.length))) return true;
  // 어간+다 형태 등 최소 보정
  if (token.length >= 3 && DICT.has(token.slice(0, -1))) return true;
  return false;
}
