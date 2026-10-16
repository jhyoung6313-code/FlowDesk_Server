// 실서버 라이브 검증: member2(id 3) 로 1계정 1로그인 시나리오 + 가계부 계정 분리. 끝나면 상태를 원복한다.
const { jwt, prisma, API: base } = require('../lib/env');

const out = [];
const check = (name, ok, extra) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

async function call(method, url, token, body) {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

(async () => {
  const before = await prisma.user.findUnique({ where: { id: 3 }, select: { lastActiveAt: true, sessionNonce: true } });
  const login = (u = 'member2', p = 'member1234') => call('POST', '/auth/login', null, { username: u, password: p });

  // 이 스위트는 테스트 계정(member2)을 실제로 로그인·로그아웃한다. 앞선 스위트(05 등)가 남긴 '접속 중' 표시를 비우고 시작한다.
  await prisma.user.updateMany({ where: { id: 3 }, data: { lastActiveAt: null } });

  const l1 = await login();
  check('1) member2 첫 로그인 성공', l1.status === 200 && !!l1.json?.token, `status=${l1.status} ${l1.json?.error || ''}`);
  if (l1.status !== 200) { console.log(out.join('\n')); process.exit(0); }
  const t1 = l1.json.token;

  const l2 = await login();
  check('2) 접속 중 재로그인(다른 기기) → 409 ALREADY_LOGGED_IN', l2.status === 409 && l2.json?.code === 'ALREADY_LOGGED_IN', `status=${l2.status}`);

  const me = await call('GET', '/auth/me', t1);
  check('3) 첫 세션은 쫓겨나지 않고 계속 유효', me.status === 200, `status=${me.status}`);

  const bad = await login('member2', 'wrong-pass');
  check('4) 틀린 비밀번호는 접속 여부 노출 없이 401', bad.status === 401 && !bad.json?.code, `status=${bad.status}`);

  // 가계부 분리: member2 가 거래 생성 → member1(id2) 에게 안 보임
  const cats = await call('GET', '/ledger/categories', t1);
  const catId = cats.json?.[0]?.id;
  const mk = await call('POST', '/ledger', t1, { type: 'expense', amount: 1234, categoryId: catId, date: '2026-10-15', memo: 'LIVE-TEST' });
  check('5) member2 거래 생성', mk.status === 201, `status=${mk.status}`);
  const u2 = await prisma.user.findUnique({ where: { id: 2 } });
  const t2 = jwt.sign({ userId: 2, role: u2.role, pwAt: new Date(u2.passwordChangedAt).getTime(), sn: u2.sessionNonce }, process.env.JWT_SECRET, { expiresIn: '2m' });
  const list2 = await call('GET', '/ledger?year=2026&month=10', t2);
  check('6) member1 가계부에는 member2 거래가 보이지 않음', list2.status === 200 && list2.json.entries.every((e) => e.memo !== 'LIVE-TEST'), `n=${list2.json?.entries?.length}`);
  const del2 = await call('DELETE', `/ledger/${mk.json.id}`, t2);
  check('7) member1 이 member2 거래 삭제 시도 → 404', del2.status === 404, `status=${del2.status}`);
  const upd2 = await call('PUT', `/ledger/${mk.json.id}`, t2, { amount: 1 });
  check('8) member1 이 member2 거래 수정 시도 → 404', upd2.status === 404, `status=${upd2.status}`);
  const sum2 = await call('GET', '/ledger/summary?year=2026&month=10', t2);
  check('9) member1 요약 집계에 member2 거래 미포함', sum2.json.thisMonth.expense === 0, `expense=${sum2.json.thisMonth.expense}`);
  const mine = await call('GET', '/ledger?year=2026&month=10', t1);
  check('10) member2 본인 목록에는 보임', mine.json.entries.some((e) => e.memo === 'LIVE-TEST'));
  const delMine = await call('DELETE', `/ledger/${mk.json.id}`, t1);
  check('11) member2 본인 거래 삭제 성공', delMine.status === 200);

  // 로그아웃 → 즉시 재로그인 가능
  const lo = await call('POST', '/auth/logout', t1);
  check('12) 로그아웃 성공', lo.status === 200);
  const l3 = await login();
  check('13) 로그아웃 직후 재로그인 가능', l3.status === 200, `status=${l3.status}`);
  const stale = await call('GET', '/auth/me', t1);
  check('14) 로그아웃한 옛 토큰은 무효(401)', stale.status === 401, `status=${stale.status}`);

  // 관리자 강제 로그아웃
  const a = await prisma.user.findUnique({ where: { id: 1 } });
  const ta = jwt.sign({ userId: 1, role: 'admin', pwAt: new Date(a.passwordChangedAt).getTime(), sn: a.sessionNonce }, process.env.JWT_SECRET, { expiresIn: '2m' });
  const l4 = await login();
  check('15) 접속 중인 member2 재로그인 → 409', l4.status === 409);
  const fl = await call('PATCH', '/users/3/force-logout', ta);
  check('16) 관리자 강제 로그아웃 성공', fl.status === 200, `status=${fl.status}`);
  const l5 = await login();
  check('17) 강제 로그아웃 후 로그인 가능', l5.status === 200, `status=${l5.status}`);
  const noAdmin = await call('PATCH', '/users/3/force-logout', l5.json?.token);
  check('18) 일반 사용자는 강제 로그아웃 불가(403)', noAdmin.status === 403, `status=${noAdmin.status}`);

  // 원복: 로그아웃 (lastActiveAt null)
  if (l5.json?.token) await call('POST', '/auth/logout', l5.json.token);
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'user_prefs_3' } } });
  console.log(out.join('\n'));
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(1); });
