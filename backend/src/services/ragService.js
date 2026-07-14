// RAG 검색(F-63) — 자연어 질문에 답하기 위한 컨텍스트 수집기.
// 임베딩/벡터DB 없이(로컬·소규모 적합) 기존 데이터에서 키워드 기반으로 후보 스니펫을 모아
// aiService.answerFromContext에 전달한다. 접근제어는 기존 전역검색(searchController)의 신뢰모델을 따르되,
// 위키는 공개 스페이스+본인작성, 회의는 주최자/참석자만 포함한다.

const prisma = require('../lib/prisma');

const STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '어떻게', '무엇', '무엇을', '어디', '언제', '누가', '왜', '어떤',
  '있나요', '인가요', '인가', '있는', '있어', '해줘', '알려줘', '대해', '관련', '정리', '요약',
  'the', 'and', 'for', 'what', 'when', 'where', 'who', 'why', 'how', 'is', 'are', 'about',
]);

// 질문 → 검색 키워드 배열 (한글 2자+, 영문 2자+, 숫자 제외 단어)
function extractKeywords(question) {
  const raw = String(question || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const kws = [];
  for (const w of raw) {
    if (STOPWORDS.has(w)) continue;
    if (/^[a-z]+$/.test(w) && w.length < 3) continue; // 짧은 영단어 제외
    if (w.length < 2) continue;
    if (!kws.includes(w)) kws.push(w);
    if (kws.length >= 8) break;
  }
  return kws;
}

const strip = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// 자연어 질문으로 여러 도메인에서 컨텍스트 스니펫 수집. 반환: [{ source, title, path, text }]
async function gatherContexts({ userId, question, perSource = 5, maxContexts = 18 }) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];

  // 각 키워드에 대한 contains(OR) 조건
  const orText = (fields) => ({
    OR: keywords.flatMap((kw) => fields.map((f) => ({ [f]: { contains: kw, mode: 'insensitive' } }))),
  });

  const [tasks, memos, cards, wikiDocs, meetings, bbsPosts] = await Promise.all([
    prisma.task.findMany({
      where: { delYn: '0', ...orText(['title', 'description']) },
      select: { id: true, title: true, description: true, status: true },
      orderBy: { updatedAt: 'desc' }, take: perSource,
    }),
    prisma.memo.findMany({
      where: { createdBy: userId, ...orText(['title', 'content']) },
      select: { id: true, title: true, content: true },
      orderBy: { updatedAt: 'desc' }, take: perSource,
    }),
    prisma.boardCard.findMany({
      where: orText(['title', 'description']),
      select: { id: true, title: true, description: true, boardId: true },
      orderBy: { updatedAt: 'desc' }, take: perSource,
    }),
    prisma.wikiDoc.findMany({
      where: {
        delYn: '0',
        AND: [orText(['title', 'content']), { OR: [{ space: { visibility: 'public' } }, { createdBy: userId }] }],
      },
      select: { id: true, title: true, content: true },
      orderBy: { updatedAt: 'desc' }, take: perSource,
    }),
    prisma.meeting.findMany({
      where: {
        delYn: '0',
        AND: [
          orText(['title', 'minutes', 'summary']),
          { OR: [{ organizerId: userId }, { attendees: { some: { userId } } }] },
        ],
      },
      select: { id: true, title: true, minutes: true, summary: true },
      orderBy: { startAt: 'desc' }, take: perSource,
    }),
    prisma.bbsPost.findMany({
      where: { delYn: '0', ...orText(['title', 'content']) },
      select: { id: true, title: true, content: true, categoryId: true },
      orderBy: { updatedAt: 'desc' }, take: perSource,
    }),
  ]);

  const snip = (s, n = 600) => strip(s).slice(0, n);
  const contexts = [];
  tasks.forEach((t) => contexts.push({ source: '업무', title: t.title, path: `/tasks?taskId=${t.id}`, text: `상태:${t.status}. ${snip(t.description)}` }));
  wikiDocs.forEach((d) => contexts.push({ source: '위키', title: d.title, path: `/wiki?docId=${d.id}`, text: snip(d.content) }));
  meetings.forEach((m) => contexts.push({ source: '회의', title: m.title, path: `/meetings?id=${m.id}`, text: snip(m.summary || m.minutes) }));
  bbsPosts.forEach((p) => contexts.push({ source: '게시판', title: p.title, path: `/bbs?postId=${p.id}`, text: snip(p.content) }));
  cards.forEach((c) => contexts.push({ source: '보드카드', title: c.title, path: `/boards/${c.boardId}?cardId=${c.id}`, text: snip(c.description) }));
  memos.forEach((m) => contexts.push({ source: '메모', title: m.title || '(제목없음)', path: '/memos', text: snip(m.content) }));

  // 텍스트가 비어있지 않은 것 우선, 최대 개수 제한(토큰 보호)
  return contexts.filter((c) => c.title || c.text).slice(0, maxContexts);
}

module.exports = { gatherContexts, extractKeywords };
