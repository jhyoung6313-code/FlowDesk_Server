// 헤드리스 Edge 로 실제 화면 동작을 검증한다. 로그인 토큰은 DB 의 현재 세션 nonce 로 서명해 localStorage 에 주입하므로
// 사용자의 실제 브라우저 세션(admin/member1)을 끊지 않는다. 종료 시 테스트 데이터를 원복한다.
const { jwt, prisma, puppeteer, BROWSER, SHOTS, BASE, API } = require('../lib/env');

const out = [];
const check = (name, ok, extra) => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tokenFor(id) {
  const u = await prisma.user.findUnique({ where: { id } });
  return jwt.sign({ userId: id, role: u.role, pwAt: new Date(u.passwordChangedAt).getTime(), sn: u.sessionNonce }, process.env.JWT_SECRET, { expiresIn: '20m' });
}
async function api(method, url, token, body) {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function openAs(browser, token, url = '/') {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900 });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('NAV', f.url().replace(BASE, '')); });
  page.on('response', (r) => { if (r.status() >= 400) console.log(r.status(), '<-', r.request().method(), r.url().replace('http://localhost:3000', ''), 'page#' + (global.__n = (global.__n || 0))); });
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('notification_shown_ids', JSON.stringify(Array.from({ length: 500 }, (_, i) => i + 1))); localStorage.setItem('token', t); }, token);
  await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 30000 });
  return page;
}
const clickByText = async (page, selector, text) => {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const t = await page.evaluate((el) => el.innerText || el.textContent || '', h);
    if (t.includes(text)) { await h.click(); return true; }
  }
  return false;
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
  });
  const t1 = await tokenFor(1); const t2 = await tokenFor(2); const t3 = await tokenFor(3);
  let page;
  try {
    // ── A. 레일 메뉴 편집 (member1) ──
    page = await openAs(browser, t2, '/');
    await page.waitForSelector('.flowdesk-sider', { timeout: 15000 });
    const railCount = () => page.evaluate(() => document.querySelector('.flowdesk-sider > div').children.length);
    const before = await railCount();
    const more = await page.$('[title="전체 메뉴"]');
    check('A1) 레일에 "⋯ 전체 메뉴" 버튼 존재', !!more);
    await more.click(); await sleep(400);
    let txt = await bodyText(page);
    check('A2) 전체 메뉴에 위키·회의·OKR·가계부 등 노출', ['위키', '회의', 'OKR', '가계부', '문서함'].every((k) => txt.includes(k)));
    await page.screenshot({ path: SHOTS + '/A2_all_menu.png' });
    check('A3) "메뉴 편집" 버튼 존재', await clickByText(page, 'button', '메뉴 편집')); await sleep(500);
    await page.screenshot({ path: SHOTS + '/A3_edit_modal.png' });
    // 위키 체크
    const labels = await page.$$('.ant-modal .ant-checkbox-wrapper');
    let clicked = false;
    for (const l of labels) { const t = await page.evaluate((e) => e.innerText, l); if (t.trim() === '위키') { await l.click(); clicked = true; } }
    check('A4) 모달에서 위키 체크', clicked); await sleep(900);
    await clickByText(page, '.ant-modal button', '완료'); await sleep(700);
    const after = await railCount();
    check('A5) 레일 아이콘이 1개 늘어남', after === before + 1, `before=${before} after=${after}`);
    const prefs = await api('GET', '/settings/preferences', t2);
    check('A6) 서버(preferences)에 저장됨', Array.isArray(prefs.json?.nav?.pinned) && prefs.json.nav.pinned.includes('/wiki'), JSON.stringify(prefs.json));
    await page.reload({ waitUntil: 'networkidle2' }); await page.waitForSelector('.flowdesk-sider');
    check('A7) 새로고침 후에도 유지', (await railCount()) === after);

    await sleep(30000);   // 일반 API 속도 제한(분당 300회) 회피
    // ── B. 대시보드 위젯 추가 (member1) ──
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForSelector('.anticon-edit', { timeout: 15000 });
    await (await page.$('.anticon-edit')).click(); await sleep(500);
    txt = await bodyText(page);
    check('B1) 편집 모드에 추가 위젯 버튼 5종 노출', ['오늘 한눈에', '결재 대기', '오늘 회의', '액션아이템', 'OKR 진척'].every((k) => txt.includes(k)));
    check('B2) "+ 오늘 한눈에" 추가', await clickByText(page, 'button', '오늘 한눈에')); await sleep(1200);
    check('B3) "+ 결재 대기" 추가', await clickByText(page, 'button', '결재 대기')); await sleep(1200);
    await page.screenshot({ path: SHOTS + '/B_dashboard_edit.png' });
    await (await page.$('.anticon-check')).click(); await sleep(1500);
    txt = await bodyText(page);
    check('B4) 위젯 본문 표시 (신규 위젯 제목 + 건수 라벨)', txt.includes('오늘 한눈에') && txt.includes('안읽은 메일'));
    await page.screenshot({ path: SHOTS + '/B_dashboard_view.png' });
    const lay = await api('GET', '/settings/dashboard-layout', t2);
    check('B5) 서버에 레이아웃 저장 (x-counts, x-approvals 활성)', lay.json?.enabled?.['x-counts'] === true && lay.json?.enabled?.['x-approvals'] === true);
    await page.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
    check('B6) 새로고침 후에도 위젯 유지', (await bodyText(page)).includes('안읽은 메일'));
    await page.close();

    await sleep(30000);   // 일반 API 속도 제한(분당 300회) 회피
    // ── C. 관리자: 사용자 관리 접속 중 표시 + 강제 로그아웃 (대상 member2) ──
    await api('GET', '/auth/me', t3);   // member2 활동 기록
    page = await openAs(browser, t1, '/admin/users');
    await page.waitForSelector('.ant-table', { timeout: 15000 }); await sleep(800);
    txt = await bodyText(page);
    check('C1) 사용자 목록에 "접속 중" 태그 표시', txt.includes('접속 중'));
    const fbtn = await page.$$('[title="강제 로그아웃"]');
    check('C2) 접속 중 계정에 "강제 로그아웃" 버튼 표시', fbtn.length >= 1, `n=${fbtn.length}`);
    await page.screenshot({ path: SHOTS + '/C_users.png' });
    // member2 행의 버튼을 눌러야 하므로 행 단위로 찾는다
    const rowIdx = await page.evaluate(() => [...document.querySelectorAll('.ant-table-tbody tr')].findIndex((tr) => tr.innerText.includes('member2') && tr.querySelector('[title="강제 로그아웃"]')));
    check('C3) member2 행에 강제 로그아웃 버튼', rowIdx >= 0);
    if (rowIdx >= 0) {
      await page.evaluate((i) => document.querySelectorAll('.ant-table-tbody tr')[i].querySelector('[title="강제 로그아웃"]').closest('button').click(), rowIdx);
      await sleep(500);
      await clickByText(page, '.ant-popover button, .ant-popconfirm button', '강제 종료'); await sleep(1200);
      const me3 = await api('GET', '/auth/me', t3);
      check('C4) 강제 종료 후 member2 토큰 무효(401)', me3.status === 401, `status=${me3.status}`);
    }
    await page.close();

    await sleep(30000);   // 일반 API 속도 제한(분당 300회) 회피
    await sleep(30000);   // 일반 API 속도 제한(분당 300회) 회피
    // ── E. 탭 간 계정 전환 감지 (같은 브라우저 컨텍스트의 두 탭) ──
    const pa = await openAs(browser, t2, '/');
    await pa.waitForSelector('.flowdesk-sider'); await sleep(800);
    await pa.evaluate(() => { window.__marker = 'tabA-alive'; });
    const pb = await browser.newPage();
    await pb.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await pb.evaluate((t) => localStorage.setItem('token', t), t1);   // 다른 탭에서 admin 으로 계정 변경
    await sleep(2500);
    const marker = await pa.evaluate(() => window.__marker).catch(() => 'navigated');
    check('E1) 다른 탭에서 계정이 바뀌면 이 탭이 자동 새로고침', marker !== 'tabA-alive', `marker=${marker}`);
    await pa.waitForSelector('.flowdesk-sider', { timeout: 15000 }).catch(() => {});
    const tokenNow = await pa.evaluate(() => localStorage.getItem('token'));
    check('E2) 새로고침 후 새 계정(admin) 토큰으로 동작', JSON.parse(Buffer.from(tokenNow.split('.')[1], 'base64').toString()).userId === 1);
    await pa.close(); await pb.close();

    await sleep(30000);   // 일반 API 속도 제한(분당 300회) 회피
    // ── F. 로그아웃 → 로그인 화면 + 로컬 설정 초기화 ──
    page = await openAs(browser, await tokenFor(3), '/');
    await page.waitForSelector('.flowdesk-sider'); await sleep(800);
    await page.evaluate(() => { window.__m = 'alive'; });
    const av = await page.$('.flowdesk-sider .ant-avatar');
    await av.click(); await sleep(500);
    await clickByText(page, '.ant-dropdown li, .ant-dropdown-menu-item', '로그아웃'); await sleep(2500);
    check('F1) 로그아웃 후 /login 으로 이동', page.url().includes('/login'), page.url());
    const ls = await page.evaluate(() => ({ token: localStorage.getItem('token'), nav: localStorage.getItem('flowdesk_nav_pinned'), skin: localStorage.getItem('flowdesk_skin') }));
    check('F2) 토큰·메뉴·테마 로컬 캐시 삭제', !ls.token && !ls.nav && !ls.skin, JSON.stringify(ls));
    const fresh = await page.evaluate(() => window.__m).catch(() => 'navigated');
    check('F3) 페이지가 새로 로드되어 이전 화면 상태가 비워짐', fresh !== 'alive');
    await page.close();
  } catch (e) {
    try { if (page) await page.screenshot({ path: SHOTS + '/FAIL.png' }); console.log('URL:', page && page.url()); } catch {}
    check('예외 발생', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    // 원복
    await prisma.appSetting.deleteMany({ where: { key: { in: ['user_prefs_2', 'dashboard_layout_2', 'theme_prefs_2', 'user_prefs_3', 'dashboard_layout_3', 'theme_prefs_3'] } } });
    await prisma.user.updateMany({ where: { id: { in: [1, 2, 3] } }, data: { lastActiveAt: null } });
    console.log(out.join('\n'));
    await prisma.$disconnect();
    process.exit(0);
  }
})();
