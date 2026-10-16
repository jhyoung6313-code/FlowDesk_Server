import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { PRIO_LABEL, clickable, dueText, greet } from './useHomeData';
import HomeScope from './HomeScope';

/* A · 커맨드 센터 — 다크 벤토 타일. 숫자 중심으로 한눈에 훑는 홈. */
const C = {
  bg: '#0E1013', panel: '#161A20', row: '#1C222A', line: '#232932', line2: '#2F3743',
  text: '#E8ECF1', mute: '#8A94A3', soft: '#B6BFCC', accent: '#C6F432', blue: '#5B9DFF', amber: '#F4A340',
};
const MONO = "ui-monospace, 'SF Mono', Consolas, 'Courier New', monospace";

const css = `
.fd-a-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
.fd-a-grid > *{min-width:0}
@media (max-width:1100px){.fd-a-grid > *{grid-column:span 12 !important;grid-row:auto !important}}
`;

const Tile = ({ span, row, style, children }) => (
  <section style={{
    gridColumn: `span ${span}`, gridRow: row ? `span ${row}` : undefined, background: C.panel,
    border: `1px solid ${C.line}`, borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column', gap: 12, ...style,
  }}>{children}</section>
);
const Title = ({ children, right, onClick }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.soft }}>{children}</h2>
    {right && <span onClick={onClick} style={{ fontSize: 12, color: C.mute, cursor: onClick ? 'pointer' : 'default' }}>{right}</span>}
  </div>
);
const Big = ({ children, color }) => (
  <div style={{ fontSize: 64, lineHeight: 1, fontWeight: 600, letterSpacing: -3, color }}>{children}</div>
);

export default function CommandHome({ data, onAddTask }) {
  const navigate = useNavigate();
  const { user, counts, focusList, todayCount, queue, meetings, approvals, unreadMail, okr, notices, scope, setScope, scopeLabel } = data;
  const focus = queue.slice(0, 3);
  const approvalCount = data.today?.counts?.approvals ?? approvals.length;
  const total = Math.max(counts.total, 1);
  const byStatus = (s) => data.active.filter((t) => t.status === s).slice(0, 3);
  const prog = okr?.progress;
  const circ = 2 * Math.PI * 38;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.bg, color: C.text, padding: '28px 32px 48px' }}>
      <style>{css}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.mute, letterSpacing: 0.6 }}>
            {dayjs().format('ddd').toUpperCase()} · {dayjs().format('YYYY.MM.DD')}
          </div>
          <h1 style={{ margin: '8px 0 0', fontSize: 32, lineHeight: 1.25, fontWeight: 600, letterSpacing: -0.8 }}>
            {user?.displayName || ''} 님, {greet()}.<br />
            {todayCount > 0
              ? <>오늘 마감·지연 업무는 <span style={{ color: C.accent }}>{todayCount}건</span>입니다.</>
              : focusList.length > 0
                ? <>우선순위 높은 업무가 <span style={{ color: C.accent }}>{focusList.length}건</span> 있어요.</>
                : <>지금 급하게 처리할 일은 <span style={{ color: C.accent }}>없습니다</span>.</>}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <HomeScope scope={scope} setScope={setScope} tone="dark" />
          <button onClick={() => onAddTask()} style={{ height: 44, padding: '0 18px', borderRadius: 12, border: 0, background: C.accent, color: '#0E1013', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>+ 업무 추가</button>
          <button onClick={() => navigate('/mail')} style={{ height: 44, padding: '0 18px', borderRadius: 12, border: `1px solid ${C.line2}`, background: 'transparent', color: C.text, fontSize: 14, cursor: 'pointer' }}>메일 쓰기</button>
          <button onClick={() => navigate('/approvals/new')} style={{ height: 44, padding: '0 18px', borderRadius: 12, border: `1px solid ${C.line2}`, background: 'transparent', color: C.text, fontSize: 14, cursor: 'pointer' }}>결재 상신</button>
        </div>
      </div>

      <div className="fd-a-grid">
        <Tile span={5} row={2} style={{ padding: 24, gap: 16 }}>
          <Title right={`${counts.done} / ${counts.total} 완료`}>오늘의 포커스</Title>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {focus.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.mute, fontSize: 14 }}>오늘 집중할 업무가 없습니다.</div>}
            {focus.map((t, i) => (
              <div key={t.id} {...clickable(() => navigate(`/tasks?taskId=${t.id}`))}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, background: C.row, border: `1px solid ${C.line2}`, cursor: 'pointer' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${i === 0 ? C.accent : '#4A5565'}`, flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 3 }}>{t.part?.name ? `${t.part.name} · ` : ''}{dueText(t.dueDate, t.status)}</div>
                </div>
                {t.priority && (
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: t.priority === 'high' ? '#3A1F22' : '#2A2F3A', color: t.priority === 'high' ? '#FF8A80' : C.soft }}>
                    {PRIO_LABEL[t.priority] || t.priority}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, color: C.mute, fontSize: 13 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: C.line, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((counts.done / total) * 100)}%`, height: '100%', background: C.accent }} />
            </div>
            <span style={{ fontFamily: MONO }}>전체 {Math.round((counts.done / total) * 100)}%</span>
          </div>
        </Tile>

        <Tile span={3}>
          <Title>{scopeLabel}</Title>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 64, lineHeight: 1, fontWeight: 600, letterSpacing: -3 }}>{counts.total}</span><span style={{ fontSize: 14, color: C.mute }}>건</span></div>
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 3 }}>
            <div style={{ flex: counts.pending || 0.0001, background: '#4A5565' }} />
            <div style={{ flex: counts.inProgress || 0.0001, background: C.blue }} />
            <div style={{ flex: counts.done || 0.0001, background: C.accent }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.mute }}>
            <span>대기 {counts.pending}</span><span>진행 {counts.inProgress}</span><span>완료 {counts.done}</span>
          </div>
        </Tile>

        <section {...clickable(() => navigate('/approvals'))} style={{ gridColumn: 'span 2', background: C.accent, color: '#0E1013', borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>결재 대기</h2>
          <Big>{approvalCount}</Big>
          <div style={{ fontSize: 12, fontWeight: 600 }}>내 차례인 문서 →</div>
        </section>

        <section {...clickable(() => navigate('/mail'))} style={{ gridColumn: 'span 2', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.soft }}>안읽은 메일</h2>
          <Big>{unreadMail}</Big>
          <div style={{ fontSize: 12, color: C.mute }}>{data.mails[0] ? `최근 ${dayjs(data.mails[0].createdAt).fromNow?.() || dayjs(data.mails[0].createdAt).format('MM.DD')}` : '새 메일 없음'}</div>
        </section>

        <Tile span={4}>
          <Title right="일정 보기 →" {...clickable(() => navigate('/meetings'))}>오늘 일정</Title>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {meetings.length === 0 && <div style={{ color: C.mute, fontSize: 14, padding: '10px 0' }}>오늘 예정된 회의가 없습니다.</div>}
            {meetings.slice(0, 4).map((m, i) => (
              <div key={m.id} {...clickable(() => navigate(`/meetings?id=${m.id}`))} style={{ display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontFamily: MONO, fontSize: 13, color: i === 0 ? C.accent : C.mute, width: 46 }}>{dayjs(m.startAt).format('HH:mm')}</span>
                <div style={{ flex: 1, minWidth: 0, borderLeft: `2px solid ${C.line2}`, paddingLeft: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                  {m.location && <div style={{ fontSize: 12, color: C.mute }}>{m.location}</div>}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile span={3}>
          <Title right="OKR →" {...clickable(() => navigate('/okr'))}>OKR 진척</Title>
          {prog == null ? (
            <div style={{ color: C.mute, fontSize: 14, padding: '14px 0' }}>내가 맡은 목표가 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={`OKR 진척 ${prog}퍼센트`}>
                <circle cx="48" cy="48" r="38" fill="none" stroke={C.line} strokeWidth="10" />
                <circle cx="48" cy="48" r="38" fill="none" stroke={C.accent} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${(circ * prog) / 100} ${circ}`} transform="rotate(-90 48 48)" />
                <text x="48" y="54" textAnchor="middle" fontSize="20" fontWeight="600" fill={C.text} fontFamily={MONO}>{prog}%</text>
              </svg>
              <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.6 }}>{okr.cycle.name}<br />목표 {okr.objs.length}개</div>
            </div>
          )}
        </Tile>

        <Tile span={7}>
          <Title right="전체 보기 →" {...clickable(() => navigate('/tasks?view=kanban'))}>업무 보드</Title>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
            {[['대기', 'pending', C.mute, counts.pending], ['진행중', 'in_progress', C.blue, counts.inProgress], ['보류', 'hold', C.amber, counts.hold], ['완료', 'done', C.accent, counts.done]].map(([label, st, color, n]) => (
              <div key={st} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color }}><span>{label}</span><span style={{ fontFamily: MONO }}>{n}</span></div>
                {byStatus(st).length === 0 && <div style={{ height: 38, borderRadius: 10, border: `1px dashed ${C.line2}` }} />}
                {byStatus(st).map((t) => (
                  <div key={t.id} {...clickable(() => navigate(`/tasks?taskId=${t.id}`))} title={t.title}
                    style={{ minHeight: 38, boxSizing: 'border-box', padding: '9px 10px', borderRadius: 10, background: C.row, border: st === 'in_progress' ? `1px solid ${C.blue}` : '1px solid transparent', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                    {t.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Tile>

        <Tile span={5}>
          <Title right="전체 보기 →" {...clickable(() => navigate('/bbs'))}>게시판 공지</Title>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {notices.length === 0 && <div style={{ color: C.mute, fontSize: 14, padding: '10px 0' }}>표시할 게시글이 없습니다.</div>}
            {notices.map((p, i) => (
              <div key={p.id} {...clickable(() => navigate(`/bbs?categoryId=${p._catId}&postId=${p.id}`))}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: i < notices.length - 1 ? `1px solid ${C.line}` : 'none', fontSize: 14, cursor: 'pointer' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.mute, flex: 'none' }}>{dayjs(p.createdAt).format('MM.DD')}</span>
              </div>
            ))}
          </div>
        </Tile>
      </div>
    </div>
  );
}
