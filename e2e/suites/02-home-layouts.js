// 홈 레이아웃 선택(A·C·E·F) 화면 검증 — member1 토큰 주입, 종료 시 원복
const { jwt, prisma, puppeteer, BROWSER, SHOTS, BASE, API } = require('../lib/env');

const out = []; const check = (n, ok, x) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (p) => p.evaluate(() => document.body.innerText);

(async () => {
  const u = await prisma.user.findUnique({ where: { id: 2 } });
  const token = jwt.sign({ userId: 2, role: u.role, pwAt: new Date(u.passwordChangedAt).getTime(), sn: u.sessionNonce }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const api = async (m, url, body) => { const r = await fetch(API + url, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 940 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/favicon')) errors.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  let restoreTask = null; let memoId = null;
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('notification_shown_ids', JSON.stringify(Array.from({ length: 500 }, (_, i) => i + 1))); localStorage.setItem('token', t); }, token);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await page.waitForSelector('.anticon-bg-colors', { timeout: 15000 });
    check('0) 기본 대시보드가 기본값 (교체되지 않음)', (await text(page)).includes('오늘의 포커스') && (await text(page)).includes('오늘의 업무 현황'));

    const findItem = async (label) => {
      for (const it of await page.$$('[role="radio"]')) {
        const t = await page.evaluate((e) => e.innerText, it);
        if (t.includes(label) && await it.isVisible?.().catch(() => true) !== false) return it;
      }
      return null;
    };
    const pick = async (label) => {
      let it = await findItem(label);
      if (!it) { await (await page.$('.anticon-bg-colors')).click(); await sleep(500); it = await findItem(label); }
      await it.click(); await sleep(1800);
    };
    await (await page.$('.anticon-bg-colors')).click(); await sleep(500);
    const pickerTxt = await text(page);
    check('1) 테마 팝오버에 "메인 화면" 5개 선택지', ['기본 대시보드', 'A · 커맨드 센터', 'C · 포커스 모드', 'E · 보드 퍼스트', 'F · 데일리 브리프'].every((k) => pickerTxt.includes(k)));
    await page.screenshot({ path: SHOTS + '/H_picker.png' });

    // A
    await pick('A · 커맨드 센터');
    let t = await text(page);
    check('2) A 커맨드 센터 표시', t.includes('오늘의 포커스') && t.includes('결재 대기') && t.includes('업무 보드') && !t.includes('오늘의 업무 현황'), '(상단 요약바 숨김)');
    await page.screenshot({ path: SHOTS + '/H_A.png' });
    let pref = await api('GET', '/settings/preferences');
    check('3) 선택이 서버에 저장 (home.layout=command)', pref.json?.home?.layout === 'command', JSON.stringify(pref.json?.home));

    // C
    await pick('C · 포커스 모드');
    t = await text(page);
    check('4) C 포커스 모드 표시 (지금 할 일·다음 할 일·오늘 일정)', t.includes('지금 할 일') && t.includes('다음 할 일') && t.includes('오늘 일정'));
    await page.screenshot({ path: SHOTS + '/H_C.png' });
    const timerBefore = await page.evaluate(() => (document.body.innerText.match(/\d\d:\d\d/g) || []).find((x) => x === '25:00'));
    const startBtn = (await page.$$('button')).find(Boolean);
    for (const b of await page.$$('button')) { const bt = await page.evaluate((e) => e.innerText, b); if (bt.includes('집중 시작')) { await b.click(); break; } }
    await sleep(2300);
    const timerAfter = await page.evaluate(() => (document.body.innerText.match(/2[0-4]:\d\d/g) || [])[0]);
    check('5) 집중 타이머가 흐름 (25:00 → 24:xx)', timerBefore === '25:00' && /^24:/.test(timerAfter || ''), `after=${timerAfter}`);
    const memoInput = await page.$('input[aria-label="빠른 메모"]');
    await memoInput.type('E2E-HOME-MEMO'); await page.keyboard.press('Enter'); await sleep(1200);
    const memos = await api('GET', '/memos');
    const mm = (memos.json || []).find((m) => m.content === 'E2E-HOME-MEMO');
    memoId = mm?.id;
    check('6) 빠른 메모가 실제로 저장됨', !!mm);

    // E + 드래그
    await pick('E · 보드 퍼스트');
    t = await text(page);
    check('7) E 보드 퍼스트 표시 (4개 컬럼)', ['대기', '진행중', '보류', '완료'].every((k) => t.includes(k)) && t.includes('카드 추가'));
    await page.screenshot({ path: SHOTS + '/H_E.png' });
    const tasks = (await api('GET', '/tasks')).json || [];
    const cand = tasks.find((x) => x.status === 'pending' && x.delYn !== '1');
    if (cand) {
      restoreTask = cand.id;
      const moved = await page.evaluate((title) => {
        const cards = [...document.querySelectorAll('article[draggable="true"]')];
        const card = cards.find((c) => c.innerText.includes(title));
        const cols = [...document.querySelectorAll('section')].filter((s) => s.querySelector('h2'));
        const target = cols.find((s) => s.querySelector('h2').innerText.trim() === '진행중');
        if (!card || !target) return false;
        const dt = new DataTransfer();
        card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        return true;
      }, cand.title);
      await sleep(1500);
      const after = (await api('GET', `/tasks/${cand.id}`)).json;
      check('8) 카드를 진행중 컬럼에 놓으면 상태 변경', moved && after?.status === 'in_progress', `status=${after?.status}`);
    } else check('8) 드래그 상태변경 (대기 업무 없음 — 건너뜀)', true);

    // F
    await pick('F · 데일리 브리프');
    t = await text(page);
    check('9) F 데일리 브리프 표시', t.includes("TODAY'S BRIEF") && /오늘\s*\d+건/.test(t) && t.includes('진행 현황'));
    await page.screenshot({ path: SHOTS + '/H_F.png' });

    // 새로고침 후 유지 + 기본으로 복귀
    await page.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
    check('10) 새로고침 후에도 선택 유지(F)', (await text(page)).includes("TODAY'S BRIEF"));
    await pick('기본 대시보드');
    t = await text(page);
    check('11) "기본 대시보드"로 되돌리면 기존 화면(위젯 대시보드)', t.includes('오늘의 포커스') && t.includes('오늘의 업무 현황'));
    check('12) 화면 오류·4xx/5xx 응답 없음', errors.length === 0, errors.slice(0, 4).join(' | '));
  } catch (e) {
    try { await page.screenshot({ path: SHOTS + '/H_FAIL.png' }); } catch {}
    check('예외 발생', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    if (restoreTask) await fetch(`${API}/tasks/${restoreTask}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ status: 'pending' }) });
    if (memoId) await fetch(`${API}/memos/${memoId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    await prisma.appSetting.deleteMany({ where: { key: { in: ['user_prefs_2', 'dashboard_layout_2', 'theme_prefs_2'] } } });
    await prisma.user.updateMany({ where: { id: 2 }, data: { lastActiveAt: null } });
    console.log(out.join('\n'));
    await prisma.$disconnect(); process.exit(0);
  }
})();
