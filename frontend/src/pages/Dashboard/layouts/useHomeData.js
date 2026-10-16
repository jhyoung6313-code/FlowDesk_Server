import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getTasks } from '../../../api/tasks';
import { getMyToday } from '../../../api/me';
import { getMailList } from '../../../api/mail';
import { getDashboardBbsCategories, getBbsPosts } from '../../../api/bbs';
import { getCycles, getTree } from '../../../api/okr';
import useAuthStore from '../../../store/authStore';
import useTaskStore from '../../../store/taskStore';
import usePreferenceStore from '../../../store/preferenceStore';
import { isOverdue } from '../../../utils/dday';

dayjs.extend(relativeTime);
dayjs.locale('ko');

export const PRIO_LABEL = { high: '높음', normal: '보통', low: '낮음' };
export const STATUS_LABEL = { pending: '대기', in_progress: '진행중', hold: '보류', done: '완료' };

export function greet() {
  const h = new Date().getHours();
  if (h < 12) return '좋은 아침입니다';
  if (h < 18) return '좋은 오후입니다';
  return '좋은 저녁입니다';
}

/* 마감 표시: 오늘 / 내일 / MM-DD / 지연 N일 */
export function dueText(dueDate, status) {
  if (!dueDate) return '마감 없음';
  const d = dayjs(dueDate).startOf('day');
  const diff = d.diff(dayjs().startOf('day'), 'day');
  if (status !== 'done' && diff < 0) return `${-diff}일 지연`;
  if (diff === 0) return '오늘 마감';
  if (diff === 1) return '내일 마감';
  return `${d.format('MM.DD')} 마감`;
}

/* 클릭 가능한 div/article 등에 붙이는 접근성 속성 — 키보드(Enter/Space)로도 동작하고 버튼으로 읽힌다 */
export const clickable = (fn) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e) => {
    if (e.target !== e.currentTarget) return;           // 안쪽 버튼/입력의 키 입력은 가로채지 않는다
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  },
});

/* 새 홈 레이아웃(A·C·E·F)이 공유하는 데이터 — 기존 API 만 사용한다 (새 서버 엔드포인트 없음) */
export default function useHomeData() {
  const user = useAuthStore((s) => s.user);
  const calVer = useTaskStore((s) => s.calendarVersion);
  const [tasks, setTasks] = useState([]);
  const [today, setToday] = useState(null);
  const [mails, setMails] = useState([]);
  const [notices, setNotices] = useState([]);
  const [okr, setOkr] = useState(null);       // { cycle, objs, progress } | null
  const [loading, setLoading] = useState(true);
  const [dayKey, setDayKey] = useState(() => dayjs().format('YYYY-MM-DD'));
  const scope = usePreferenceStore((s) => s.homeScope);        // 'all' | 'mine'
  const setScope = usePreferenceStore((s) => s.setHomeScope);
  const reqSeq = useRef({ tasks: 0, today: 0, mails: 0 });

  // 요청마다 번호를 매겨, 늦게 도착한 오래된 응답이 최신 응답(예: 방금 한 상태 변경)을 덮지 않게 한다
  const reload = useCallback(() => {
    const seq = reqSeq.current;
    const a = ++seq.tasks; const b = ++seq.today; const c = ++seq.mails;
    // 세 요청이 모두 끝나면 이행되는 Promise 를 돌려줘, 호출부(드롭 직후 등)가 갱신 완료를 기다릴 수 있다
    return Promise.all([
      getTasks().then((t) => { if (a === seq.tasks) setTasks(Array.isArray(t) ? t : []); }).catch(() => {}).finally(() => setLoading(false)),
      getMyToday().then((d) => { if (b === seq.today) setToday(d); }).catch(() => {}),
      getMailList({ folder: 'inbox', page: 1, limit: 5 }).then((d) => { if (c === seq.mails) setMails(d.mails || []); }).catch(() => {}),
    ]);
  }, []);

  // 업무 변경(calVer)·창 포커스·5분 주기로 갱신, 자정이 지나면 "오늘" 기준도 갱신
  useEffect(() => { reload(); }, [calVer, reload]);
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    const t = setInterval(() => { reload(); setDayKey(dayjs().format('YYYY-MM-DD')); }, 5 * 60 * 1000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t); };
  }, [reload]);

  // 공지(게시판 대시보드 노출 카테고리 중 첫 번째)
  useEffect(() => {
    let alive = true;
    getDashboardBbsCategories()
      .then(({ admin = [], personal = [] }) => {
        const cat = [...admin, ...personal][0];
        if (!cat) return null;
        return getBbsPosts({ categoryId: cat.id, page: 1, limit: 4 }).then((d) => ({ cat, posts: d.posts || [] }));
      })
      .then((r) => { if (alive && r) setNotices(r.posts.map((p) => ({ ...p, _catId: r.cat.id }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // OKR: 오늘 포함 활성 주기 → 없으면 가장 최근 종료 주기, 내가 맡은 목표 평균 진척
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    (async () => {
      try {
        const cycles = await getCycles();
        const now = dayjs();
        const active = cycles.filter((c) => c.isActive);
        const current = active.find((c) => !now.isBefore(c.startDate, 'day') && !now.isAfter(c.endDate, 'day'));
        const lastEnded = active.filter((c) => now.isAfter(c.endDate, 'day'))
          .sort((a, b) => dayjs(b.endDate).valueOf() - dayjs(a.endDate).valueOf())[0];
        const cycle = current || lastEnded || active[0];
        if (!cycle) return;
        const tree = await getTree(cycle.id);
        const objs = tree.filter((o) => o.ownerId === user.id);
        const progress = objs.length ? Math.round(objs.reduce((s, o) => s + (o.progress || 0), 0) / objs.length) : null;
        if (alive) setOkr({ cycle, objs, progress });
      } catch { /* OKR 미사용 환경 */ }
    })();
    return () => { alive = false; };
  }, [user]);

  const derived = useMemo(() => {
    const uid = user?.id;
    const mine = (t) => t.createdBy === uid || (t.assignees || []).some((a) => (a.userId ?? a.user?.id) === uid);
    const active = tasks.filter((t) => t.delYn !== '1' && (scope === 'all' || mine(t)));
    const startToday = dayjs().startOf('day');
    const isToday = (d) => d && dayjs(d).startOf('day').isSame(startToday);
    const rank = (t) => (isOverdue(t.dueDate, t.status) ? 0 : isToday(t.dueDate) ? 1 : 2);
    const notDone = active.filter((t) => t.status !== 'done');
    const focusList = notDone
      .filter((t) => isOverdue(t.dueDate, t.status) || isToday(t.dueDate) || t.priority === 'high')
      .sort((a, b) => rank(a) - rank(b));
    // 포커스 후보가 없으면 진행중 → 대기 순으로 보여준다
    const fallback = notDone
      .filter((t) => t.status === 'in_progress')
      .concat(notDone.filter((t) => t.status === 'pending'));
    const queue = focusList.length ? focusList : fallback;
    // "오늘 N건" = 마감이 오늘이거나 이미 지난 미완료 업무 (우선순위 '높음'만으로는 세지 않는다)
    const todayCount = notDone.filter((t) => isOverdue(t.dueDate, t.status) || isToday(t.dueDate)).length;
    const counts = {
      total: active.length,
      pending: active.filter((t) => t.status === 'pending').length,
      inProgress: active.filter((t) => t.status === 'in_progress').length,
      hold: active.filter((t) => t.status === 'hold').length,
      done: active.filter((t) => t.status === 'done').length,
      overdue: active.filter((t) => isOverdue(t.dueDate, t.status)).length,
    };
    return { active, focusList, queue, counts, todayCount };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, dayKey, scope, user?.id]);

  return {
    user, loading, reload, ...derived,
    scope, setScope, scopeLabel: scope === 'mine' ? '내 담당 업무' : '전체 업무',
    today, mails, notices, okr,
    meetings: today?.meetings || [],
    approvals: today?.approvals || [],
    actionItems: today?.actionItems || [],
    unreadMail: today?.counts?.unreadMail ?? mails.filter((m) => !m.isRead).length,
    unreadNotifications: today?.counts?.unreadNotifications ?? 0,
  };
}
