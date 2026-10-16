// 코드리뷰 6회차 수정 사항 실화면 검증 (member1 토큰 주입 + member2 로그인 화면), 종료 시 원복
const { jwt, prisma, puppeteer, BROWSER, SHOTS, BASE, API } = require('../lib/env');

const out = []; const check = (n, ok, x) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (p) => p.evaluate(() => document.body.innerText);
async function waitText(page, needle, ms = 7000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await text(page)).includes(needle)) return true; await sleep(150); } return false; }

(async () => {
  const u = await prisma.user.findUnique({ where: { id: 2 } });
  const token = jwt.sign({ userId: 2, role: u.role, pwAt: new Date(u.passwordChangedAt).getTime(), sn: u.sessionNonce }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const api = async (m, url, body) => { const r = await fetch(API + url, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: 'new', args: ['--no-sandbox'] });
  let page; let restoreTask = null;
  const open = async (url) => {
    const p = await browser.newPage(); await p.setViewport({ width: 1500, height: 940 });
    await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await p.evaluate((t) => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('notification_shown_ids', JSON.stringify(Array.from({ length: 600 }, (_, i) => i + 1))); localStorage.setItem('token', t); }, token);
    await p.goto(BASE + url, { waitUntil: 'networkidle2' });
    return p;
  };
  try {
    // ── 서버 검증 ──
    let r = await api('PUT', '/settings/preferences', { home: { layout: 'evil' } });
    check('1) 서버: 알 수 없는 홈 레이아웃 저장 거부(400)', r.status === 400, r.json?.error);
    r = await api('PUT', '/settings/preferences', { home: { layout: 'board', scope: 'everyone' } });
    check('2) 서버: 알 수 없는 업무 범위 거부(400)', r.status === 400, r.json?.error);
    r = await api('PUT', '/settings/preferences', { home: { layout: 'board', scope: 'all' } });
    check('3) 서버: 올바른 값은 저장(200)', r.status === 200);

    // ── 업무 범위 전환 ──
    page = await open('/');
    await page.waitForSelector('[role="group"][aria-label="업무 범위"]', { timeout: 15000 });
    let t = await text(page);
    check('4) 보드 레이아웃에 "전체 업무 / 내 담당" 전환이 있고 기본은 전체', t.includes('전체 업무') && t.includes('내 담당'));
    const colCount = () => page.evaluate(() => [...document.querySelectorAll('section')].reduce((s, sec) => { const h = sec.querySelector('h2'); const n = sec.querySelectorAll('article').length; return s + (h ? n : 0); }, 0));
    const allCards = await colCount();
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '내 담당').click());
    await sleep(1800);
    const mineCards = await colCount();
    check('5) "내 담당"으로 바꾸면 카드가 담당·작성 업무로 줄어듦', mineCards < allCards, `전체=${allCards} 내담당=${mineCards}`);
    const pref = await api('GET', '/settings/preferences');
    check('6) 범위 선택이 서버에 저장 (home.scope=mine)', pref.json?.home?.scope === 'mine', JSON.stringify(pref.json?.home));
    await page.screenshot({ path: SHOTS + '/FX_scope.png' });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '전체 업무').click());
    await sleep(1500);

    // ── 칸반: 키보드·터치용 상태 선택 + 낙관적 갱신 ──
    const tasks = (await api('GET', '/tasks')).json || [];
    const cand = tasks.find((x) => x.status === 'pending' && x.delYn !== '1');
    if (cand) {
      restoreTask = cand.id;
      const selSel = `select[aria-label="${cand.title} 상태 변경"]`;
      await page.waitForSelector(selSel, { timeout: 8000 });
      await page.select(selSel, 'in_progress');
      await sleep(250);   // 서버 응답·재조회 전에 이미 새 컬럼에 보여야 함(낙관적 갱신)
      const inInProgress = await page.evaluate((title) => {
        const col = [...document.querySelectorAll('section')].find((s) => s.querySelector('h2') && s.querySelector('h2').innerText.trim() === '진행중');
        return !!col && [...col.querySelectorAll('article')].some((a) => a.innerText.includes(title));
      }, cand.title);
      check('7) 상태 선택 직후(응답 전) 카드가 진행중 컬럼에 즉시 표시', inInProgress);
      await sleep(1500);
      const after = (await api('GET', `/tasks/${cand.id}`)).json;
      check('8) 서버에도 진행중으로 반영', after?.status === 'in_progress', `status=${after?.status}`);
    } else check('7~8) 대기 업무 없음 — 건너뜀', true);
    await page.close();

    // ── 업무 상세 딥링크 ──
    const any = tasks.find((x) => x.delYn !== '1');
    page = await open(`/tasks?taskId=${any.id}`);
    const opened = await waitText(page, any.title, 8000) && (await page.$('.ant-drawer-open, .ant-drawer')) !== null;
    const drawerTxt = await page.evaluate(() => (document.querySelector('.ant-drawer') || {}).innerText || '');
    check('9) /tasks?taskId=N 로 들어오면 해당 업무 상세가 열림', opened && drawerTxt.includes(any.title), `title=${any.title}`);
    await page.screenshot({ path: SHOTS + '/FX_deeplink.png' });
    await page.close();

    // ── 레이아웃 로드 실패 시 복구 ──
    await api('PUT', '/settings/preferences', { home: { layout: 'focus', scope: 'all' } });
    page = await browser.newPage(); await page.setViewport({ width: 1500, height: 940 });
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (req.url().includes('/layouts/FocusHome')) req.abort('failed'); else req.continue(); });
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => { localStorage.clear(); sessionStorage.setItem('notification_shown_ids', JSON.stringify(Array.from({ length: 600 }, (_, i) => i + 1))); localStorage.setItem('token', t); }, token);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    check('10) 레이아웃 코드를 못 불러오면 오류 안내와 복구 버튼 표시(앱 전체 오류 화면 아님)', await waitText(page, '선택한 메인 화면을 불러오지 못했습니다') && (await page.$('.flowdesk-sider')) !== null);
    await page.screenshot({ path: SHOTS + '/FX_boundary.png' });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('기본 대시보드로')).click());
    check('11) "기본 대시보드로" → 기존 대시보드로 복귀', await waitText(page, '오늘의 업무 현황'));
    await sleep(900);
    const pref2 = await api('GET', '/settings/preferences');
    check('12) 복귀 선택이 서버에 저장 (home.layout=classic)', pref2.json?.home?.layout === 'classic', JSON.stringify(pref2.json?.home));
    await page.close();

    // ── 로그인: 자동 채움 안전장치 ──
    page = await browser.newPage(); await page.setViewport({ width: 1400, height: 900 });
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
    await waitText(page, '먼저 아이디를 알려 주세요');
    await sleep(500);
    // 비밀번호 관리자가 member1 의 비밀번호를 채운 상황을 흉내: 아이디 칸에 member1 → 숨은 비밀번호 칸 채움 → 아이디를 admin 으로 바꿔 제출
    const visible = await page.$('.fdl-field input');
    await visible.type('member1');
    await page.evaluate(() => {
      const el = document.querySelector('input.fdl-hidden[name="password"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, 'some-saved-password');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await visible.click({ clickCount: 3 }); await visible.type('admin'); await page.keyboard.press('Enter');
    const askedPw = await waitText(page, 'admin 님, 비밀번호를 입력해 주세요');
    const autoAttempt = (await text(page)).includes('아이디 또는 비밀번호가 올바르지 않습니다');
    check('13) 자동 채움 비밀번호가 있어도 다른 아이디를 입력하면 자동 로그인 시도하지 않고 비밀번호를 물음', askedPw && !autoAttempt);
    await page.screenshot({ path: SHOTS + '/FX_autofill.png' });
    // 요청 진행 중에는 "처음부터" 가 비활성
    await sleep(500);
    const pwInput = await page.$('.fdl-field input:not([readonly])');
    await pwInput.type('wrong-pass-xyz');
    await page.keyboard.press('Enter');
    await sleep(120);
    const restartDisabled = await page.$eval('.fdl-restart', (b) => b.disabled);
    check('14) 로그인 요청·응답 연출 중에는 "처음부터" 버튼이 비활성', restartDisabled);
    await waitText(page, '아이디부터 다시 확인');
    await sleep(500);
    const restartEnabled = await page.$eval('.fdl-restart', (b) => !b.disabled);
    check('15) 응답이 끝나면 "처음부터" 다시 활성', restartEnabled);
    await page.close();
  } catch (e) {
    try { await page.screenshot({ path: SHOTS + '/FX_FAIL.png' }); } catch {}
    check('예외 발생', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    if (restoreTask) await fetch(`${API}/tasks/${restoreTask}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ status: 'pending' }) });
    await prisma.appSetting.deleteMany({ where: { key: { in: ['user_prefs_2', 'dashboard_layout_2', 'theme_prefs_2'] } } });
    await prisma.user.updateMany({ where: { id: { in: [1, 2, 3] } }, data: { lastActiveAt: null } });
    console.log(out.join('\n'));
    await prisma.$disconnect(); process.exit(0);
  }
})();
