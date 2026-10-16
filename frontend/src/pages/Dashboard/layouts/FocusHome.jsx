import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import dayjs from 'dayjs';
import { updateTaskStatus } from '../../../api/tasks';
import useMemoStore from '../../../store/memoStore';
import { PRIO_LABEL, dueText, greet } from './useHomeData';

/* C · 포커스 모드 — "지금 할 일" 하나에 집중하고 나머지는 한쪽으로 물린다. */
const C = { green: '#12372F', mint: '#9BE7C4', orange: '#FF8A3D', ink: '#12372F', mute: '#5B7A70', faint: '#B7C9C2', line: '#E7EDEA', bg: '#F4F6F5' };
const NUM = "ui-monospace, Consolas, 'Courier New', monospace";
const FOCUS_SECONDS = 25 * 60;

const css = `
.fd-c-wrap{display:flex;flex-wrap:wrap;gap:20px}
.fd-c-hero{flex:1.7 1 560px;min-width:0}
.fd-c-side{flex:1 1 340px;min-width:0}
`;

function useCountdown() {
  const [left, setLeft] = useState(FOCUS_SECONDS);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!running) return undefined;
    ref.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { clearInterval(ref.current); setRunning(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current);
  }, [running]);
  const toggle = () => { if (left === 0) setLeft(FOCUS_SECONDS); setRunning((r) => !r); };
  const reset = () => { setRunning(false); setLeft(FOCUS_SECONDS); };
  return { left, running, toggle, reset };
}

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function FocusHome({ data, onAddTask }) {
  const navigate = useNavigate();
  const createMemo = useMemoStore((s) => s.create);
  const { user, queue, counts, meetings, unreadMail, unreadNotifications, reload } = data;
  const approvalCount = data.today?.counts?.approvals ?? data.approvals.length;
  const focus = queue[0];
  const next = queue.slice(1, 4);
  const timer = useCountdown();
  const [memo, setMemo] = useState('');
  const circ = 2 * Math.PI * 72;
  const ratio = timer.left / FOCUS_SECONDS;

  // 태스크가 바뀌면 타이머 초기화
  useEffect(() => { timer.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [focus?.id]);

  const done = async () => {
    if (!focus) return;
    try {
      await updateTaskStatus(focus.id, 'done');
      message.success('완료로 표시했습니다.');
      reload();
    } catch { message.error('상태 변경에 실패했습니다.'); }
  };
  const saveMemo = async () => {
    if (!memo.trim()) return;
    try { await createMemo({ content: memo.trim() }); setMemo(''); message.success('메모를 저장했습니다.'); }
    catch { message.error('메모 저장에 실패했습니다.'); }
  };
  const upcoming = meetings.find((m) => dayjs(m.startAt).isAfter(dayjs()));
  const minutesTo = upcoming ? dayjs(upcoming.startAt).diff(dayjs(), 'minute') : null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.bg, color: C.ink, padding: '20px 32px 32px' }}>
      <style>{css}</style>
      <div style={{ textAlign: 'center', fontSize: 14, color: C.mute, margin: '0 0 16px' }}>{greet()}, {user?.displayName || ''} 님</div>

      <div className="fd-c-wrap">
        {/* 히어로 */}
        <section className="fd-c-hero" style={{ boxSizing: 'border-box', borderRadius: 32, background: C.green, color: '#fff', padding: '44px 48px', display: 'flex', flexDirection: 'column', gap: 26, minHeight: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.mint, fontWeight: 700, letterSpacing: 0.4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.mint }} />지금 할 일
          </div>

          {focus ? (
            <>
              <h1 onClick={() => navigate(`/tasks?taskId=${focus.id}`)} style={{ margin: 0, fontSize: 56, lineHeight: 1.14, fontWeight: 900, letterSpacing: -2, maxWidth: 680, cursor: 'pointer', wordBreak: 'keep-all' }}>{focus.title}</h1>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {focus.part?.name && <span style={{ padding: '7px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', fontSize: 13 }}>{focus.part.name}</span>}
                <span style={{ padding: '7px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', fontSize: 13 }}>{dueText(focus.dueDate, focus.status)}</span>
                {focus.priority && <span style={{ padding: '7px 14px', borderRadius: 999, background: focus.priority === 'high' ? C.orange : 'rgba(255,255,255,0.1)', color: focus.priority === 'high' ? C.ink : '#fff', fontSize: 13, fontWeight: 700 }}>우선순위 {PRIO_LABEL[focus.priority] || focus.priority}</span>}
              </div>
              {focus.description && (
                <p style={{ margin: 0, maxWidth: 560, fontSize: 16, lineHeight: 1.7, color: '#B9D3C9', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{focus.description}</p>
              )}
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 36, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 164, height: 164, flex: 'none' }}>
                  <svg width="164" height="164" viewBox="0 0 164 164" role="img" aria-label={`집중 타이머 ${fmt(timer.left)}`}>
                    <circle cx="82" cy="82" r="72" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
                    <circle cx="82" cy="82" r="72" fill="none" stroke={C.orange} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${circ * ratio} ${circ}`} transform="rotate(-90 82 82)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: NUM, fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>{fmt(timer.left)}</div>
                    <div style={{ fontSize: 12, color: '#7FA595' }}>{timer.running ? '집중 중' : '집중 시간'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button onClick={timer.toggle} style={{ height: 60, padding: '0 40px', border: 0, borderRadius: 999, background: C.orange, color: C.ink, fontWeight: 900, fontSize: 18, cursor: 'pointer' }}>
                    {timer.running ? '일시정지' : timer.left === FOCUS_SECONDS ? '집중 시작' : '이어서 집중'}
                  </button>
                  <button onClick={done} style={{ height: 44, padding: '0 24px', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999, background: 'transparent', color: '#fff', fontSize: 14, cursor: 'pointer' }}>완료로 표시</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
              <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1.15, fontWeight: 900, letterSpacing: -2 }}>남은 업무가 없어요.</h1>
              <p style={{ margin: 0, fontSize: 17, color: '#B9D3C9' }}>새 업무를 추가하거나 잠시 쉬어가세요.</p>
              <button onClick={() => onAddTask()} style={{ height: 52, padding: '0 32px', border: 0, borderRadius: 999, background: C.orange, color: C.ink, fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>+ 업무 추가</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 13 }}>
            {[['지연', counts.overdue, '/tasks', false], ['결재 대기', approvalCount, '/approvals', true], ['안읽은 메일', unreadMail, '/mail', false], ['알림', unreadNotifications, '/notifications', false]].map(([label, n, to, hl]) => (
              <span key={label} onClick={() => navigate(to)} style={{ padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                {label} <b style={{ fontFamily: NUM, color: hl && n > 0 ? C.orange : '#fff' }}>{n}</b>
              </span>
            ))}
          </div>
        </section>

        {/* 우측 */}
        <div className="fd-c-side" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={{ background: '#fff', borderRadius: 28, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>다음 할 일</h2><span style={{ fontSize: 13, color: C.mute }}>{next.length}건</span>
            </div>
            {next.length === 0 && <div style={{ fontSize: 14, color: C.mute, padding: '8px 0' }}>대기 중인 다음 업무가 없습니다.</div>}
            {next.map((t, i) => (
              <div key={t.id} onClick={() => navigate(`/tasks?taskId=${t.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: i ? `1px solid ${C.line}` : 'none', cursor: 'pointer' }}>
                <span style={{ fontFamily: NUM, fontWeight: 700, fontSize: 22, color: C.faint, width: 26 }}>{i + 2}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: C.mute }}>{t.part?.name ? `${t.part.name} · ` : ''}{dueText(t.dueDate, t.status)}</div>
                </div>
              </div>
            ))}
          </section>

          <section style={{ background: '#fff', borderRadius: 28, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>오늘 일정</h2><span style={{ fontSize: 13, color: C.mute }}>{meetings.length}건</span>
            </div>
            {meetings.length === 0 && <div style={{ fontSize: 14, color: C.mute }}>오늘 예정된 회의가 없습니다.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {meetings.slice(0, 4).map((m) => {
                const past = dayjs(m.startAt).isBefore(dayjs());
                const isNext = upcoming && upcoming.id === m.id;
                return (
                  <div key={m.id} onClick={() => navigate(`/meetings?id=${m.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                    <span style={{ fontFamily: NUM, fontWeight: 700, fontSize: 14, width: 50, color: isNext ? '#B4540F' : past ? C.faint : C.mute }}>{dayjs(m.startAt).format('HH:mm')}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: isNext ? 700 : 400, color: past ? '#8AA39A' : C.ink, textDecoration: past ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                    {isNext && minutesTo != null && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: '#FFE9DA', color: '#A24E0F', fontWeight: 700 }}>{minutesTo >= 60 ? `${Math.floor(minutesTo / 60)}시간 후` : `${minutesTo}분 후`}</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ marginTop: 'auto', background: '#fff', borderRadius: 28, padding: '20px 20px 20px 28px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveMemo(); }}
              placeholder="떠오른 생각을 바로 적어 두세요" aria-label="빠른 메모"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontSize: 15, color: C.ink }} />
            <button onClick={saveMemo} style={{ height: 44, padding: '0 22px', border: 0, borderRadius: 999, background: C.green, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>저장</button>
          </section>
        </div>
      </div>
    </div>
  );
}
