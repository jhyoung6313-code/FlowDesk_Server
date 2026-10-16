// OTP 전사 강제(sec_enforce_otp=true) 환경의 로그인 화면 검증 — OTP 최초 등록(QR) · OTP 인증 · 비밀번호 초기화(OTP → 새 비밀번호)
// 개발 DB 는 OTP 강제가 꺼져 있어(sec_enforce_otp=false) 이 흐름이 나오지 않으므로, 이 스위트가 설정을 잠시 켜고 같은 DB 를 쓰는 보조 백엔드(4001, 스케줄러 끔)와
// 보조 프런트(3001)를 이 스위트가 직접 띄우고 끝나면 종료한다. member2 의 비밀번호·OTP 상태는 종료 시 원래대로 복원한다.
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const { prisma, puppeteer, BROWSER, SHOTS, BACKEND, backendRequire } = require('../lib/env');

const { authenticator } = backendRequire('otplib');
const FRONTEND = path.resolve(BACKEND, '../frontend');
const API_PORT = 4001; const WEB_PORT = 3001;
const WEB = `http://localhost:${WEB_PORT}`; const API2 = `http://localhost:${API_PORT}/api`;
const USER = 'member2'; const PW = 'member1234'; const NEW_PW = 'Fd!Reset2026zzA';
const MEMBER2 = 3;

const out = []; const check = (n, ok, x) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (p) => p.evaluate(() => document.body.innerText);
async function waitText(page, needle, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await text(page)).includes(needle)) return true; await sleep(150); } return false; }
async function say(page, input) {
  await sleep(350);
  await page.waitForSelector('.fdl-field input:not([readonly])', { timeout: 10000 });
  await sleep(150);
  const el = await page.$('.fdl-field input:not([readonly])');
  await el.click({ clickCount: 3 }); await el.type(input); await page.keyboard.press('Enter');
}
const ping = (url) => new Promise((resolve) => { http.get(url, (r) => { r.resume(); resolve(r.statusCode < 500); }).on('error', () => resolve(false)); });
async function waitUp(url, ms = 60000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ping(url)) return true; await sleep(500); } return false; }
const code = async () => authenticator.generate((await prisma.user.findUnique({ where: { id: MEMBER2 } })).totpSecret);
const apiLogin = (u, p) => fetch(API2 + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

(async () => {
  const procs = [];
  const snap = await prisma.user.findUnique({ where: { id: MEMBER2 } });
  const histBefore = await prisma.passwordHistory.findMany({ where: { userId: MEMBER2 }, select: { id: true } });
  // OTP 강제 여부는 환경변수보다 DB 의 보안 설정(sec_enforce_otp, 관리자 화면에서 변경)이 우선한다 → 테스트 동안만 켠다
  const enforceRow = await prisma.appSetting.findUnique({ where: { key: 'sec_enforce_otp' } });
  let browser; let page;
  try {
    await prisma.appSetting.upsert({ where: { key: 'sec_enforce_otp' }, create: { key: 'sec_enforce_otp', value: 'true' }, update: { value: 'true' } });
    // 테스트용 상태: OTP 미등록, 비밀번호 만료 아님, 잠금·접속 표시 없음
    await prisma.user.update({ where: { id: MEMBER2 }, data: { totpEnabled: false, totpSecret: null, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, lastActiveAt: null } });

    procs.push(spawn(process.execPath, ['src/app.js'], { cwd: BACKEND, env: { ...process.env, PORT: String(API_PORT), ENFORCE_OTP: 'true', DISABLE_SCHEDULERS: 'true' }, stdio: 'ignore' }));
    procs.push(spawn(process.execPath, [path.join(FRONTEND, 'node_modules/vite/bin/vite.js'), '--strictPort'], { cwd: FRONTEND, env: { ...process.env, VITE_PORT: String(WEB_PORT), VITE_API_TARGET: `http://127.0.0.1:${API_PORT}` }, stdio: 'ignore' }));
    const up = (await waitUp(`http://127.0.0.1:${API_PORT}/health`)) && (await waitUp(`${WEB}/`));
    check('0) 보조 서버(백엔드 4001 · 프런트 3001) 기동', up);
    if (!up) throw new Error('보조 서버가 시작되지 않았습니다.');

    browser = await puppeteer.launch({ executablePath: BROWSER, headless: 'new', args: ['--no-sandbox'] });
    const fresh = async () => {
      const p = await browser.newPage(); await p.setViewport({ width: 1400, height: 900 });
      await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
      await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await p.goto(WEB + '/login', { waitUntil: 'networkidle2' });
      await waitText(p, '먼저 아이디를 알려 주세요');
      return p;
    };

    // ── 1) 최초 로그인: OTP 등록(QR) ──
    page = await fresh();
    await say(page, USER); await waitText(page, '비밀번호를 입력해 주세요');
    await say(page, PW);
    check('1) OTP 미등록 계정 → OTP 등록 안내 말풍선', await waitText(page, '2단계 인증(OTP) 등록이 필요해요'));
    const qrOk = await page.waitForSelector('.fdl-qr img', { timeout: 8000 }).then(() => page.$eval('.fdl-qr img', (i) => i.src.startsWith('data:image') && i.naturalWidth > 0)).catch(() => false);
    check('2) QR 코드 이미지 표시', qrOk);
    await waitText(page, '6자리 코드를 입력해 주세요');
    await page.screenshot({ path: SHOTS + '/OTP_1_setup.png' });
    const good = await code();
    await say(page, good === '000000' ? '111111' : '000000');
    check('3) 틀린 OTP 코드 → 오류 말풍선', await waitText(page, '코드를 다시 입력해 주세요'));
    await say(page, await code());
    check('4) 올바른 OTP 코드 → 환영 말풍선 후 메인 이동', await waitText(page, '확인됐어요'));
    await page.waitForFunction(() => location.pathname !== '/login', { timeout: 10000 }).catch(() => {});
    check('5) 로그인 후 로그인 화면을 벗어남 + 토큰 저장', (await page.evaluate(() => location.pathname)) !== '/login' && !!(await page.evaluate(() => localStorage.getItem('token'))));
    const after = await prisma.user.findUnique({ where: { id: MEMBER2 } });
    check('6) DB 에 OTP 활성화 기록 (totpEnabled=true)', after.totpEnabled === true && !!after.totpSecret);
    const tok = await page.evaluate(() => localStorage.getItem('token'));
    await fetch(API2 + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } });
    await page.close();

    // ── 2) 재로그인: OTP 인증 ──
    page = await fresh();
    await say(page, USER); await waitText(page, '비밀번호를 입력해 주세요');
    await say(page, PW);
    check('7) OTP 등록된 계정 → OTP 코드 입력 안내(QR 없음)', await waitText(page, '인증 앱에 표시된 6자리 코드') && (await page.$('.fdl-qr')) === null);
    check('8) OTP 단계에 "다른 계정으로 로그인" 칩', (await text(page)).includes('다른 계정으로 로그인'));
    await page.screenshot({ path: SHOTS + '/OTP_2_verify.png' });
    await say(page, '000000');
    check('9) 틀린 코드 → 오류 말풍선', await waitText(page, '올바르지 않'));
    await say(page, await code());
    check('10) 올바른 코드 → 로그인 성공', await waitText(page, '확인됐어요'));
    await page.waitForFunction(() => location.pathname !== '/login', { timeout: 10000 }).catch(() => {});
    const tok2 = await page.evaluate(() => localStorage.getItem('token'));
    await fetch(API2 + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tok2 } });
    await page.close();

    // ── 3) 비밀번호 초기화: 아이디 → OTP → 새 비밀번호 → 확인 ──
    page = await fresh();
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.innerText.includes('비밀번호를 잊었어요')).click(); });
    await waitText(page, '아이디를 알려 주세요');
    await say(page, USER);
    check('11) 초기화: 아이디 제출 → OTP 코드 요청', await waitText(page, '인증 코드 6자리'));
    await say(page, await code());
    check('12) 초기화: OTP 통과 → 새 비밀번호 안내', await waitText(page, '새 비밀번호를 정해 주세요'));
    check('13) 새 비밀번호 단계에서 조건 칩 표시', (await text(page)).includes('영문 대문자') && (await text(page)).includes('특수문자'));
    await page.screenshot({ path: SHOTS + '/OTP_3_reset_new.png' });
    await say(page, 'abc');
    check('14) 규칙에 맞지 않는 비밀번호 → 경고 말풍선', await waitText(page, '조건을 만족하지 않아요'));
    await say(page, NEW_PW); await waitText(page, '한 번 더 입력해 주세요');
    await say(page, NEW_PW + 'x');
    check('15) 확인 입력이 다르면 → 불일치 안내 후 새 비밀번호 단계로 복귀', await waitText(page, '두 비밀번호가 달라요'));
    await say(page, NEW_PW); await waitText(page, '한 번 더 입력해 주세요', 8000);
    await sleep(500);
    await say(page, NEW_PW);
    check('16) 확인까지 일치 → 비밀번호 변경 완료 말풍선 + 로그인 버튼', await waitText(page, '비밀번호가 변경됐어요') && await waitText(page, '로그인하러 가기'));
    await page.screenshot({ path: SHOTS + '/OTP_4_reset_done.png' });
    const afterReset = await prisma.user.findUnique({ where: { id: MEMBER2 } });
    check('17) DB 비밀번호가 실제로 변경됨 + 이력 기록', afterReset.passwordHash !== snap.passwordHash
      && (await prisma.passwordHistory.count({ where: { userId: MEMBER2 } })) > histBefore.length);
    await page.close();
    const oldPw = await apiLogin(USER, PW);
    check('18) 이전 비밀번호로는 로그인 불가(401)', oldPw.status === 401, `status=${oldPw.status}`);
    const newPw = await apiLogin(USER, NEW_PW);
    check('19) 새 비밀번호로는 통과하고 OTP 단계로 진행', newPw.status === 200 && newPw.json?.requireTotp === true, `status=${newPw.status}`);
  } catch (e) {
    try { await page.screenshot({ path: SHOTS + '/OTP_FAIL.png' }); } catch { /* 무시 */ }
    check('예외 발생', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    try { await browser?.close(); } catch { /* 무시 */ }
    procs.forEach((p) => { try { p.kill(); } catch { /* 무시 */ } });
    // member2 를 원래 상태로 복원 (비밀번호·OTP·만료일·접속 표시) 하고 이 스위트가 만든 비밀번호 이력은 삭제
    await prisma.user.update({
      where: { id: MEMBER2 },
      data: {
        passwordHash: snap.passwordHash, passwordChangedAt: snap.passwordChangedAt, totpEnabled: snap.totpEnabled, totpSecret: snap.totpSecret,
        mustChangePassword: snap.mustChangePassword, failedLoginCount: 0, lockedUntil: null, sessionNonce: snap.sessionNonce, lastActiveAt: null,
      },
    });
    await prisma.passwordHistory.deleteMany({ where: { userId: MEMBER2, id: { notIn: histBefore.map((h) => h.id) } } });
    if (enforceRow) await prisma.appSetting.update({ where: { key: 'sec_enforce_otp' }, data: { value: enforceRow.value } });
    else await prisma.appSetting.deleteMany({ where: { key: 'sec_enforce_otp' } });
    await prisma.appSetting.deleteMany({ where: { key: { in: [`user_prefs_${MEMBER2}`, `theme_prefs_${MEMBER2}`] } } });
    console.log(out.join('\n'));
    await prisma.$disconnect(); process.exit(0);
  }
})();
