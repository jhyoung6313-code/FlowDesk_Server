/* e2e 공통 설정 — 모든 스위트가 이 모듈로 서버 주소·DB·브라우저를 얻는다.
   ⚠ 개발 DB 전용: 스위트는 테스트 계정(admin/member1/member2)의 세션 토큰을 DB 값으로 직접 서명하고
     설정·업무 상태·가계부 등을 일시 변경한 뒤 원복한다. 운영(원격) 서버·DB 에는 절대 실행하지 않는다. */
const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '../../backend');
const backendRequire = (name) => require(path.join(BACKEND, 'node_modules', name));

backendRequire('dotenv').config({ path: path.join(BACKEND, '.env') });

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const API = process.env.E2E_API || 'http://localhost:4000/api';

/* ── 안전장치: 로컬 서버·로컬 DB 가 아니면 실행을 거부한다 ── */
const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(u);
const dbHost = (() => { try { return new URL(process.env.DATABASE_URL || '').hostname; } catch { return ''; } })();
const dbLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbHost);
if (process.env.NODE_ENV === 'production' || !isLocalUrl(BASE) || !isLocalUrl(API) || !dbLocal) {
  if (process.env.E2E_ALLOW_REMOTE !== '1') {
    console.error('[e2e] 로컬 개발 환경(서버·DB 모두 localhost)에서만 실행할 수 있습니다.');
    console.error(`      BASE=${BASE} API=${API} DB host=${dbHost || '(없음)'} NODE_ENV=${process.env.NODE_ENV || ''}`);
    console.error('      (알면서 원격 환경에 실행하려면 E2E_ALLOW_REMOTE=1 — 테스트 계정 데이터가 변경됩니다)');
    process.exit(2);
  }
}

const jwt = backendRequire('jsonwebtoken');
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient();

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('puppeteer'); }

/* 브라우저: E2E_BROWSER 로 지정하거나 설치된 Edge/Chrome 을 찾는다 */
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const BROWSER = process.env.E2E_BROWSER || CANDIDATES.find((p) => fs.existsSync(p));
if (!BROWSER) {
  console.error('[e2e] Edge/Chrome 을 찾지 못했습니다. E2E_BROWSER 에 실행 파일 경로를 지정하세요.');
  process.exit(2);
}

const SHOTS = path.join(__dirname, '..', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

module.exports = { BACKEND, backendRequire, BASE, API, jwt, prisma, puppeteer, BROWSER, SHOTS };
