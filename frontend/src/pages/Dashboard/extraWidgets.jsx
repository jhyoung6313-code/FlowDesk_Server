import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, Progress, Empty } from 'antd';
import dayjs from 'dayjs';
import { getCycles, getTree } from '../../api/okr';

/* 대시보드 추가 위젯 카탈로그 — 기본은 숨김, 편집 모드의 "+ 위젯" 에서 추가한다.
   id 는 저장된 레이아웃(v:1)의 키이므로 변경하지 않는다. needs='myday' 는 getMyToday 데이터가 필요함. */
export const EXTRA_BLOCKS = [
  { id: 'x-counts',    title: '☀️ 오늘 한눈에',   needs: 'myday', layout: { w: 12, h: 3 } },
  { id: 'x-approvals', title: '✍️ 결재 대기',     needs: 'myday', layout: { w: 6,  h: 6 } },
  { id: 'x-meetings',  title: '🗓 오늘 회의',     needs: 'myday', layout: { w: 6,  h: 6 } },
  { id: 'x-actions',   title: '✅ 내 액션아이템', needs: 'myday', layout: { w: 6,  h: 6 } },
  { id: 'x-okr',       title: '🎯 OKR 진척',      needs: null,    layout: { w: 6,  h: 6 } },
];
export const EXTRA_IDS = EXTRA_BLOCKS.map((b) => b.id);

const wrap = { padding: '14px 16px', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 };
const rowStyle = (D) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  padding: '7px 0', borderBottom: `1px solid ${D.border}`, cursor: 'pointer', fontSize: 13,
});
const Title = ({ children, to, D }) => {
  const navigate = useNavigate();
  return (
    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'baseline' }}>
      {children}
      {to && <span onClick={() => navigate(to)} style={{ fontSize: 13, fontWeight: 500, color: D.text2, cursor: 'pointer' }}>· 전체 보기</span>}
    </div>
  );
};
const Empty_ = ({ text }) => <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;

export function CountsWidget({ data, D }) {
  const navigate = useNavigate();
  const c = data?.counts;
  const items = c ? [
    ['내 업무', c.tasks, '/tasks', null],
    ['지연', c.overdueTasks, '/tasks', c.overdueTasks ? '#ef4444' : null],
    ['결재 대기', c.approvals, '/approvals', c.approvals ? '#fa8c16' : null],
    ['오늘 회의', c.meetings, '/meetings', null],
    ['액션아이템', c.actionItems, '/meetings', null],
    ['안읽은 메일', c.unreadMail, '/mail', null],
    ['안읽은 알림', c.unreadNotifications, '/notifications', null],
  ] : [];
  return (
    <div style={wrap}>
      <Title D={D}>☀️ 오늘 한눈에</Title>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {items.map(([label, v, to, color]) => (
          <div key={label} onClick={() => navigate(to)}
            style={{ flex: '1 1 90px', minWidth: 90, padding: '6px 10px', border: `1px solid ${D.border}`, borderRadius: 10, cursor: 'pointer' }}>
            <div style={{ fontSize: 13, color: D.text2 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: color || undefined }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApprovalsWidget({ data, D }) {
  const navigate = useNavigate();
  const list = data?.approvals || [];
  return (
    <div style={wrap}>
      <Title D={D} to="/approvals">✍️ 결재 대기 <Tag>{list.length}</Tag></Title>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {list.length ? list.map((a) => (
          <div key={a.id} style={rowStyle(D)} onClick={() => navigate(`/approvals/${a.id}`)}>
            <span>{a.docNo && <Tag>{a.docNo}</Tag>}{a.title}</span>
          </div>
        )) : <Empty_ text="결재할 문서가 없습니다." />}
      </div>
    </div>
  );
}

export function MeetingsWidget({ data, D }) {
  const navigate = useNavigate();
  const list = data?.meetings || [];
  return (
    <div style={wrap}>
      <Title D={D} to="/meetings">🗓 오늘 회의 <Tag>{list.length}</Tag></Title>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {list.length ? list.map((m) => (
          <div key={m.id} style={rowStyle(D)} onClick={() => navigate(`/meetings?id=${m.id}`)}>
            <span>{m.title}</span>
            <span style={{ color: D.text2 }}>{dayjs(m.startAt).format('HH:mm')}{m.location ? ` · ${m.location}` : ''}</span>
          </div>
        )) : <Empty_ text="오늘 예정된 회의가 없습니다." />}
      </div>
    </div>
  );
}

export function ActionsWidget({ data, D }) {
  const navigate = useNavigate();
  const list = data?.actionItems || [];
  return (
    <div style={wrap}>
      <Title D={D} to="/meetings">✅ 내 액션아이템 <Tag>{list.length}</Tag></Title>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {list.length ? list.map((a) => (
          <div key={a.id} style={rowStyle(D)} onClick={() => navigate(`/meetings?id=${a.meetingId}`)}>
            <span>{a.content}</span>
            <span>
              {a.overdue && <Tag color="red">지연</Tag>}
              {a.dueDate && <span style={{ color: D.text2 }}>{dayjs(a.dueDate).format('MM/DD')}</span>}
            </span>
          </div>
        )) : <Empty_ text="배정된 액션아이템이 없습니다." />}
      </div>
    </div>
  );
}

/* 진행 중인 주기(없으면 최신 주기)의 내 목표 진척 — 내가 owner 인 목표만 */
export function OkrWidget({ D, userId }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, cycle: null, objs: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cycles = await getCycles();
        const today = dayjs();
        const cycle = cycles.find((c) => c.isActive && !today.isBefore(c.startDate, 'day') && !today.isAfter(c.endDate, 'day'))
          || cycles.find((c) => c.isActive) || cycles[0];
        if (!cycle) return alive && setState({ loading: false, cycle: null, objs: [] });
        const tree = await getTree(cycle.id);
        const mine = tree.filter((o) => o.ownerId === userId);
        if (alive) setState({ loading: false, cycle, objs: mine });
      } catch {
        if (alive) setState({ loading: false, cycle: null, objs: [] });
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  return (
    <div style={wrap}>
      <Title D={D} to="/okr">🎯 OKR 진척 {state.cycle && <Tag>{state.cycle.name}</Tag>}</Title>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {state.objs.length ? state.objs.map((o) => (
          <div key={o.id} style={{ ...rowStyle(D), flexDirection: 'column', alignItems: 'stretch', gap: 4 }} onClick={() => navigate('/okr')}>
            <span>{o.title}</span>
            <Progress percent={Math.round(o.progress || 0)} size="small" />
          </div>
        )) : <Empty_ text={state.loading ? '불러오는 중...' : '내가 맡은 목표가 없습니다.'} />}
      </div>
    </div>
  );
}
