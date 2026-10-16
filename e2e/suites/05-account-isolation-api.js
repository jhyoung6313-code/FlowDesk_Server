// 로컬 DB의 member1(2)·member2(3)로 설정 저장 분리를 검증하고 테스트 데이터를 삭제한다.
const { jwt, prisma, API: base } = require('../lib/env');

async function call(method, url, token, body) {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

(async () => {
  const users = await prisma.user.findMany({ where: { id: { in: [2, 3] } } });
  const tok = {};
  for (const u of users) {
    tok[u.id] = jwt.sign({ userId: u.id, role: u.role, pwAt: new Date(u.passwordChangedAt).getTime(), sn: u.sessionNonce }, process.env.JWT_SECRET, { expiresIn: '5m' });
  }
  const out = [];
  const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

  await call('PUT', '/settings/preferences', tok[2], { nav: { pinned: ['/wiki', '/okr'] } });
  await call('PUT', '/settings/preferences', tok[3], { nav: { pinned: ['/mail'] } });
  const p2 = await call('GET', '/settings/preferences', tok[2]);
  const p3 = await call('GET', '/settings/preferences', tok[3]);
  check('prefs: member1 저장값 분리', JSON.stringify(p2.json.nav.pinned) === '["/wiki","/okr"]', JSON.stringify(p2.json));
  check('prefs: member2 저장값 분리', JSON.stringify(p3.json.nav.pinned) === '["/mail"]', JSON.stringify(p3.json));

  await call('PUT', '/settings/theme', tok[2], { isDark: true, density: 'compact', skin: 'slick' });
  const t2 = await call('GET', '/settings/theme', tok[2]);
  const t3 = await call('GET', '/settings/theme', tok[3]);
  check('theme: member1 저장', t2.json.skin === 'slick');
  check('theme: member2 는 영향 없음', !t3.json.skin, JSON.stringify(t3.json));

  await call('PUT', '/settings/dashboard-layout', tok[3], { v: 1, layout: [], enabled: { 'x-okr': true } });
  const d2 = await call('GET', '/settings/dashboard-layout', tok[2]);
  const d3 = await call('GET', '/settings/dashboard-layout', tok[3]);
  check('dashboard: member1 은 member2 설정을 보지 않음', d2.json === null, JSON.stringify(d2.json));
  check('dashboard: member2 저장값', d3.json && d3.json.enabled['x-okr'] === true);

  // 알림은 본인 것만
  const n2 = await call('GET', '/notifications', tok[2]);
  const n3 = await call('GET', '/notifications', tok[3]);
  const ids2 = new Set(n2.json.map((n) => n.userId));
  const ids3 = new Set(n3.json.map((n) => n.userId));
  check('notifications: member1 목록은 userId=2 만', [...ids2].every((x) => x === 2), `[${[...ids2]}] n=${n2.json.length}`);
  check('notifications: member2 목록은 userId=3 만', [...ids3].every((x) => x === 3), `[${[...ids3]}] n=${n3.json.length}`);

  // SSE: 세션 교체된 옛 토큰은 거부
  const stale = jwt.sign({ userId: 2, role: 'member', pwAt: new Date(users.find((u) => u.id === 2).passwordChangedAt).getTime(), sn: 'stale-nonce' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const ac = new AbortController();
  const s1 = await fetch(`${base}/notifications/stream?token=${stale}`, { signal: ac.signal });
  check('SSE: 옛 세션(sn 불일치) 토큰 거부(401)', s1.status === 401, `status=${s1.status}`);
  const ac2 = new AbortController();
  const s2 = await fetch(`${base}/notifications/stream?token=${tok[2]}`, { signal: ac2.signal });
  check('SSE: 정상 토큰 허용(200)', s2.status === 200, `status=${s2.status}`);
  ac2.abort();

  // 정리
  await prisma.appSetting.deleteMany({ where: { key: { in: ['user_prefs_2', 'user_prefs_3', 'theme_prefs_2', 'dashboard_layout_3'] } } });
  const left = await prisma.appSetting.count({ where: { key: { in: ['user_prefs_2', 'user_prefs_3', 'theme_prefs_2', 'dashboard_layout_3'] } } });
  check('테스트 데이터 정리', left === 0);
  console.log(out.join('\n'));
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
