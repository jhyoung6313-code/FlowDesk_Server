import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, message, Popover, Checkbox, Button, Empty as AntEmpty, Tooltip } from 'antd';
import { SettingOutlined, EditOutlined, CheckOutlined, EyeInvisibleOutlined, ReloadOutlined, HolderOutlined } from '@ant-design/icons';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { getDashboardLayout, updateDashboardLayout } from '../../api/settings';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getTasks } from '../../api/tasks';
import { getMailList } from '../../api/mail';
import { getBbsCategories, getBbsPosts, getDashboardBbsCategories, setPersonalDashboardBbsCategories } from '../../api/bbs';
import { getApprovals } from '../../api/approval';
import useTaskStore from '../../store/taskStore';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import useMemoStore from '../../store/memoStore';
import { isOverdue } from '../../utils/dday';
import { AVATAR_COLOR_PRESETS } from '../../utils/colors';
import MemoCard from '../../components/Memo/MemoCard';
import TaskForm from '../../components/Task/TaskForm';
import ScheduleWidget from '../../components/Schedule/ScheduleWidget';
import AiWeeklySummary from '../../components/ai/AiWeeklySummary';
import AiAsk from '../../components/ai/AiAsk';

dayjs.extend(relativeTime);
dayjs.locale('ko');

/* 이름 → 아바타 배경색 */
function nameColor(name) {
  if (!name) return AVATAR_COLOR_PRESETS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLOR_PRESETS[Math.abs(h) % AVATAR_COLOR_PRESETS.length];
}

/* 시간대별 인사말 */
function greet() {
  const h = new Date().getHours();
  if (h < 12) return '좋은 아침입니다';
  if (h < 18) return '좋은 오후입니다';
  return '좋은 저녁입니다';
}

/* 지연 경과일 */
function daysLate(dueDate) {
  return dayjs().startOf('day').diff(dayjs(dueDate).startOf('day'), 'day');
}

const RGL = WidthProvider(GridLayout);

/* 대시보드 커스터마이즈: 섹션(블록) 정의 · 기본 레이아웃 · 기본 사용여부 */
const DASH_BLOCKS = [
  { id: 'focus',    title: '🎯 오늘의 포커스' },
  { id: 'schedule', title: '📅 이번 주 일정·자원' },
  { id: 'board',    title: '🗂 업무 보드' },
  { id: 'widgets',  title: '📥 받은항목·게시판·결재' },
  { id: 'memo',     title: '📌 고정 메모' },
];
const DASH_DEFAULT_LAYOUT = [
  { i: 'focus',    x: 0, y: 0,  w: 12, h: 6 },
  { i: 'schedule', x: 0, y: 6,  w: 12, h: 5 },
  { i: 'board',    x: 0, y: 11, w: 12, h: 10 },
  { i: 'widgets',  x: 0, y: 21, w: 12, h: 8 },
  { i: 'memo',     x: 0, y: 29, w: 12, h: 3 },
];
const DASH_DEFAULT_ENABLED = { focus: true, schedule: true, board: true, widgets: true, memo: true };

/* 각 섹션을 감싸는 블록 카드 — 편집모드에서만 드래그 핸들/숨김 표시 */
function DashBlock({ editing, onHide, D, children }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      // 편집 중엔 overflow visible 로 두어 우하단 리사이즈 핸들이 가려지지 않게 한다.
      overflow: editing ? 'visible' : 'hidden',
      background: D.cardBg, borderRadius: 'var(--fd-sk-radius-lg, 14px)',
      border: `var(--fd-sk-border-w, 1px) solid ${editing ? '#93c5fd' : D.cardBor}`,
      boxShadow: editing ? '0 2px 10px rgba(59,130,246,.12)' : 'var(--fd-sk-shadow, none)',
    }}>
      {editing && (
        <div className="dash-drag-handle" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px', flexShrink: 0, cursor: 'move',
          borderBottom: `1px solid ${D.border}`, background: D.stripBg,
          borderRadius: '13px 13px 0 0',
        }}>
          <span style={{ fontSize: 12, color: D.text2, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <HolderOutlined /> 드래그 이동 · 모서리로 크기조절
          </span>
          <span onClick={(e) => { e.stopPropagation(); onHide(); }}
            style={{ fontSize: 12, color: '#c73a2f', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <EyeInvisibleOutlined /> 숨기기
          </span>
        </div>
      )}
      {/* 편집 중엔 body pointer-events 를 none 으로: 우하단 리사이즈 핸들/드래그를 방해하지 않음 */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', pointerEvents: editing ? 'none' : 'auto' }}>{children}</div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate   = useNavigate();
  const isDark     = useThemeStore((s) => s.isDark);
  const skin       = useThemeStore((s) => s.skin);
  const user       = useAuthStore((s) => s.user);
  const calVer     = useTaskStore((s) => s.calendarVersion);
  const { addTask, editTask, fetchTasks } = useTaskStore();

  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formStatus, setFormStatus] = useState('pending');
  const [selectedTask, setSelectedTask] = useState(null);

  const memos        = useMemoStore((s) => s.memos);
  const fetchMemos   = useMemoStore((s) => s.fetch);
  const updateMemo   = useMemoStore((s) => s.update);
  const removeMemo   = useMemoStore((s) => s.remove);
  const pinnedMemos  = useMemo(() => memos.filter((m) => m.pinned), [memos]);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);

  /* ── 하단 위젯: 받은메일 · 게시판 · 결재 ── */
  const [mails,    setMails]    = useState([]);
  const [bbsAdminCats,    setBbsAdminCats]    = useState([]);  // 관리자 지정 (우선)
  const [bbsPersonalCats, setBbsPersonalCats] = useState([]);  // 개인 지정
  const [bbsCatId, setBbsCatId] = useState(() => {
    const v = localStorage.getItem('dashboard_bbs_cat');
    return v ? Number(v) : null;
  });
  const [bbsPosts, setBbsPosts] = useState([]);
  const [approvals, setApprovals] = useState([]);

  /* ── 대시보드 커스터마이즈(레이아웃/사용여부) 상태 ── */
  const [dashLayout, setDashLayout]   = useState(DASH_DEFAULT_LAYOUT);
  const [dashEnabled, setDashEnabled] = useState(DASH_DEFAULT_ENABLED);
  const [dashEditing, setDashEditing] = useState(false);
  const dashSaveTimer = useRef(null);

  // 서버에서 저장된 레이아웃 로드
  useEffect(() => {
    getDashboardLayout().then((d) => {
      if (d && Array.isArray(d.layout) && d.layout.length) {
        const byId = Object.fromEntries(d.layout.map((l) => [l.i, l]));
        const merged = DASH_BLOCKS.map((b) => {
          const s = byId[b.id];
          const def = DASH_DEFAULT_LAYOUT.find((dl) => dl.i === b.id);
          return s ? { i: b.id, x: s.x, y: s.y, w: s.w, h: s.h } : def;
        });
        setDashLayout(merged);
        if (d.enabled) setDashEnabled({ ...DASH_DEFAULT_ENABLED, ...d.enabled });
      }
    }).catch(() => {});
  }, []);

  const persistDash = useCallback((layout, enabled) => {
    clearTimeout(dashSaveTimer.current);
    dashSaveTimer.current = setTimeout(() => {
      updateDashboardLayout({ v: 1, layout, enabled }).catch(() => {});
    }, 600);
  }, []);

  const handleDashLayoutChange = useCallback((l) => {
    setDashLayout((prev) => {
      const byId = Object.fromEntries(l.map((x) => [x.i, x]));
      const merged = prev.map((p) => (byId[p.i] ? { ...p, ...byId[p.i] } : p));
      l.forEach((x) => { if (!merged.some((m) => m.i === x.i)) merged.push(x); });
      return merged;
    });
  }, []);

  const toggleDashBlock = useCallback((id) => {
    setDashEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      setDashLayout((lay) => { persistDash(lay, next); return lay; });
      return next;
    });
  }, [persistDash]);

  const resetDashLayout = useCallback(() => {
    setDashLayout(DASH_DEFAULT_LAYOUT);
    setDashEnabled(DASH_DEFAULT_ENABLED);
    persistDash(DASH_DEFAULT_LAYOUT, DASH_DEFAULT_ENABLED);
  }, [persistDash]);

  const finishDashEdit = useCallback(() => {
    setDashEditing(false);
    setDashLayout((lay) => { setDashEnabled((en) => { persistDash(lay, en); return en; }); return lay; });
  }, [persistDash]);

  // 개인 게시판 설정 Popover
  const [allCats, setAllCats] = useState([]);
  const [prefOpen, setPrefOpen] = useState(false);
  const [prefSel, setPrefSel] = useState([]);

  const loadDashboardBbs = useCallback(() => {
    return getDashboardBbsCategories()
      .then(({ admin = [], personal = [] }) => {
        setBbsAdminCats(admin);
        setBbsPersonalCats(personal);
        // 선택 카테고리 보정: 현재 선택이 목록에 없으면 admin → personal 첫 항목
        const ids = [...admin, ...personal].map((c) => c.id);
        setBbsCatId((prev) => (prev && ids.includes(prev)) ? prev : (ids[0] ?? null));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getMailList({ folder: 'inbox', page: 1, limit: 6 })
      .then((d) => setMails(d.mails || [])).catch(() => {});
    getApprovals({ tab: 'pending', page: 1, limit: 6 })
      .then((d) => setApprovals(d.documents || [])).catch(() => {});
    loadDashboardBbs();
  }, [loadDashboardBbs]);

  // 개인 설정 Popover 열 때: 전체 활성 카테고리 로드 + 현재 개인 선택 반영
  const openPref = useCallback(() => {
    getBbsCategories()
      .then((cats) => setAllCats((cats || []).filter((c) => c.isActive !== false)))
      .catch(() => {});
    setPrefSel(bbsPersonalCats.map((c) => c.id));
    setPrefOpen(true);
  }, [bbsPersonalCats]);

  const savePref = useCallback(async () => {
    try {
      await setPersonalDashboardBbsCategories(prefSel);
      setPrefOpen(false);
      await loadDashboardBbs();
    } catch {
      message.error('개인 게시판 설정 저장에 실패했습니다.');
    }
  }, [prefSel, loadDashboardBbs]);

  useEffect(() => {
    if (!bbsCatId) { setBbsPosts([]); return; }
    localStorage.setItem('dashboard_bbs_cat', String(bbsCatId));
    getBbsPosts({ categoryId: bbsCatId, page: 1, limit: 6 })
      .then((d) => setBbsPosts(d.posts || [])).catch(() => {});
  }, [bbsCatId]);

  const loadTasks = useCallback(() => {
    setLoading(true);
    getTasks()
      .then((t) => { setTasks(t); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTasks(); }, [calVer, loadTasks]);

  const handleFormSubmit = useCallback(async (data) => {
    if (selectedTask) {
      await editTask(selectedTask.id, data);
      message.success('업무가 수정되었습니다.');
    } else {
      await addTask(data);
      message.success('업무가 등록되었습니다.');
    }
    fetchTasks();
    loadTasks();
  }, [selectedTask, addTask, editTask, fetchTasks, loadTasks]);

  const active  = useMemo(() => tasks.filter((t) => t.delYn !== '1'), [tasks]);
  const overdue = useMemo(() => active.filter((t) => t.status !== 'hold' && isOverdue(t.dueDate, t.status)), [active]);

  const cols = useMemo(() => ({
    pending:     active.filter((t) => t.status === 'pending'     && !isOverdue(t.dueDate, t.status)),
    in_progress: active.filter((t) => t.status === 'in_progress' && !isOverdue(t.dueDate, t.status)),
    hold:        active.filter((t) => t.status === 'hold'),
    done:        active.filter((t) => t.status === 'done'),
    overdue,
  }), [active, overdue]);

  /* ── 색상 (라이트/다크) ──
     표면/테두리/배경은 스킨 CSS 변수를 참조해 스킨(형태 테마)에 자동 반응한다.
     텍스트/의미색은 라이트·다크 값 유지. */
  const D = isDark ? {
    pageBg:   'var(--fd-sk-page-bg, #181b24)',
    navBg:    'var(--fd-sk-card-bg, #1e222c)',
    border:   'var(--fd-sk-border-color, rgba(255,255,255,.1))',
    text1:    '#e8e8ee',
    text2:    '#94a3b8',
    colBg:    'var(--fd-sk-surface-sunken, #20242f)',   // 컬럼: 페이지보다 한 단계 위
    cardBg:   'var(--fd-sk-card-bg, #2b313d)',          // 카드: 솔리드 elevated 로 또렷하게 구분
    cardBor:  'var(--fd-sk-border-color, rgba(255,255,255,.1))',
    addBor:   'var(--fd-sk-border-color, rgba(255,255,255,.14))',
    addTxt:   '#94a3b8',
    stripBg:  'var(--fd-sk-surface-sunken, #1e222c)',
  } : {
    // Notion Warm 기준에 맞춘 대시보드 중립 팔레트 (의미색 틴트는 컬럼/위젯에서 유지)
    pageBg:   'var(--fd-sk-page-bg, #f4f4f2)',
    navBg:    'var(--fd-sk-card-bg, #ffffff)',
    border:   'var(--fd-sk-border-color, #e9e7e2)',
    text1:    '#37352f',
    text2:    '#a8a29a',
    colBg:    'var(--fd-sk-surface-sunken, #f2f1ec)',
    cardBg:   'var(--fd-sk-card-bg, #ffffff)',
    cardBor:  'var(--fd-sk-border-color, #e9e7e2)',
    addBor:   'var(--fd-sk-border-color, #dcd8d0)',
    addTxt:   '#a8a29a',
    stripBg:  'var(--fd-sk-card-bg, #ffffff)',
  };

  if (loading) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.pageBg }}>
        <Spin size="large" />
      </div>
    );
  }

  /* ── 칸반 열 정의 ── */
  const COLUMNS = [
    {
      key: 'pending',
      label: '대기',
      dot:   '#a8a29a',
      cntBg: isDark ? 'rgba(255,255,255,.06)' : '#f2f1ec',
      cntC:  isDark ? '#cbd5e1' : '#8a827a',
      colBg: isDark ? 'rgba(148,163,184,.08)' : '#faf9f6',
      borderColor: isDark ? 'rgba(148,163,184,.15)' : '#e9e7e2',
      tasks: cols.pending,
    },
    {
      key: 'in_progress',
      label: '진행중',
      dot:   '#3B82F6',
      cntBg: isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF',
      cntC:  '#3B82F6',
      colBg: isDark ? 'rgba(59,130,246,.05)' : '#F0F7FF',
      borderColor: isDark ? 'rgba(59,130,246,.2)' : '#BFDBFE',
      tasks: cols.in_progress,
    },
    {
      key: 'hold',
      label: '보류',
      dot:   '#F59E0B',
      cntBg: isDark ? 'rgba(245,158,11,.15)' : '#FEF3C7',
      cntC:  '#D97706',
      colBg: isDark ? 'rgba(245,158,11,.05)' : '#FFFBEB',
      borderColor: isDark ? 'rgba(245,158,11,.2)' : '#FDE68A',
      tasks: cols.hold,
    },
    {
      key: 'done',
      label: '완료',
      dot:   '#059669',
      cntBg: isDark ? 'rgba(5,150,105,.15)' : '#F0FDF4',
      cntC:  '#059669',
      colBg: isDark ? 'rgba(5,150,105,.05)' : '#F0FDF9',
      borderColor: isDark ? 'rgba(5,150,105,.2)' : '#A7F3D0',
      tasks: cols.done,
    },
    {
      key: 'overdue',
      label: '지연',
      dot:   '#EF4444',
      cntBg: isDark ? 'rgba(239,68,68,.15)' : '#FEE2E2',
      cntC:  '#DC2626',
      colBg: isDark ? 'rgba(239,68,68,.05)' : '#FFF5F5',
      borderColor: isDark ? 'rgba(239,68,68,.2)' : '#FECACA',
      tasks: cols.overdue,
    },
  ];

  /* 우선순위 태그 */
  const PRIO = {
    high:   { label: '높음', bg: '#FFF7ED', color: '#C2410C' },
    normal: { label: '보통', bg: '#EFF6FF', color: '#3B82F6' },
    low:    { label: '낮음', bg: '#F0FDF4', color: '#15803D' },
  };

  /* ── 위젯 공통 스타일 ── */
  const wHoverBg = isDark ? 'rgba(255,255,255,.04)' : '#F8FAFC';
  const wCard = {
    background: D.cardBg, border: `var(--fd-sk-border-w, 1px) solid ${D.cardBor}`, borderRadius: 'var(--fd-sk-radius-lg, 14px)',
    boxShadow: 'var(--fd-sk-shadow, none)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', minHeight: 0,
  };
  const wHead = {
    display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px',
    borderBottom: `1px solid ${D.border}`, flexShrink: 0,
  };
  const wIco  = { width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 };
  const wTtl  = { fontSize: 13, fontWeight: 700, flex: 1, color: D.text1 };
  const wBadge= { fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20 };
  const wMore = { fontSize: 12, color: D.text2, cursor: 'pointer', whiteSpace: 'nowrap' };
  const wBody = { flex: 1, overflowY: 'auto', padding: '4px 0' };
  const wEmpty= { padding: '36px 16px', textAlign: 'center', color: D.text2, fontSize: 12 };
  const wRow  = { display: 'flex', gap: 10, padding: '9px 15px', cursor: 'pointer', borderBottom: `1px solid ${D.border}` };
  const ell   = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  const unreadCount = mails.filter((m) => !m.isRead).length;

  /* ── 히어로: 오늘의 포커스 파생 데이터 ── */
  const today = dayjs().startOf('day');
  const isToday = (d) => d && dayjs(d).startOf('day').isSame(today);
  const rankPrio = (t) => (isOverdue(t.dueDate, t.status) ? 0 : isToday(t.dueDate) ? 1 : 2);
  const todayPriorities = active
    .filter((t) => t.status !== 'done')
    .filter((t) => isOverdue(t.dueDate, t.status) || isToday(t.dueDate) || t.priority === 'high')
    .sort((a, b) => rankPrio(a) - rankPrio(b))
    .slice(0, 6);
  const dueTodayCount = active.filter((t) => t.status !== 'done' && isToday(t.dueDate)).length;
  const atRisk = active
    .filter((t) => t.status !== 'done' && (isOverdue(t.dueDate, t.status) || isToday(t.dueDate)))
    .sort((a, b) => rankPrio(a) - rankPrio(b))
    .slice(0, 4);

  /* 히어로 전용 스타일 */
  const heroCard = { background: D.cardBg, border: `var(--fd-sk-border-w, 1px) solid ${D.cardBor}`, borderRadius: 'var(--fd-sk-radius-lg, 12px)', boxShadow: 'var(--fd-sk-shadow, 0 1px 2px rgba(55,53,47,.05), 0 1px 3px rgba(55,53,47,.04))', padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 };
  const heroHd   = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
  const heroHdT  = { fontSize: 13, fontWeight: 700, color: D.text1, display: 'flex', alignItems: 'center', gap: 7 };
  const secTitle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 'var(--fd-sk-font-weight-hd, 700)', color: D.text1, marginBottom: 10,
    ...(skin === 'mono' ? { textTransform: 'uppercase', letterSpacing: '0.12em' } : {}) };
  /* ── KPI 타일: 스킨별 표현 (flat=브루탈·grad=클레이·line=모노·tint=기본) ── */
  const KPI_MODE = { default: 'tint', brutal: 'flat', clay: 'grad', mono: 'line', glass: 'grad', pop: 'flat', slick: 'tint', paper: 'tint' }[skin] || 'tint';
  const kpiBgVar = (variant) => (variant === 'accent' ? 'var(--fd-sk-kpi-a)' : variant === 'risk' ? 'var(--fd-sk-kpi-b)' : variant === 'info' ? 'var(--fd-sk-kpi-c)' : null);
  const kpiColored = (v) => v === 'accent' || v === 'risk' || v === 'info';
  const kpiTile  = (variant) => {
    const base = { borderRadius: 'var(--fd-sk-radius-lg, 12px)', padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 3, minWidth: 0, cursor: 'pointer' };
    const bg = kpiBgVar(variant);
    if (KPI_MODE === 'flat') // 브루탈: 솔리드 컬러 블록 + 검정 테두리 + 하드 그림자
      return { ...base, background: kpiColored(variant) ? bg : D.cardBg, border: 'var(--fd-sk-border-w, 2.5px) solid var(--fd-sk-border-color, #111)', boxShadow: 'var(--fd-sk-shadow-sm, 2px 2px 0 #111)' };
    if (KPI_MODE === 'grad') // 클레이: 그라데이션 + 말랑 그림자 + 테두리 없음
      return { ...base, background: kpiColored(variant) ? bg : D.cardBg, border: 'none', boxShadow: 'var(--fd-sk-shadow-sm)' };
    if (KPI_MODE === 'line') // 모노: 흰/다크 카드 + 헤어라인 + 좌측 컬러 바
      return { ...base, background: D.cardBg, border: '1px solid var(--fd-sk-border-color, #ececec)', borderLeft: kpiColored(variant) ? `3px solid ${variant === 'accent' ? '#12b886' : variant === 'risk' ? '#f0392b' : '#3b82f6'}` : '1px solid var(--fd-sk-border-color, #ececec)', boxShadow: 'none' };
    // tint(기본): 연한 틴트 배경 + 컬러 숫자
    return { ...base, border: 'var(--fd-sk-border-w, 1px) solid',
      ...(variant === 'accent' ? { background: kpiBgVar('accent'), borderColor: isDark ? 'rgba(22,163,74,.3)' : '#bfe6cd' }
        : variant === 'risk' ? { background: kpiBgVar('risk'), borderColor: isDark ? 'rgba(199,58,47,.3)' : '#f7ddd6' }
        : { background: D.cardBg, borderColor: D.cardBor }) };
  };
  const kpiTxtColor = (variant) => {
    if (KPI_MODE === 'flat' || KPI_MODE === 'grad') return kpiColored(variant) ? 'var(--fd-sk-kpi-txt)' : D.text1;
    // tint/line: 의미색 숫자
    return variant === 'accent' ? '#15803d' : variant === 'risk' ? '#c73a2f' : variant === 'info' ? '#2563eb' : D.text1;
  };
  const kpiMuted = (variant) => ((KPI_MODE === 'flat' || KPI_MODE === 'grad') && kpiColored(variant)) ? 'var(--fd-sk-kpi-txt)' : D.text2;
  const kpiLbl   = (variant) => ({ fontSize: 12, color: kpiMuted(variant), fontWeight: 700, opacity: (KPI_MODE === 'flat' || KPI_MODE === 'grad') && kpiColored(variant) ? 0.92 : 1, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    ...(KPI_MODE === 'line' ? { textTransform: 'uppercase', letterSpacing: '0.1em' } : {}) });
  const kpiBig   = (variant) => ({ fontSize: 28, fontWeight: 900, lineHeight: 1, marginTop: 6, letterSpacing: '-1px', fontFamily: 'var(--fd-sk-font-num)', color: kpiTxtColor(variant) });
  const kpiSub   = (variant) => ({ fontSize: 12, color: kpiMuted(variant), opacity: (KPI_MODE === 'flat' || KPI_MODE === 'grad') && kpiColored(variant) ? 0.8 : 1, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
  const qbtn     = (green) => ({
    background: green ? '#16a34a' : D.cardBg, color: green ? '#fff' : D.text2,
    border: `1px solid ${green ? '#16a34a' : D.cardBor}`, borderRadius: 8, padding: '6px 8px',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  /* 표시할 블록 + 그리드 레이아웃 (숨김 블록·빈 메모는 제외) */
  const dashVisibleIds = DASH_BLOCKS
    .filter((b) => dashEnabled[b.id] && !(b.id === 'memo' && pinnedMemos.length === 0))
    .map((b) => b.id);
  const dashVisLayout = dashLayout.filter((l) => dashVisibleIds.includes(l.i));
  const dashHiddenBlocks = DASH_BLOCKS.filter((b) => !dashEnabled[b.id]);

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: D.pageBg,
      overflowY: 'auto',
    }}>

      {/* ══ 편집 툴바 (아이콘 최소화) ══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '6px 16px 0', flexWrap: 'wrap' }}>
        {dashEditing && dashHiddenBlocks.map((b) => (
          <Button key={b.id} size="small" onClick={() => toggleDashBlock(b.id)}>+ {b.title}</Button>
        ))}
        {dashEditing && (
          <Tooltip title="레이아웃·표시 상태를 기본값으로 되돌립니다">
            <Button size="small" shape="circle" icon={<ReloadOutlined />} onClick={resetDashLayout} />
          </Tooltip>
        )}
        <Tooltip title={dashEditing ? '편집 완료' : '대시보드 편집'}>
          <Button
            size="small"
            shape="circle"
            type={dashEditing ? 'primary' : 'default'}
            icon={dashEditing ? <CheckOutlined /> : <EditOutlined />}
            onClick={() => (dashEditing ? finishDashEdit() : setDashEditing(true))}
          />
        </Tooltip>
      </div>

      {/* ══ 커스터마이즈 그리드 ══ */}
      <RGL
        className="dashboard-grid"
        layout={dashVisLayout}
        cols={12}
        rowHeight={40}
        margin={[14, 14]}
        containerPadding={[20, 12]}
        isDraggable={dashEditing}
        isResizable={dashEditing}
        draggableHandle=".dash-drag-handle"
        onLayoutChange={handleDashLayoutChange}
        useCSSTransforms
      >

      {dashEnabled.focus && (
      <div key="focus">
      <DashBlock editing={dashEditing} onHide={() => toggleDashBlock('focus')} D={D}>
      {/* ══ 히어로: 오늘의 포커스 (오늘 우선순위 + KPI) ══ */}
      <div style={{ padding: '14px 16px', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={secTitle}>🎯 오늘의 포커스
          <span style={{ fontSize: 12, fontWeight: 600, color: D.text2 }}>지금 집중해야 할 일</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 14, alignItems: 'stretch', flex: 1, minHeight: 0 }}>

          {/* ① 오늘 우선순위 체크리스트 */}
          <div style={heroCard}>
            <div style={heroHd}>
              <span style={heroHdT}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} /> 오늘 우선순위</span>
              <span style={{ background: '#16a34a', color: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 700, padding: '1px 9px' }}>{todayPriorities.length}</span>
            </div>
            {todayPriorities.length === 0 ? (
              <div style={{ flex: 1, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.text2, fontSize: 12 }}>오늘 집중할 우선 업무가 없습니다 🎉</div>
            ) : todayPriorities.map((t) => {
              const late = isOverdue(t.dueDate, t.status);
              const prio = t.priority ? PRIO[t.priority] : null;
              const done = t.status === 'done';
              return (
                <div key={t.id} onClick={() => { setSelectedTask(t); setFormOpen(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${D.border}`, cursor: 'pointer' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: `1.6px solid ${done ? '#16a34a' : D.text2}`, background: done ? '#16a34a' : 'transparent', color: '#fff', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: D.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                    <div style={{ color: D.text2, fontSize: 12, marginTop: 2, display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                      {t.part && <span style={{ background: D.stripBg, border: `1px solid ${D.border}`, borderRadius: 6, padding: '1px 6px', color: D.text2 }}>{t.part.name}</span>}
                      {prio && <span style={{ background: prio.bg, color: prio.color, borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>{prio.label}</span>}
                      <span style={{ color: late ? '#c73a2f' : D.text2, fontWeight: late ? 700 : 400 }}>
                        {late ? '지연' : isToday(t.dueDate) ? '오늘 마감' : t.dueDate ? dayjs(t.dueDate).format('MM/DD') : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ② KPI 타일 — 좁으면 세로 1열로 리플로우, 넓으면 2열 (상단 정렬·넘치면 스크롤) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gridAutoRows: 'min-content', gap: 12, minHeight: 0, alignContent: 'start', overflowY: 'auto' }}>
            <div style={kpiTile('accent')} onClick={() => navigate('/tasks')}>
              <div style={kpiLbl('accent')}>🔥 오늘 마감</div>
              <div style={{ minWidth: 0 }}>
                <div style={kpiBig('accent')}>{dueTodayCount}</div>
                <div style={kpiSub('accent')}>오늘 처리 권장</div>
              </div>
            </div>
            <div style={kpiTile('risk')} onClick={() => navigate('/tasks?status=overdue')}>
              <div style={kpiLbl('risk')}>⚠ 지연·초과</div>
              <div style={{ minWidth: 0 }}>
                <div style={kpiBig('risk')}>{overdue.length}</div>
                <div style={kpiSub('risk')}>{atRisk[0] ? `${atRisk[0].title}` : '위험 업무 없음'}</div>
              </div>
            </div>
            <div style={kpiTile('info')} onClick={() => navigate('/mail')}>
              <div style={kpiLbl('info')}>✉️ 미확인 메일</div>
              <div style={{ minWidth: 0 }}>
                <div style={kpiBig('info')}>{unreadCount}</div>
                <div style={kpiSub('info')}>받은편지함</div>
              </div>
            </div>
            <div style={kpiTile()}>
              <div style={kpiLbl()}>⚡ 빠른 실행</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                <span style={qbtn(true)} onClick={() => { setSelectedTask(null); setFormStatus('pending'); setFormOpen(true); }}>+ 업무</span>
                <span style={qbtn()} onClick={() => navigate('/memos')}>메모</span>
                <span style={qbtn()} onClick={() => navigate('/mail')}>메일</span>
                <span style={qbtn()} onClick={() => navigate('/approvals/new')}>결재</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </DashBlock>
      </div>
      )}

      {dashEnabled.schedule && (
      <div key="schedule">
      <DashBlock editing={dashEditing} onHide={() => toggleDashBlock('schedule')} D={D}>
      {/* ══ 주간 일정 · 자원 현황 (블록 크기에 맞춰 채움) ══ */}
      <div style={{ height: '100%', padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <ScheduleWidget isDark={isDark} D={D} fill />
      </div>
      </DashBlock>
      </div>
      )}

      {dashEnabled.board && (
      <div key="board">
      <DashBlock editing={dashEditing} onHide={() => toggleDashBlock('board')} D={D}>
      {/* ── 업무 칸반 보드 섹션 ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        padding: '14px 16px 0',
        boxSizing: 'border-box',
      }}>
      <div style={{ ...secTitle, justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>🗂 업무 보드</span>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <AiAsk compact />
          <AiWeeklySummary compact />
        </span>
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        boxSizing: 'border-box',
      }}>
        {COLUMNS.map((col) => (
          <div key={col.key} style={{
            flex: 1,
            minWidth: 0,
            maxHeight: 380,
            background: col.colBg,
            borderRadius: 'var(--fd-sk-radius-lg, 12px)',
            display: 'flex',
            flexDirection: 'column',
            border: `var(--fd-sk-border-w, 1px) solid ${col.borderColor}`,
            overflow: 'hidden',
          }}>
            {/* 열 헤더 */}
            <div style={{
              padding: '11px 14px',
              display: 'flex', alignItems: 'center', gap: 7,
              flexShrink: 0,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, flexShrink: 0, display: 'inline-block' }} />
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: col.key === 'overdue' ? '#DC2626' : (isDark ? '#ccc' : '#334155'),
                flex: 1,
              }}>{col.label}</span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                padding: '1px 7px', borderRadius: 7,
                background: col.cntBg, color: col.cntC,
              }}>{col.tasks.length}</span>
            </div>

            {/* 카드 목록 */}
            <div style={{ padding: '0 10px 7px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {col.tasks.map((task) => {
                const late    = isOverdue(task.dueDate, task.status);
                const prio    = task.priority ? PRIO[task.priority] : null;
                const assigns = [
                  ...(task.assignees?.map((a) => a.user?.displayName).filter(Boolean) || []),
                  ...(task.extraAssignees?.map((e) => e.name).filter(Boolean) || []),
                ];
                const dy = late && task.dueDate ? daysLate(task.dueDate) : null;

                return (
                  <div
                    key={task.id}
                    onClick={() => { setSelectedTask(task); setFormOpen(true); }}
                    style={{
                      background: D.cardBg,
                      borderRadius: 'var(--fd-sk-radius, 9px)',
                      padding: '11px 13px',
                      border: `var(--fd-sk-border-w, 1px) solid ${late ? '#FECACA' : D.cardBor}`,
                      boxShadow: 'var(--fd-sk-shadow-sm, none)',
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      flexShrink: 0,
                      transition: 'box-shadow .12s, border-color .12s, transform .12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.07)';
                      e.currentTarget.style.borderColor = late ? '#FCA5A5' : '#BFDBFE';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = late ? '#FECACA' : D.cardBor;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* 상단 컬러 라인 */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                      background: late ? '#EF4444' : col.dot,
                    }} />

                    {/* 제목 */}
                    <div style={{
                      fontSize: 12,
                      fontWeight: task.status === 'done' ? 400 : 600,
                      color: task.status === 'done' ? D.text2 : D.text1,
                      lineHeight: 1.3, marginBottom: 8,
                      textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    }}>
                      {task.title}
                    </div>

                    {/* 태그 */}
                    {(task.part || prio || late) && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
                        {task.part && (
                          <span style={{
                            fontSize: 12, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                            background: isDark ? 'rgba(59,130,246,.1)' : '#EFF6FF',
                            color: isDark ? '#60A5FA' : '#3B82F6',
                          }}>{task.part.name}</span>
                        )}
                        {prio && (
                          <span style={{
                            fontSize: 12, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                            background: prio.bg, color: prio.color,
                          }}>{prio.label}</span>
                        )}
                        {late && dy > 0 && (
                          <span style={{
                            fontSize: 12, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                            background: '#FEE2E2', color: '#DC2626',
                          }}>{dy}일 초과</span>
                        )}
                      </div>
                    )}

                    {/* 하단: 담당자 아바타 + 마감일 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex' }}>
                        {assigns.slice(0, 3).map((name, i) => (
                          <div key={i} style={{ marginLeft: i > 0 ? -5 : 0, zIndex: 3 - i }}>
                            <span style={{
                              width: 20, height: 20, borderRadius: '50%',
                              background: nameColor(name), color: '#fff',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700, border: `1.5px solid ${D.cardBg}`,
                            }}>{name.charAt(0)}</span>
                          </div>
                        ))}
                      </div>
                      {task.dueDate && (
                        <span style={{
                          fontSize: 12,
                          color: late ? '#EF4444' : D.text2,
                          display: 'flex', alignItems: 'center', gap: 3,
                          fontWeight: late ? 700 : 400,
                        }}>
                          {late
                            ? <span style={{ fontSize: 12 }}>⚠</span>
                            : <span style={{ fontSize: 12, opacity: .6 }}>🕐</span>}
                          {dayjs(task.dueDate).format('MM/DD')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* + 업무 추가 (지연 열 제외) */}
            {col.key !== 'overdue' && (
              <div
                onClick={() => { setSelectedTask(null); setFormStatus(col.key); setFormOpen(true); }}
                style={{
                  margin: '7px 10px 10px',
                  padding: 7,
                  borderRadius: 8,
                  border: `1.5px dashed ${D.addBor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 12,
                  color: D.addTxt,
                  cursor: 'pointer',
                  transition: '.12s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#93C5FD';
                  e.currentTarget.style.color = '#3B82F6';
                  e.currentTarget.style.background = isDark ? 'rgba(59,130,246,.08)' : '#EFF6FF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = D.addBor;
                  e.currentTarget.style.color = D.addTxt;
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: 12 }}>+</span> 업무 추가
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
      </DashBlock>
      </div>
      )}

      {dashEnabled.widgets && (
      <div key="widgets">
      <DashBlock editing={dashEditing} onHide={() => toggleDashBlock('widgets')} D={D}>
      {/* ── 받은 항목 · 게시판 · 결재 위젯 섹션 ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        padding: '14px 16px',
        boxSizing: 'border-box',
      }}>
        <div style={{ ...secTitle, marginTop: 0 }}>📥 받은 항목 · 게시판 · 결재</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, minHeight: 300 }}>

          {/* ① 받은 메일 */}
          <div style={wCard}>
            <div style={wHead}>
              <div style={{ ...wIco, background: isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF', color: '#3B82F6' }}>✉️</div>
              <div style={wTtl}>받은 메일</div>
              {unreadCount > 0 && <span style={{ ...wBadge, background: isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF', color: '#3B82F6' }}>{unreadCount}</span>}
              <span style={wMore} onClick={() => navigate('/mail')}>전체보기 →</span>
            </div>
            <div style={wBody}>
              {mails.length === 0 ? (
                <div style={wEmpty}>받은 메일이 없습니다</div>
              ) : mails.map((m) => (
                <div key={m.id} style={wRow}
                  onClick={() => navigate(`/mail?id=${m.id}`)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = wHoverBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                    background: nameColor(m.from?.displayName),
                  }}>{m.from?.displayName?.charAt(0) || '?'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ ...ell, flex: 1, fontSize: 12, fontWeight: m.isRead ? 500 : 800, color: D.text1 }}>
                        {m.from?.displayName || '-'}
                      </span>
                      <span style={{ fontSize: 12, color: D.text2, flexShrink: 0 }}>{dayjs(m.createdAt).fromNow()}</span>
                    </div>
                    <div style={{ ...ell, fontSize: 12, marginTop: 2, fontWeight: m.isRead ? 400 : 700, color: m.isRead ? D.text2 : D.text1 }}>
                      {m.priority === 'urgent' && <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#FEE2E2', color: '#DC2626', marginRight: 5 }}>긴급</span>}
                      {m.subject || '(제목 없음)'}
                    </div>
                  </div>
                  {!m.isRead && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B82F6', flexShrink: 0, marginTop: 11 }} />}
                </div>
              ))}
            </div>
          </div>

          {/* ② 게시판 (선택 카테고리) */}
          <div style={wCard}>
            <div style={wHead}>
              <div style={{ ...wIco, background: isDark ? 'rgba(5,150,105,.15)' : '#F0FDF4', color: '#059669' }}>📋</div>
              <div style={wTtl}>게시판</div>
              <span style={wMore} onClick={() => navigate(bbsCatId ? `/bbs?categoryId=${bbsCatId}` : '/bbs')}>전체보기 →</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 15px 3px', flexWrap: 'wrap', flexShrink: 0 }}>
              {bbsAdminCats.map((c) => {
                const on = c.id === bbsCatId;
                return (
                  <span key={`a${c.id}`} onClick={() => setBbsCatId(c.id)} style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${on ? '#3B82F6' : D.border}`,
                    background: on ? '#3B82F6' : 'transparent',
                    color: on ? '#fff' : D.text2,
                  }}>{c.icon ? `${c.icon} ` : ''}{c.name}</span>
                );
              })}

              {/* 관리자 지정 / 개인 지정 구분선 */}
              {bbsPersonalCats.length > 0 && (
                <span style={{ width: 1, height: 16, background: D.border, margin: '0 2px', flexShrink: 0 }} />
              )}

              {/* 개인 지정 게시판 — 흐린(secondary) 칩 */}
              {bbsPersonalCats.map((c) => {
                const on = c.id === bbsCatId;
                return (
                  <span key={`p${c.id}`} onClick={() => setBbsCatId(c.id)} style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                    border: `1px dashed ${on ? '#3B82F6' : D.border}`,
                    background: on ? (isDark ? 'rgba(59,130,246,.25)' : '#EFF6FF') : 'transparent',
                    color: on ? '#3B82F6' : D.text2,
                    opacity: on ? 1 : 0.7,
                  }}>{c.icon ? `${c.icon} ` : ''}{c.name}</span>
                );
              })}

              {/* 개인 설정 버튼 */}
              <Popover
                open={prefOpen}
                onOpenChange={(v) => (v ? openPref() : setPrefOpen(false))}
                trigger="click"
                placement="bottomRight"
                content={(
                  <div style={{ width: 220 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>내 대시보드 게시판</div>
                    {allCats.length === 0 ? (
                      <AntEmpty image={AntEmpty.PRESENTED_IMAGE_SIMPLE} description="게시판 없음" />
                    ) : (
                      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                        <Checkbox.Group
                          value={prefSel}
                          onChange={setPrefSel}
                          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                        >
                          {allCats.map((c) => {
                            const isAdminPinned = bbsAdminCats.some((a) => a.id === c.id);
                            return (
                              <Checkbox key={c.id} value={c.id} disabled={isAdminPinned}>
                                {c.icon ? `${c.icon} ` : ''}{c.name}
                                {isAdminPinned && <span style={{ fontSize: 12, color: D.text2, marginLeft: 4 }}>(관리자 지정)</span>}
                              </Checkbox>
                            );
                          })}
                        </Checkbox.Group>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                      <Button size="small" onClick={() => setPrefOpen(false)}>취소</Button>
                      <Button size="small" type="primary" onClick={savePref}>저장</Button>
                    </div>
                  </div>
                )}
              >
                <span style={{
                  fontSize: 12, padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
                  color: D.text2, display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  <SettingOutlined style={{ fontSize: 12 }} /> 설정
                </span>
              </Popover>
            </div>
            <div style={wBody}>
              {bbsPosts.length === 0 ? (
                <div style={wEmpty}>{bbsCatId ? '게시글이 없습니다' : '카테고리를 선택하세요'}</div>
              ) : bbsPosts.map((p) => (
                <div key={p.id} style={wRow}
                  onClick={() => navigate(`/bbs?categoryId=${bbsCatId}&postId=${p.id}`)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = wHoverBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...ell, fontSize: 12, fontWeight: p.isPinned ? 700 : 600, color: D.text1 }}>
                      {p.isPinned && <span style={{ marginRight: 4 }}>📌</span>}{p.title}
                    </div>
                    <div style={{ fontSize: 12, color: D.text2, marginTop: 4, display: 'flex', gap: 9 }}>
                      <span>{p.creator?.displayName || '-'}</span>
                      <span>{dayjs(p.createdAt).format('MM/DD')}</span>
                      <span>👁 {p.viewCount ?? 0}</span>
                      {p._count?.comments > 0 && <span>💬 {p._count.comments}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ③ 내가 결재할 전자결재 */}
          <div style={wCard}>
            <div style={wHead}>
              <div style={{ ...wIco, background: isDark ? 'rgba(217,119,6,.15)' : '#FFFBEB', color: '#D97706' }}>🖋️</div>
              <div style={wTtl}>결재 대기 문서</div>
              {approvals.length > 0 && <span style={{ ...wBadge, background: isDark ? 'rgba(217,119,6,.15)' : '#FFFBEB', color: '#D97706' }}>{approvals.length}</span>}
              <span style={wMore} onClick={() => navigate('/approvals')}>전체보기 →</span>
            </div>
            <div style={wBody}>
              {approvals.length === 0 ? (
                <div style={wEmpty}>결재할 문서가 없습니다</div>
              ) : approvals.map((d) => (
                <div key={d.id} style={wRow}
                  onClick={() => navigate(`/approvals/${d.id}`)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = wHoverBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {d.template?.formType?.name && (
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: isDark ? 'rgba(217,119,6,.15)' : '#FFFBEB', color: '#D97706', border: `1px solid ${isDark ? 'rgba(217,119,6,.3)' : '#FDE68A'}` }}>
                          {d.template.formType.name}
                        </span>
                      )}
                    </div>
                    <div style={{ ...ell, fontSize: 12, fontWeight: 600, color: D.text1, marginTop: 6 }}>{d.title}</div>
                    <div style={{ fontSize: 12, color: D.text2, marginTop: 4 }}>
                      기안: {d.creator?.displayName || '-'} · {dayjs(d.createdAt).fromNow()}
                      {d.totalSteps ? ` · ${d.currentStep}/${d.totalSteps} 단계` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      </DashBlock>
      </div>
      )}

      {dashEnabled.memo && pinnedMemos.length > 0 && (
      <div key="memo">
      <DashBlock editing={dashEditing} onHide={() => toggleDashBlock('memo')} D={D}>
      {/* ══ 고정 메모 스트립 ══ */}
      <div style={{ flexShrink: 0, padding: '14px 16px' }}>
          <div style={secTitle}>📌 고정 메모
            <span onClick={() => navigate('/memos')} style={{ fontSize: 12, fontWeight: 500, color: D.text2, cursor: 'pointer' }}>· 전체 보기</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {pinnedMemos.map((m) => (
              <div key={m.id} style={{ width: 230, flexShrink: 0 }}>
                <MemoCard
                  memo={m}
                  mode="compact"
                  onSave={(id, patch) => updateMemo(id, patch)}
                  onDelete={(id) => removeMemo(id)}
                  onTogglePin={(memo) => updateMemo(memo.id, { pinned: !memo.pinned })}
                  onColor={(memo, color) => { if (memo.color !== color) updateMemo(memo.id, { color }); }}
                />
              </div>
            ))}
          </div>
      </div>
      </DashBlock>
      </div>
      )}

      </RGL>

      {/* 하단 여백 — 마지막 콘텐츠가 작업표시줄 등에 가리지 않도록 확보 */}
      <div style={{ height: 48, flexShrink: 0 }} />

      {/* ── 업무 등록 폼 ── */}
      <TaskForm
        open={formOpen}
        task={selectedTask}
        initialStatus={formStatus}
        onClose={() => { setFormOpen(false); setSelectedTask(null); }}
        onSubmit={async (data) => { await handleFormSubmit(data); setFormOpen(false); setSelectedTask(null); }}
      />
    </div>
  );
}
