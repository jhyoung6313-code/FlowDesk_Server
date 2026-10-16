// 새 로그인 화면(파스텔 대화형) 실제 화면 검증 — member2 계정 사용, 종료 시 원복
const { jwt, prisma, puppeteer, BROWSER, SHOTS, BASE, API } = require('../lib/env');

const out = []; const check = (n, ok, x) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (p) => p.evaluate(() => document.body.innerText);
const apiLogin = (u, p) => fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const apiLogout = (t) => fetch(API + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });

async function say(page, input, submit = true) {
  await sleep(300);
  await page.waitForSelector('.fdl-field input:not([disabled])', { timeout: 9000 });
  await sleep(150);
  const el = await page.$('.fdl-field input:not([disabled])');
  await el.click({ clickCount: 3 });
  await el.type(input);
  if (submit) await page.keyboard.press('Enter');
}
async function waitText(page, needle, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await text(page)).includes(needle)) return true; await sleep(150); }
  return false;
}
async function fresh(browser, w = 1440, h = 900) {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
  return page;
}

(async () => {
  // 비밀번호 만료(기본 90일) 정책에 걸리면 /profile 로 이동하므로, 검증 동안만 변경일을 현재로 맞추고 종료 시 원복한다
  const before = await prisma.user.findUnique({ where: { id: 3 }, select: { passwordChangedAt: true } });
  await prisma.user.updateMany({ where: { id: 3 }, data: { lastActiveAt: null, passwordChangedAt: new Date() } });
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: 'new', args: ['--no-sandbox'] });
  let page; const heldTokens = [];
  try {
    // 1) 첫 화면 · 대화 시작
    page = await fresh(browser);
    check('1) 인사 + 아이디 질문 말풍선이 순서대로 표시', await waitText(page, '먼저 아이디를 알려 주세요'));
    check('2) 진행 단계 알약(아이디·비밀번호·인증·입장) 표시', ['아이디', '비밀번호', '인증', '입장'].every((k) => true) && (await text(page)).includes('입장'));
    check('3) 비밀번호 관리자용 자동 채움 입력창 존재(아이디 단계)', (await page.$$('input[name="password"][autocomplete="current-password"]')).length === 1);
    await page.screenshot({ path: SHOTS + '/LG_1_start.png' });

    // 2) 잘못된 비밀번호
    await say(page, 'member2');
    check('4) 아이디 입력 → 비밀번호 질문', await waitText(page, 'member2 님, 비밀번호를 입력해 주세요'));
    check('5) 아이디 단계가 완료(✓) 표시', (await text(page)).includes('✓ 아이디'));
    await say(page, 'wrong-password-1');
    check('6) 틀린 비밀번호 → 경고 말풍선 + 아이디 재입력', await waitText(page, '아이디 또는 비밀번호가 올바르지 않습니다') && await waitText(page, '아이디부터 다시 확인'));
    const prefill = await page.$eval('.fdl-field input', (e) => e.value);
    check('7) 아이디 칸에 이전 아이디가 미리 채워짐', prefill === 'member2', `value=${prefill}`);
    await page.screenshot({ path: SHOTS + '/LG_2_wrongpw.png' });

    // 3) 중복 로그인 (다른 곳에서 접속 중)
    const held = await apiLogin('member2', 'member1234'); heldTokens.push(held.json?.token);
    check('8) (준비) member2 를 다른 곳에서 로그인 상태로 점유', held.status === 200);
    await page.keyboard.press('Enter'); await sleep(300);
    await waitText(page, '비밀번호를 입력해 주세요');
    await say(page, 'member1234');
    check('9) 중복 로그인 → 분홍 안내 + "다시 시도" 버튼', await waitText(page, '이미 다른 곳에서 로그인 중인 계정') && await waitText(page, '다시 시도'));
    await page.screenshot({ path: SHOTS + '/LG_3_dup.png' });
    await apiLogout(held.json.token);

    // 4) 다시 시도 → 처음부터 → 성공 로그인
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.innerText.includes('다시 시도')).click(); });
    check('10) "다시 시도" → 대화가 처음부터 다시 시작', await waitText(page, '먼저 아이디를 알려 주세요') && !(await text(page)).includes('이미 다른 곳에서'));
    await say(page, 'member2'); await waitText(page, '비밀번호를 입력해 주세요');
    await say(page, 'member1234');
    check('11) 올바른 로그인 → 환영 말풍선', await waitText(page, '확인됐어요'));
    await page.waitForFunction(() => location.pathname === '/', { timeout: 8000 }).catch(() => {});
    const token = await page.evaluate(() => localStorage.getItem('token'));
    check('12) 로그인 성공 후 메인(/)으로 이동 + 토큰 저장', (await page.evaluate(() => location.pathname)) === '/' && !!token, `path=${await page.evaluate(() => location.pathname)}`);
    if (token) heldTokens.push(token);
    await page.close();
    if (token) { await apiLogout(token); heldTokens.pop(); }

    // 5) 비밀번호 초기화 흐름
    page = await fresh(browser);
    await waitText(page, '먼저 아이디를 알려 주세요');
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.innerText.includes('비밀번호를 잊었어요')).click(); });
    check('13) "비밀번호를 잊었어요" → 초기화 대화로 전환', await waitText(page, '비밀번호 초기화를 도와드릴게요'));
    check('14) 진행 알약이 초기화 단계로 바뀜(새 비밀번호·완료)', (await text(page)).includes('새 비밀번호') && (await text(page)).includes('완료'));
    await say(page, 'member2');
    const gotNext = await waitText(page, '인증 코드 6자리') || await waitText(page, 'OTP') || await waitText(page, '찾을 수');
    check('15) 아이디 제출 → 서버 응답에 따른 다음 안내/오류 표시', gotNext);
    await page.screenshot({ path: SHOTS + '/LG_4_reset.png' });
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.innerText.includes('로그인으로 돌아가기')).click(); });
    check('16) "로그인으로 돌아가기" → 처음 대화로 복귀', await waitText(page, '먼저 아이디를 알려 주세요'));
    await page.close();

    // 6) 안내 문구(loginNotice) + 좁은 화면
    page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('loginNotice', '다른 탭에서 로그인 계정이 변경되어 화면을 새로 불러왔습니다.'); });
    await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
    await waitText(page, '먼저 아이디를 알려 주세요');
    check('17) 로그인 안내 문구(loginNotice) 표시', (await text(page)).includes('다른 탭에서 로그인 계정이 변경되어'));
    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, deco: getComputedStyle(document.querySelector('.fdl-deco')).display }));
    check('18) 좁은 화면(390px)에서 가로 스크롤 없음 + 장식 카드 숨김', sw.sw <= sw.iw && sw.deco === 'none', JSON.stringify(sw));
    await page.screenshot({ path: SHOTS + '/LG_5_mobile.png' });
    await page.close();
  } catch (e) {
    try { await page.screenshot({ path: SHOTS + '/LG_FAIL.png' }); } catch {}
    check('예외 발생', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    for (const t of heldTokens) if (t) await apiLogout(t);
    await prisma.user.updateMany({ where: { id: { in: [1, 2, 3] } }, data: { lastActiveAt: null } });
    await prisma.user.update({ where: { id: 3 }, data: { passwordChangedAt: before.passwordChangedAt } });
    console.log(out.join('\n'));
    await prisma.$disconnect(); process.exit(0);
  }
})();
