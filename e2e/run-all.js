#!/usr/bin/env node
/* e2e 스위트를 순서대로 실행하고 결과를 요약한다.
   사용법:  node run-all.js [--only 01,03] [--skip 07] [--gap 45]
   - 일반 API 는 IP당 분당 300회로 제한되므로(한 화면 로드가 약 40건) 화면 스위트 사이에 --gap 초(기본 45) 쉰다.
   - 어떤 스위트든 FAIL 줄이 있거나 비정상 종료하면 종료 코드 1. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = (opt('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const skip = (opt('--skip') || '').split(',').map((s) => s.trim()).filter(Boolean);
const gapSec = Number(opt('--gap') ?? 45);

const dir = path.join(__dirname, 'suites');
const suites = fs.readdirSync(dir).filter((f) => /^\d\d-.*\.js$/.test(f)).sort()
  .filter((f) => !only.length || only.some((p) => f.startsWith(p)))
  .filter((f) => !skip.some((p) => f.startsWith(p)));
const API_ONLY = (f) => f.startsWith('05') || f.startsWith('06');   // 브라우저를 쓰지 않는 스위트는 간격 불필요

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (file) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(dir, file)], { cwd: __dirname, env: process.env });
  let buf = '';
  p.stdout.on('data', (d) => { buf += d; process.stdout.write(d); });
  p.stderr.on('data', (d) => { buf += d; process.stderr.write(d); });
  p.on('close', (code) => resolve({ file, code, pass: (buf.match(/^PASS /gm) || []).length, fail: (buf.match(/^FAIL /gm) || []).length }));
});

(async () => {
  if (!suites.length) { console.error('실행할 스위트가 없습니다.'); process.exit(2); }
  const results = [];
  for (let i = 0; i < suites.length; i++) {
    console.log(`\n━━━ ${suites[i]} ━━━`);
    results.push(await run(suites[i]));
    if (i < suites.length - 1 && gapSec > 0 && !API_ONLY(suites[i]) && !API_ONLY(suites[i + 1])) {
      console.log(`(속도 제한 회피를 위해 ${gapSec}초 대기)`);
      await sleep(gapSec * 1000);
    }
  }
  console.log('\n━━━ 요약 ━━━');
  let bad = false;
  for (const r of results) {
    const ok = r.fail === 0 && r.pass > 0 && r.code === 0;
    if (!ok) bad = true;
    console.log(`${ok ? '✓' : '✗'} ${r.file}  통과 ${r.pass} / 실패 ${r.fail}${r.code ? `  (종료 코드 ${r.code})` : ''}${r.pass === 0 ? '  (실행된 항목 없음)' : ''}`);
  }
  const tp = results.reduce((s, r) => s + r.pass, 0); const tf = results.reduce((s, r) => s + r.fail, 0);
  console.log(`합계: 통과 ${tp} / 실패 ${tf}`);
  process.exit(bad ? 1 : 0);
})();
