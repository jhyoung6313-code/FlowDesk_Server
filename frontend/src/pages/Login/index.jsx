import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, message } from 'antd';
import useAuthStore from '../../store/authStore';
import * as authApi from '../../api/auth';
import { APP_VERSION } from '../../utils/appVersion';
import './login.css';

/* 로그인 — 파스텔 대화형.
   안내 대화로 아이디 → 비밀번호 → (OTP 등록/인증) → 입장, 그리고 비밀번호 초기화(아이디 → OTP → 새 비밀번호 → 확인)를 진행한다.
   서버 API·보안 정책(OTP, 1계정 1로그인, 계정 잠금)은 이전 로그인 화면과 동일하다. */

const LOGIN_PILLS = ['아이디', '비밀번호', '인증', '입장'];
const RESET_PILLS = ['아이디', '인증', '새 비밀번호', '완료'];
const STEP_INDEX = {
  id: 0, pw: 1, otp: 2, 'otp-setup': 2, enter: 3,
  'reset-id': 0, 'reset-otp': 1, 'reset-new': 2, 'reset-confirm': 2, 'reset-done': 3,
};
const PW_STEPS = ['pw', 'reset-new', 'reset-confirm'];
const OTP_STEPS = ['otp', 'otp-setup', 'reset-otp'];
const FINAL_STEPS = ['enter', 'reset-done'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (err, fallback) => err?.response?.data?.error || fallback;

/* 새 비밀번호 규칙(화면 안내용 — 최종 검증은 서버가 한다) */
const PW_MIN = 9;
const pwRules = (v) => [
  { label: `${PW_MIN}자 이상`, ok: v.length >= PW_MIN },
  { label: '영문 대문자', ok: /[A-Z]/.test(v) },
  { label: '영문 소문자', ok: /[a-z]/.test(v) },
  { label: '숫자', ok: /[0-9]/.test(v) },
  { label: '특수문자', ok: /[^A-Za-z0-9]/.test(v) },
];
const pwValid = (v) => v.length >= PW_MIN && [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(v)).length >= 3;

function Face({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 46 46" role="img" aria-label="Flowdesk 도우미">
      <circle cx="23" cy="23" r="23" fill="#FFD84D" />
      <circle cx="16" cy="19" r="3" fill="#1F2430" />
      <circle cx="30" cy="19" r="3" fill="#1F2430" />
      <path d="M14 28c3 5 15 5 18 0" fill="none" stroke="#1F2430" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [msgs, setMsgs] = useState([]);
  const [step, setStep] = useState('id');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState('');
  const [username, setUsername] = useState('');
  const [hiddenPw, setHiddenPw] = useState('');   // 비밀번호 관리자 자동 채움 수신용(화면에 보이지 않는 입력창)
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [notice, setNotice] = useState('');

  const ctx = useRef({ preAuthToken: '', resetOtpToken: '', resetPwToken: '', newPw: '' });
  const alive = useRef(true);
  const started = useRef(false);
  const run = useRef(0);            // 처음부터 눌렀을 때 진행 중인 대화 연출을 끊기 위한 세대 번호
  const seq = useRef(0);
  const redirect = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  const push = useCallback((m) => setMsgs((prev) => [...prev, { id: ++seq.current, ...m }]), []);

  /* 봇 말풍선을 "입력 중…" 연출과 함께 순서대로 출력 */
  const botSay = useCallback(async (items) => {
    const mine = run.current;
    for (const it of items) {
      setTyping(true);
      await sleep(360);
      if (!alive.current || mine !== run.current) { setTyping(false); return false; }
      setTyping(false);
      push({ who: 'bot', ...it });
    }
    return true;
  }, [push]);

  const greet = useCallback(() => botSay([
    { text: '안녕하세요! Flowdesk에 오신 걸 환영해요.', tone: 'hello' },
    { text: '먼저 아이디를 알려 주세요.', tone: 'id' },
  ]), [botSay]);

  useEffect(() => {
    alive.current = true;
    if (!started.current) { started.current = true; greet(); }
    return () => { alive.current = false; };
  }, [greet]);

  useEffect(() => { if (user) navigate(redirect.current || '/'); }, [user, navigate]);

  useEffect(() => {
    const n = sessionStorage.getItem('loginNotice');
    if (n) { setNotice(n); sessionStorage.removeItem('loginNotice'); }
  }, []);

  // 새 말풍선이 생기면 맨 아래로, 입력 가능해지면 입력창에 포커스
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);
  const disabled = busy || typing || FINAL_STEPS.includes(step);
  useEffect(() => { if (!disabled) inputRef.current?.focus(); }, [disabled, step]);

  const restart = useCallback(() => {
    run.current += 1;
    ctx.current = { preAuthToken: '', resetOtpToken: '', resetPwToken: '', newPw: '' };
    setMsgs([]); setStep('id'); setValue(''); setUsername(''); setHiddenPw('');
    setShowPw(false); setTyping(false); setBusy(false);
    greet();
  }, [greet]);

  const finish = async (data) => {
    setStep('enter');
    await botSay([{ text: `확인됐어요, ${data.user?.displayName || ''} 님! 오늘의 브리프를 준비하고 있어요.`, tone: 'ok' }]);
    await sleep(450);
    if (!alive.current) return;
    if (data.mustChangePassword) {
      message.warning('보안 정책에 따라 비밀번호를 변경해야 합니다.');
      redirect.current = '/profile';
    }
    setAuth(data.token, data.user);
  };

  const loginFailed = async (err, name) => {
    const dup = err?.response?.data?.code === 'ALREADY_LOGGED_IN';
    const text = errText(err, '아이디 또는 비밀번호를 확인해 주세요.');
    setStep('id');
    setValue(name);
    if (dup) {
      await botSay([
        { text: '앗, 이미 다른 곳에서 로그인 중인 계정이에요.', tone: 'warn' },
        { kind: 'dup', text },
      ]);
    } else {
      await botSay([{ text, tone: 'warn' }, { text: '아이디부터 다시 확인해 볼까요?', tone: 'id' }]);
    }
  };

  const doLogin = async (name, pw) => {
    setBusy(true);
    try {
      const data = await authApi.login(name, pw);
      if (data.requireTotpSetup) {
        ctx.current.preAuthToken = data.preAuthToken;
        const setup = await authApi.setupLoginTotp(data.preAuthToken);
        setStep('otp-setup');
        await botSay([
          { text: '보안 정책상 2단계 인증(OTP) 등록이 필요해요. OTP 앱으로 아래 QR을 스캔해 주세요.', tone: 'otp' },
          { kind: 'qr', qr: setup.qrDataUrl },
          { text: '앱에 표시된 6자리 코드를 입력해 주세요.', tone: 'otp' },
        ]);
      } else if (data.requireTotp) {
        ctx.current.preAuthToken = data.preAuthToken;
        setStep('otp');
        await botSay([{ text: '인증 앱에 표시된 6자리 코드를 입력해 주세요.', tone: 'otp' }]);
      } else {
        await finish(data);
      }
    } catch (err) {
      await loginFailed(err, name);
    } finally {
      setBusy(false);
    }
  };

  const startReset = async () => {
    if (disabled) return;
    push({ who: 'me', text: '비밀번호를 잊었어요' });
    setStep('reset-id'); setValue('');
    await botSay([{ text: '비밀번호 초기화를 도와드릴게요. 아이디를 알려 주세요.', tone: 'id' }]);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    const raw = value;

    if (step === 'id') {
      const name = raw.trim();
      if (!name) return;
      push({ who: 'me', text: name });
      setUsername(name); setValue('');
      if (hiddenPw) {                       // 비밀번호 관리자가 비밀번호까지 채워 준 경우 바로 진행
        push({ who: 'me', text: '••••••••••', masked: true });
        const pw = hiddenPw; setHiddenPw('');
        await doLogin(name, pw);
      } else {
        setStep('pw');
        await botSay([{ text: `${name} 님, 비밀번호를 입력해 주세요.`, tone: 'pw' }]);
      }
      return;
    }

    if (step === 'pw') {
      if (!raw) return;
      push({ who: 'me', text: '•'.repeat(Math.min(raw.length, 12)), masked: true });
      setValue(''); setHiddenPw(''); setShowPw(false);
      await doLogin(username, raw);
      return;
    }

    if (OTP_STEPS.includes(step)) {
      const code = raw.replace(/\D/g, '');
      if (code.length !== 6) { await botSay([{ text: '6자리 숫자를 입력해 주세요.', tone: 'warn' }]); return; }
      push({ who: 'me', kind: 'otp' });
      setValue('');
      setBusy(true);
      try {
        if (step === 'reset-otp') {
          const d = await authApi.verifyResetOtp(ctx.current.resetOtpToken, code);
          ctx.current.resetPwToken = d.resetPwToken;
          setStep('reset-new');
          await botSay([{ text: `새 비밀번호를 정해 주세요. ${PW_MIN}자 이상, 영문 대·소문자·숫자·특수문자 중 3종류 이상이에요.`, tone: 'hello' }]);
        } else {
          const d = step === 'otp-setup'
            ? await authApi.enrollLoginTotp(ctx.current.preAuthToken, code)
            : await authApi.verifyLoginTotp(ctx.current.preAuthToken, code);
          await finish(d);
        }
      } catch (err) {
        await botSay([{ text: errText(err, 'OTP 코드가 올바르지 않습니다.'), tone: 'warn' }, { text: '코드를 다시 입력해 주세요.', tone: 'otp' }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 'reset-id') {
      const name = raw.trim();
      if (!name) return;
      push({ who: 'me', text: name }); setValue('');
      setBusy(true);
      try {
        const d = await authApi.requestPasswordReset(name);
        ctx.current.resetOtpToken = d.resetOtpToken;
        setStep('reset-otp');
        await botSay([{ text: '본인 확인을 위해 인증 코드 6자리를 입력해 주세요.', tone: 'otp' }]);
      } catch (err) {
        await botSay([{ text: errText(err, '계정을 찾을 수 없습니다.'), tone: 'warn' }, { text: '아이디를 다시 확인해 주세요.', tone: 'id' }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 'reset-new') {
      if (!raw) return;
      push({ who: 'me', text: '•'.repeat(Math.min(raw.length, 12)), masked: true });
      setValue('');
      if (!pwValid(raw)) {
        await botSay([{ text: `조건을 만족하지 않아요. ${PW_MIN}자 이상, 영문 대·소문자·숫자·특수문자 중 3종류 이상으로 다시 입력해 주세요.`, tone: 'warn' }]);
        return;
      }
      ctx.current.newPw = raw;
      setStep('reset-confirm');
      await botSay([{ text: '한 번 더 입력해 주세요.', tone: 'hello' }]);
      return;
    }

    if (step === 'reset-confirm') {
      if (!raw) return;
      push({ who: 'me', text: '•'.repeat(Math.min(raw.length, 12)), masked: true });
      setValue('');
      if (raw !== ctx.current.newPw) {
        setStep('reset-new');
        await botSay([{ text: '두 비밀번호가 달라요. 새 비밀번호부터 다시 입력해 주세요.', tone: 'warn' }]);
        return;
      }
      setBusy(true);
      try {
        await authApi.confirmPasswordReset(ctx.current.resetPwToken, raw);
        ctx.current.newPw = '';
        setStep('reset-done'); setShowPw(false);
        await botSay([{ text: '비밀번호가 변경됐어요. 새 비밀번호로 다시 로그인해 주세요.', tone: 'ok' }, { kind: 'goLogin' }]);
      } catch (err) {
        setStep('reset-new');
        await botSay([{ text: errText(err, '비밀번호 변경에 실패했습니다.'), tone: 'warn' }, { text: '새 비밀번호를 다시 입력해 주세요.', tone: 'hello' }]);
      } finally {
        setBusy(false);
      }
    }
  };

  /* ── 입력창 설정 ── */
  const isPwStep = PW_STEPS.includes(step);
  const isReset = step.startsWith('reset-');
  const cfg = {
    id: { type: 'text', name: 'username', ac: 'username', ph: '아이디를 입력하세요' },
    pw: { type: showPw ? 'text' : 'password', name: 'password', ac: 'current-password', ph: '비밀번호를 입력하세요' },
    otp: { type: 'text', name: 'otp', ac: 'one-time-code', ph: '6자리 코드', numeric: true },
    'otp-setup': { type: 'text', name: 'otp', ac: 'one-time-code', ph: '6자리 코드', numeric: true },
    enter: { type: 'text', name: 'x', ac: 'off', ph: '입장하는 중이에요…' },
    'reset-id': { type: 'text', name: 'username', ac: 'username', ph: '아이디를 입력하세요' },
    'reset-otp': { type: 'text', name: 'otp', ac: 'one-time-code', ph: '6자리 코드', numeric: true },
    'reset-new': { type: showPw ? 'text' : 'password', name: 'new-password', ac: 'new-password', ph: `새 비밀번호 (${PW_MIN}자 이상)` },
    'reset-confirm': { type: showPw ? 'text' : 'password', name: 'confirm-password', ac: 'new-password', ph: '새 비밀번호 확인' },
    'reset-done': { type: 'text', name: 'x', ac: 'off', ph: '로그인하러 가기를 눌러 주세요' },
  }[step];

  const hangul = isPwStep && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
  const warn = hangul ? '한글 입력 감지 — 입력기를 영문으로 전환하세요'
    : isPwStep && caps ? 'Caps Lock이 켜져 있습니다 — 비밀번호를 확인하세요' : '';
  const onKey = (e) => {
    if (isPwStep && typeof e.getModifierState === 'function') setCaps(e.getModifierState('CapsLock'));
  };

  const pills = isReset ? RESET_PILLS : LOGIN_PILLS;
  const idx = STEP_INDEX[step];
  const finalDone = FINAL_STEPS.includes(step);

  const renderMsg = (m) => {
    if (m.who === 'me') {
      return (
        <div key={m.id} className="fdl-row is-me">
          {m.kind === 'otp' ? (
            <div className="fdl-otpbox" aria-label="인증 코드 입력됨">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i}>•</span>)}</div>
          ) : (
            <div className={`fdl-bubble is-me${m.masked ? ' is-masked' : ''}`}>{m.text}</div>
          )}
        </div>
      );
    }
    if (m.kind === 'qr') {
      return (
        <div key={m.id} className="fdl-row"><div className="fdl-avatar" />
          <div className="fdl-qr"><img src={m.qr} alt="OTP 등록 QR 코드" /></div>
        </div>
      );
    }
    if (m.kind === 'dup') {
      return (
        <div key={m.id} className="fdl-row fdl-indent" role="alert">
          <div className="fdl-dup">
            {m.text}
            <div className="fdl-actions">
              <button type="button" className="fdl-mini" onClick={restart}>다시 시도</button>
            </div>
          </div>
        </div>
      );
    }
    if (m.kind === 'goLogin') {
      return (
        <div key={m.id} className="fdl-row fdl-indent"><button type="button" className="fdl-cta" onClick={restart}>로그인하러 가기</button></div>
      );
    }
    return (
      <div key={m.id} className="fdl-row"><div className="fdl-avatar" />
        <div className={`fdl-bubble is-bot fdl-tone-${m.tone || 'hello'}`}>{m.text}</div>
      </div>
    );
  };

  return (
    <div className="fdl-root">
      {/* 장식(의미 없는 일러스트) */}
      <div className="fdl-deco fdl-deco-1" aria-hidden="true"><b>대기</b><span className="fdl-num">6</span><i /></div>
      <div className="fdl-deco fdl-deco-2" aria-hidden="true"><b>완료</b><span className="fdl-num">3</span><i /></div>
      <div className="fdl-deco fdl-deco-3" aria-hidden="true"><b>진행중</b><span className="fdl-num">1</span><i /></div>
      <div className="fdl-deco fdl-deco-4" aria-hidden="true"><b>오늘 회의</b><span className="fdl-num">3</span><i /></div>

      <header className="fdl-header">
        <div className="fdl-brand">
          <div className="fdl-brand-mark">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FFD84D" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h6l3-7 3 14 3-7h3" /></svg>
          </div>
          <span className="fdl-brand-name">Flowdesk</span>
        </div>
        <span className="fdl-header-note">사내 전용 · OTP 2단계 인증</span>
      </header>

      <main className="fdl-main">
        {notice && (
          <Alert className="fdl-notice" type="warning" message={notice} showIcon closable onClose={() => setNotice('')} />
        )}
        <div className="fdl-card">
          <div className="fdl-top">
            <Face />
            <div className="fdl-top-title">
              <b>Flowdesk 로그인</b>
              <span className="fdl-status"><i />서버 정상</span>
            </div>
            <button type="button" className="fdl-restart" onClick={restart}>처음부터</button>
          </div>

          <div className="fdl-pills" aria-label="진행 단계">
            {pills.map((label, i) => {
              const cls = i < idx || (i === idx && finalDone) ? 'is-done' : i === idx ? 'is-now' : '';
              return <span key={label} className={`fdl-pill ${cls}`}>{cls === 'is-done' ? '✓ ' : ''}{label}</span>;
            })}
          </div>

          <div className="fdl-log" ref={logRef} role="log" aria-live="polite">
            {msgs.map(renderMsg)}
            {typing && (
              <div className="fdl-row"><div className="fdl-avatar" /><div className="fdl-dots" aria-label="입력 중"><span className="fdl-dot" /><span className="fdl-dot" /><span className="fdl-dot" /></div></div>
            )}
          </div>

          <form className="fdl-composer" onSubmit={onSubmit} autoComplete="on">
            {/* 비밀번호 관리자 자동 채움용(보이지 않음): 아이디 단계에선 비밀번호 칸, 비밀번호 단계에선 아이디 칸 */}
            {step === 'id' && (
              <input className="fdl-hidden" type="password" name="password" autoComplete="current-password" tabIndex={-1} aria-hidden="true"
                value={hiddenPw} onChange={(e) => setHiddenPw(e.target.value)} />
            )}
            {step === 'pw' && (
              <input className="fdl-hidden" type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" value={username} readOnly />
            )}

            {warn && <div className="fdl-warn" role="status">⚠ {warn}</div>}
            {step === 'reset-new' && (
              <div className="fdl-rules" aria-label="비밀번호 조건">
                {pwRules(value).map((r) => <span key={r.label} className={`fdl-rule${r.ok ? ' is-ok' : ''}`}>{r.ok ? '✓ ' : ''}{r.label}</span>)}
              </div>
            )}

            <div className="fdl-chips">
              {isReset
                ? <button type="button" className="fdl-chip is-sky" onClick={restart}>로그인으로 돌아가기</button>
                : (step === 'id' || step === 'pw') && (
                  <button type="button" className="fdl-chip is-peach" onClick={startReset}>비밀번호를 잊었어요</button>
                )}
            </div>

            <div className="fdl-field">
              <input
                ref={inputRef}
                type={cfg.type}
                name={cfg.name}
                autoComplete={cfg.ac}
                inputMode={cfg.numeric ? 'numeric' : undefined}
                maxLength={cfg.numeric ? 6 : undefined}
                placeholder={cfg.ph}
                aria-label={cfg.ph}
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(cfg.numeric ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
                onKeyDown={onKey}
                onKeyUp={onKey}
                spellCheck={false}
                autoCapitalize="off"
              />
              {isPwStep && (
                <button type="button" className="fdl-eye" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>{showPw ? '숨기기' : '보기'}</button>
              )}
              <button type="submit" className="fdl-send" aria-label="보내기" disabled={disabled || !value}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FFD84D" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </form>
        </div>
      </main>

      <footer className="fdl-footer">Flowdesk {APP_VERSION} · 접속 기록이 보관됩니다</footer>
    </div>
  );
}
