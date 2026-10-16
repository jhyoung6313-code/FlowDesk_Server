import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import dayjs from 'dayjs';
import { updateTaskStatus } from '../../../api/tasks';
import { isOverdue } from '../../../utils/dday';
import { PRIO_LABEL, STATUS_LABEL, clickable, dueText, greet } from './useHomeData';
import HomeScope from './HomeScope';

/* E · 보드 퍼스트 — 파스텔 칸반이 메인. 카드를 끌어 다른 컬럼에 놓거나(터치·키보드는 카드의 "상태" 선택) 상태를 바꾼다. */
const COLS = [
  { key: 'pending', label: '대기', bg: '#FFE3D6', chip: '#FFE3D6', chipText: '#8A4B2E' },
  { key: 'in_progress', label: '진행중', bg: '#D9E8FF', chip: '#E7F0FF', chipText: '#2A5B86' },
  { key: 'hold', label: '보류', bg: '#FFF1BD', chip: '#FFF1BD', chipText: '#7A6200' },
  { key: 'done', label: '완료', bg: '#D3F2E4', chip: '#D3F2E4', chipText: '#216A4E' },
];
const INK = '#1F2430';
const MUTE = '#5C6478';
const DONE_LIMIT = 8;

const css = `
.fd-e-cols{display:grid;grid-template-columns:repeat(4,minmax(240px,1fr));gap:18px;overflow-x:auto;padding-bottom:6px}
.fd-e-move{height:26px;border:0;border-radius:999px;background:rgba(31,36,48,0.08);color:${INK};font-size:12px;font-weight:700;padding:0 6px;cursor:pointer}
`;

export default function BoardHome({ data, onAddTask }) {
  const navigate = useNavigate();
  const { user, active, counts, reload, todayCount, scope, setScope, scopeLabel } = data;
  const [dragId, setDragId] = useState(null);   // 화면 표시용(흐림 처리)
  const dragRef = useRef(null);                   // 드롭 처리용 — 렌더 전 값도 읽을 수 있게 ref 로 보관
  const [overCol, setOverCol] = useState(null);
  const [override, setOverride] = useState({});   // 낙관적 갱신: 서버 응답·재조회 전에도 카드를 새 컬럼에 즉시 표시
  const approvalCount = data.today?.counts?.approvals ?? data.approvals.length;
  const statusOf = (t) => override[t.id] ?? t.status;

  const move = async (id, status) => {
    const t = active.find((x) => x.id === id);
    if (!t || statusOf(t) === status) return;
    setOverride((o) => ({ ...o, [id]: status }));
    try {
      await updateTaskStatus(id, status);
      await reload();
    } catch {
      message.error('상태 변경에 실패했습니다.');
    } finally {
      setOverride((o) => { const n = { ...o }; delete n[id]; return n; });   // 실패 시 원위치, 성공 시 서버 값이 이미 반영됨
    }
  };

  const drop = (status) => {
    const id = dragRef.current;
    dragRef.current = null;
    setDragId(null); setOverCol(null);
    if (id != null) move(id, status);
  };

  const chips = [
    ['결재 대기', approvalCount, '#FFE3D6', '#8A4B2E', '/approvals'],
    ['안읽은 메일', data.unreadMail, '#D9E8FF', '#2A5B86', '/mail'],
    ['오늘 회의', data.meetings.length, '#D3F2E4', '#216A4E', '/meetings'],
    ['지연', counts.overdue, '#FFF1BD', '#7A6200', '/tasks'],
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#fff', color: INK, padding: '28px 36px 0', position: 'relative' }}>
      <style>{css}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, color: MUTE, fontWeight: 500 }}>{greet()}, {user?.displayName || ''} 님</span>
            <HomeScope scope={scope} setScope={setScope} tone="light" />
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 38, lineHeight: 1.2, fontWeight: 900, letterSpacing: -1.2 }}>
            {todayCount > 0
              ? <>오늘 <span style={{ background: '#FFE3D6', padding: '0 12px', borderRadius: 14 }}>{todayCount}건</span>만 끝내면 돼요.</>
              : '오늘은 여유로운 하루예요.'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {chips.map(([label, n, bg, color, to]) => (
            <div key={label} {...clickable(() => navigate(to))} style={{ padding: '12px 20px', borderRadius: 20, background: bg, cursor: 'pointer' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>{n}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="fd-e-cols" aria-label={`${scopeLabel} 칸반`}>
        {COLS.map((col) => {
          let list = active.filter((t) => statusOf(t) === col.key);
          // 완료 컬럼은 최근 완료한 순으로 보여 준다 (마감일 오름차순이면 가장 오래된 것부터 보이게 됨)
          if (col.key === 'done') list = [...list].sort((a, b) => dayjs(b.updatedAt || 0).valueOf() - dayjs(a.updatedAt || 0).valueOf());
          const shown = col.key === 'done' ? list.slice(0, DONE_LIMIT) : list;
          const isOver = overCol === col.key && dragId != null;
          return (
            <section key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={() => drop(col.key)}
              style={{ background: col.bg, borderRadius: 28, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, outline: isOver ? `3px dashed ${INK}` : '3px dashed transparent', outlineOffset: -3, transition: 'outline-color .12s', alignSelf: 'start', minHeight: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>{col.label}</h2>
                <span style={{ fontWeight: 900, background: '#fff', borderRadius: 999, padding: '2px 12px', fontSize: 14 }}>{list.length}</span>
              </div>

              {shown.map((t) => {
                const late = isOverdue(t.dueDate, t.status);
                const who = t.assignees?.[0]?.user;
                const done = col.key === 'done';
                return (
                  <article key={t.id} draggable
                    onDragStart={() => { dragRef.current = t.id; setDragId(t.id); }} onDragEnd={() => { dragRef.current = null; setDragId(null); setOverCol(null); }}
                    {...clickable(() => navigate(`/tasks?taskId=${t.id}`))}
                    aria-label={`${t.title} — ${col.label}`}
                    style={{ background: done ? 'rgba(255,255,255,0.75)' : '#fff', borderRadius: 20, padding: 16, cursor: 'grab', opacity: dragId === t.id ? 0.4 : 1, boxShadow: col.key === 'in_progress' ? '0 8px 20px rgba(42,91,134,0.18)' : 'none', color: done ? '#4F6B60' : INK }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, textDecoration: done ? 'line-through' : 'none', wordBreak: 'keep-all' }}>{t.title}</div>
                      {t.priority === 'high' && !done && <span style={{ flex: 'none', fontSize: 11, fontWeight: 900, padding: '3px 9px', borderRadius: 999, background: '#FF6B57', color: '#fff' }}>{PRIO_LABEL.high}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {t.part?.name && <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: col.chip, color: col.chipText }}>{t.part.name}</span>}
                      <span style={{ fontSize: 12, color: late ? '#D4402F' : MUTE, fontWeight: late ? 700 : 400 }}>{dueText(t.dueDate, t.status)}</span>
                      {who && <span title={who.displayName} style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: '50%', background: '#FFD84D', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK }}>{who.displayName?.charAt(0)}</span>}
                    </div>
                    {/* 터치·키보드용 상태 변경 (드래그 대체) */}
                    <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <select className="fd-e-move" aria-label={`${t.title} 상태 변경`} value={statusOf(t)} onChange={(e) => move(t.id, e.target.value)}>
                        {COLS.map((c) => <option key={c.key} value={c.key}>{STATUS_LABEL[c.key]}</option>)}
                      </select>
                    </div>
                  </article>
                );
              })}

              {list.length === 0 && (
                <div style={{ border: '2px dashed rgba(31,36,48,0.25)', borderRadius: 20, padding: '28px 14px', textAlign: 'center', fontSize: 14, color: 'rgba(31,36,48,0.55)' }}>
                  {col.key === 'done' ? '완료한 업무가 여기에 쌓여요' : '비어 있어요 — 카드를 끌어다 놓아 보세요'}
                </div>
              )}
              {col.key === 'done' && list.length > DONE_LIMIT && (
                <div {...clickable(() => navigate('/tasks?status=done'))} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: col.chipText, cursor: 'pointer' }}>외 {list.length - DONE_LIMIT}건 보기 →</div>
              )}
              {col.key !== 'done' && (
                <button type="button" onClick={() => onAddTask(col.key)} style={{ border: '2px dashed rgba(31,36,48,0.25)', background: 'transparent', borderRadius: 20, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'rgba(31,36,48,0.6)', cursor: 'pointer' }}>+ 카드 추가</button>
              )}
            </section>
          );
        })}
      </div>

      {/* 떠 있는 빠른 실행 독 */}
      <div style={{ position: 'sticky', bottom: 20, display: 'flex', justifyContent: 'center', pointerEvents: 'none', marginTop: 28, paddingBottom: 4 }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: 8, borderRadius: 999, background: INK, boxShadow: '0 18px 40px rgba(31,36,48,0.35)' }}>
          <button onClick={() => onAddTask()} style={{ height: 46, padding: '0 24px', border: 0, borderRadius: 999, background: '#FFD84D', color: INK, fontWeight: 900, fontSize: 15, cursor: 'pointer' }}>+ 업무</button>
          {[['메모', '/memos'], ['메일 쓰기', '/mail'], ['결재 상신', '/approvals/new']].map(([label, to]) => (
            <button key={label} onClick={() => navigate(to)} style={{ height: 46, padding: '0 20px', border: 0, borderRadius: 999, background: 'transparent', color: '#fff', fontSize: 15, cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
