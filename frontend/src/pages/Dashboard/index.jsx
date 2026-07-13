import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, message, Popover, Checkbox, Button, Empty as AntEmpty } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
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

export default function DashboardPage() {
  const navigate   = useNavigate();
  const isDark     = useThemeStore((s) => s.isDark);
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

  /* ── 색상 (라이트/다크) ── */
  const D = isDark ? {
    pageBg:   '#181b24',
    navBg:    '#1e222c',
    border:   'rgba(255,255,255,.1)',
    text1:    '#e8e8ee',
    text2:    '#94a3b8',
    colBg:    '#20242f',           // 컬럼: 페이지보다 한 단계 위
    cardBg:   '#2b313d',           // 카드: 솔리드 elevated 로 또렷하게 구분
    cardBor:  'rgba(255,255,255,.1)',
    addBor:   'rgba(255,255,255,.14)',
    addTxt:   '#94a3b8',
    stripBg:  '#1e222c',
  } : {
    pageBg:   '#F8F9FC',
    navBg:    '#fff',
    border:   '#E8ECF4',
    text1:    '#0F172A',
    text2:    '#94A3B8',
    colBg:    '#F1F5F9',
    cardBg:   '#fff',
    cardBor:  '#E8ECF4',
    addBor:   '#CBD5E1',
    addTxt:   '#94A3B8',
    stripBg:  '#fff',
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
      dot:   '#94A3B8',
      cntBg: isDark ? 'rgba(255,255,255,.06)' : '#F1F5F9',
      cntC:  isDark ? '#cbd5e1' : '#64748B',
      colBg: isDark ? 'rgba(148,163,184,.08)' : '#F8FAFC',
      borderColor: isDark ? 'rgba(148,163,184,.15)' : '#E2E8F0',
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
    background: D.cardBg, border: `1px solid ${D.cardBor}`, borderRadius: 14,
    display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', minHeight: 0,
  };
  const wHead = {
    display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px',
    borderBottom: `1px solid ${D.border}`, flexShrink: 0,
  };
  const wIco  = { width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 };
  const wTtl  = { fontSize: 13.5, fontWeight: 700, flex: 1, color: D.text1 };
  const wBadge= { fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20 };
  const wMore = { fontSize: 11.5, color: D.text2, cursor: 'pointer', whiteSpace: 'nowrap' };
  const wBody = { flex: 1, overflowY: 'auto', padding: '4px 0' };
  const wEmpty= { padding: '36px 16px', textAlign: 'center', color: D.text2, fontSize: 12.5 };
  const wRow  = { display: 'flex', gap: 10, padding: '9px 15px', cursor: 'pointer', borderBottom: `1px solid ${D.border}` };
  const ell   = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  const unreadCount = mails.filter((m) => !m.isRead).length;

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: D.pageBg,
      overflow: 'hidden',
    }}>

      {/* ── 고정 메모 + 주간 일정·자원 위젯 (나란히) ── */}
      <div style={{
        flexShrink: 0,
        padding: '12px 24px 8px',
        borderBottom: `1px solid ${D.border}`,
        background: D.stripBg,
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
      }}>
        {/* 좌: 고정 메모 */}
        {pinnedMemos.length > 0 && (
          <div style={{ flexShrink: 0, maxWidth: 500, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              fontSize: 9.5, fontWeight: 700, color: D.text2,
              letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              📌 고정 메모
              <span
                onClick={() => navigate('/memos')}
                style={{ cursor: 'pointer', color: D.text2, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}
              >
                · 전체 보기
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', overflowY: 'auto', alignContent: 'flex-start', flex: 1 }}>
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
        )}

        {/* 우: 주간 일정 · 자원 위젯 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, color: D.text2,
            letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8,
          }}>📅 일정 · 자원 현황</div>
          <ScheduleWidget isDark={isDark} D={D} />
        </div>
      </div>

      {/* ── 업무 칸반 보드 섹션 ── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        padding: '12px 24px 0',
        boxSizing: 'border-box',
      }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: D.text2,
        letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>🗂 업무 보드</span>
        <AiWeeklySummary compact />
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>
        {COLUMNS.map((col) => (
          <div key={col.key} style={{
            flex: 1,
            minWidth: 0,
            maxHeight: '100%',
            background: col.colBg,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid ${col.borderColor}`,
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
                fontSize: 11.5, fontWeight: 700,
                color: col.key === 'overdue' ? '#DC2626' : (isDark ? '#ccc' : '#334155'),
                flex: 1,
              }}>{col.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
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
                      borderRadius: 9,
                      padding: '11px 13px',
                      border: `1px solid ${late ? '#FECACA' : D.cardBor}`,
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
                      fontSize: 12.5,
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
                            fontSize: 9.5, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                            background: isDark ? 'rgba(59,130,246,.1)' : '#EFF6FF',
                            color: isDark ? '#60A5FA' : '#3B82F6',
                          }}>{task.part.name}</span>
                        )}
                        {prio && (
                          <span style={{
                            fontSize: 9.5, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                            background: prio.bg, color: prio.color,
                          }}>{prio.label}</span>
                        )}
                        {late && dy > 0 && (
                          <span style={{
                            fontSize: 9.5, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
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
                              fontSize: 8, fontWeight: 700, border: `1.5px solid ${D.cardBg}`,
                            }}>{name.charAt(0)}</span>
                          </div>
                        ))}
                      </div>
                      {task.dueDate && (
                        <span style={{
                          fontSize: 10,
                          color: late ? '#EF4444' : D.text2,
                          display: 'flex', alignItems: 'center', gap: 3,
                          fontWeight: late ? 700 : 400,
                        }}>
                          {late
                            ? <span style={{ fontSize: 9 }}>⚠</span>
                            : <span style={{ fontSize: 9, opacity: .6 }}>🕐</span>}
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
                  fontSize: 11,
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
                <span style={{ fontSize: 10 }}>+</span> 업무 추가
              </div>
            )}
          </div>
        ))}
      </div>
      </div>

      {/* ── 받은 항목 · 게시판 · 결재 위젯 섹션 ── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        padding: '12px 24px 16px',
        borderTop: `1px solid ${D.border}`,
        background: D.stripBg,
        boxSizing: 'border-box',
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 700, color: D.text2,
          letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8, flexShrink: 0,
        }}>📥 받은 항목 · 게시판 · 결재</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, flex: 1, minHeight: 0 }}>

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
                      <span style={{ ...ell, flex: 1, fontSize: 12.5, fontWeight: m.isRead ? 500 : 800, color: D.text1 }}>
                        {m.from?.displayName || '-'}
                      </span>
                      <span style={{ fontSize: 10.5, color: D.text2, flexShrink: 0 }}>{dayjs(m.createdAt).fromNow()}</span>
                    </div>
                    <div style={{ ...ell, fontSize: 12.5, marginTop: 2, fontWeight: m.isRead ? 400 : 700, color: m.isRead ? D.text2 : D.text1 }}>
                      {m.priority === 'urgent' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#FEE2E2', color: '#DC2626', marginRight: 5 }}>긴급</span>}
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
                    fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
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
                    fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
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
                                {isAdminPinned && <span style={{ fontSize: 10, color: D.text2, marginLeft: 4 }}>(관리자 지정)</span>}
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
                  fontSize: 11, padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
                  color: D.text2, display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  <SettingOutlined style={{ fontSize: 11 }} /> 설정
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
                    <div style={{ ...ell, fontSize: 12.5, fontWeight: p.isPinned ? 700 : 600, color: D.text1 }}>
                      {p.isPinned && <span style={{ marginRight: 4 }}>📌</span>}{p.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: D.text2, marginTop: 4, display: 'flex', gap: 9 }}>
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
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: isDark ? 'rgba(217,119,6,.15)' : '#FFFBEB', color: '#D97706', border: `1px solid ${isDark ? 'rgba(217,119,6,.3)' : '#FDE68A'}` }}>
                          {d.template.formType.name}
                        </span>
                      )}
                    </div>
                    <div style={{ ...ell, fontSize: 12.5, fontWeight: 600, color: D.text1, marginTop: 6 }}>{d.title}</div>
                    <div style={{ fontSize: 10.5, color: D.text2, marginTop: 4 }}>
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
