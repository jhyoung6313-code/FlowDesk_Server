import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { clickable, dueText } from './useHomeData';
import HomeScope from './HomeScope';

/* F · 데일리 브리프 — 카드 없이 굵은 선과 큰 글자만 쓰는 신문 1면식 홈. */
const ACC = '#E8341C';
const INK = '#111111';
const MONO = "ui-monospace, 'SF Mono', Consolas, 'Courier New', monospace";

const css = `
.fd-f-cols{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:0;overflow-x:auto}
.fd-f-cols > section{padding:26px 28px 0;border-right:1px solid #DDD;min-width:0}
.fd-f-cols > section:first-child{padding-left:0}
.fd-f-cols > section:last-child{padding-right:0;border-right:0}
.fd-f-link:hover{color:${ACC}}
`;

const Head = ({ no, children }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18 }}>
    <span style={{ fontFamily: MONO, fontSize: 12, color: ACC, fontWeight: 600 }}>{no}</span>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{children}</h2>
  </div>
);
const Row = ({ onClick, last, children }) => (
  <div className="fd-f-link" {...(onClick ? clickable(onClick) : {})} style={{ padding: '14px 0', borderTop: '1px solid #DDD', borderBottom: last ? '1px solid #DDD' : 'none', cursor: onClick ? 'pointer' : 'default' }}>{children}</div>
);
const Tag = ({ children, hot }) => (
  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: hot ? ACC : '#777', letterSpacing: 0.6 }}>{children}</div>
);

export default function BriefHome({ data, onAddTask }) {
  const navigate = useNavigate();
  const { user, queue, focusList, todayCount, counts, meetings, approvals, mails, notices, okr, scope, setScope } = data;
  const approvalCount = data.today?.counts?.approvals ?? approvals.length;
  const n = todayCount;   // 마감이 오늘이거나 이미 지난 미완료 업무만 "오늘"로 센다
  const top = focusList[0];   // 급한 업무(마감 오늘·지연·높음)가 있을 때만 요약 첫 문장에 올린다
  const total = Math.max(counts.total, 1);
  const pct = (v) => `${Math.round((v / total) * 100)}%`;

  // 요약 문장: 실제 데이터로 조립한 결정적 문장 (AI 생성 아님)
  const sentences = [];
  if (top) sentences.push(`${top.title}${/[가-힣]$/.test(top.title) ? '이(가)' : ' —'} ${dueText(top.dueDate, top.status)}입니다.`);
  if (!top) sentences.push('오늘 마감이거나 급한 업무는 없습니다.');
  if (meetings.length) sentences.push(`오늘 회의 ${meetings.length}건이 있습니다.`);
  if (approvalCount) sentences.push(`결재 ${approvalCount}건이 내 차례를 기다리고 있습니다.`);
  sentences.push(counts.overdue ? `지연된 업무가 ${counts.overdue}건 있습니다.` : '지연된 업무는 없습니다.');

  const inbox = [
    ...approvals.slice(0, 2).map((a) => ({ key: `a${a.id}`, tag: '결재', hot: true, title: a.title, to: `/approvals/${a.id}` })),
    ...mails.slice(0, 2).map((m) => ({ key: `m${m.id}`, tag: `메일 · ${dayjs(m.createdAt).fromNow?.() || ''}`, hot: !m.isRead, title: m.subject || '(제목 없음)', to: `/mail?id=${m.id}` })),
    ...notices.slice(0, 1).map((p) => ({ key: `p${p.id}`, tag: `공지 · ${dayjs(p.createdAt).format('MM.DD')}`, title: p.title, to: `/bbs?categoryId=${p._catId}&postId=${p.id}` })),
  ];

  const bar = (label, value, width, color = INK) => (
    <div key={label}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{label}</span><span style={{ fontFamily: MONO, fontWeight: 600 }}>{value}</span></div>
      <div style={{ height: 3, background: '#E5E5E5' }}><div style={{ width, height: '100%', background: color }} /></div>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#fff', color: INK, padding: '0 48px 40px' }}>
      <style>{css}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '16px 0', borderBottom: '3px solid #111', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: '#666', letterSpacing: 0.3 }}>{dayjs().format('YYYY.MM.DD ddd').toUpperCase()}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <HomeScope scope={scope} setScope={setScope} tone="ink" />
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#666' }}>{user?.displayName || ''} 님의 오늘</span>
        </span>
      </div>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-end', padding: '40px 0 34px', borderBottom: '1px solid #111' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: ACC, letterSpacing: 1, marginBottom: 14 }}>TODAY&apos;S BRIEF</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(56px, 8vw, 104px)', lineHeight: 0.98, fontWeight: 900, letterSpacing: '-0.05em' }}>
            오늘<br />{n}건<span style={{ color: ACC }}>.</span>
          </h1>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 0, fontSize: 17, lineHeight: 1.75, color: '#333', paddingBottom: 10 }}>
          {top ? <b style={{ fontWeight: 700, color: INK }}>{sentences[0]}</b> : null} {sentences.slice(top ? 1 : 0).join(' ')}
        </div>
      </section>

      <div className="fd-f-cols">
        <section>
          <Head no="01">포커스</Head>
          {queue.slice(0, 3).map((t, i, arr) => (
            <Row key={t.id} last={i === arr.length - 1} {...clickable(() => navigate(`/tasks?taskId=${t.id}`))}>
              <div style={{ fontSize: 15, fontWeight: i === 0 ? 700 : 500 }}>{t.title}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: i === 0 ? ACC : '#777', marginTop: 4 }}>{dueText(t.dueDate, t.status)}</div>
            </Row>
          ))}
          {queue.length === 0 && <div style={{ borderTop: '1px solid #DDD', padding: '14px 0', fontSize: 14, color: '#777' }}>남은 업무가 없습니다.</div>}
        </section>

        <section>
          <Head no="02">일정</Head>
          {meetings.slice(0, 4).map((m, i, arr) => {
            const past = dayjs(m.startAt).isBefore(dayjs());
            return (
              <div key={m.id} className="fd-f-link" {...clickable(() => navigate(`/meetings?id=${m.id}`))} style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: '1px solid #DDD', borderBottom: i === arr.length - 1 ? '1px solid #DDD' : 'none', cursor: 'pointer' }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, width: 46, color: past ? '#999' : INK }}>{dayjs(m.startAt).format('HH:mm')}</span>
                <div><div style={{ fontSize: 15, fontWeight: past ? 400 : 700, color: past ? '#999' : INK, textDecoration: past ? 'line-through' : 'none' }}>{m.title}</div>{m.location && <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>{m.location}</div>}</div>
              </div>
            );
          })}
          {meetings.length === 0 && <div style={{ borderTop: '1px solid #DDD', padding: '14px 0', fontSize: 14, color: '#777' }}>오늘 예정된 회의가 없습니다.</div>}
        </section>

        <section>
          <Head no="03">받은 항목</Head>
          {inbox.map((it, i) => (
            <Row key={it.key} last={i === inbox.length - 1} {...clickable(() => navigate(it.to))}>
              <Tag hot={it.hot}>{it.tag}</Tag>
              <div style={{ fontSize: 15, fontWeight: it.hot ? 700 : 500, marginTop: 4 }}>{it.title}</div>
            </Row>
          ))}
          {inbox.length === 0 && <div style={{ borderTop: '1px solid #DDD', padding: '14px 0', fontSize: 14, color: '#777' }}>새로 받은 항목이 없습니다.</div>}
        </section>

        <section>
          <Head no="04">진행 현황</Head>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {bar('전체 업무', counts.total, '100%')}
            {bar('완료', counts.done, pct(counts.done), ACC)}
            {bar('진행중', counts.inProgress, pct(counts.inProgress))}
            {bar('대기', counts.pending, pct(counts.pending))}
            {okr?.progress != null && bar(`OKR ${okr.cycle.name}`, `${okr.progress}%`, `${okr.progress}%`, ACC)}
          </div>
        </section>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', paddingTop: 26, borderTop: '3px solid #111', marginTop: 34, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: '#666', letterSpacing: 0.6 }}>QUICK</span>
        <button onClick={() => onAddTask()} style={{ height: 42, padding: '0 20px', border: 0, background: ACC, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>+ 업무 추가</button>
        {[['메모', '/memos'], ['메일 쓰기', '/mail'], ['결재 상신', '/approvals/new']].map(([label, to]) => (
          <button key={label} onClick={() => navigate(to)} style={{ height: 42, padding: '0 20px', border: '1.5px solid #111', background: '#fff', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>
    </div>
  );
}
