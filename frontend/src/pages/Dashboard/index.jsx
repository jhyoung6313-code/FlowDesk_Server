import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getTasks } from '../../api/tasks';
import { getNotifications } from '../../api/notifications';
import useTaskStore from '../../store/taskStore';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import useMemoStore from '../../store/memoStore';
import { isOverdue } from '../../utils/dday';
import { AVATAR_COLOR_PRESETS } from '../../utils/colors';
import MemoCard from '../../components/Memo/MemoCard';

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

  const [tasks,   setTasks]   = useState([]);
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);

  const memos        = useMemoStore((s) => s.memos);
  const fetchMemos   = useMemoStore((s) => s.fetch);
  const updateMemo   = useMemoStore((s) => s.update);
  const removeMemo   = useMemoStore((s) => s.remove);
  const pinnedMemos  = useMemo(() => memos.filter((m) => m.pinned), [memos]);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTasks(), getNotifications()])
      .then(([t, n]) => { setTasks(t); setNotifs(Array.isArray(n) ? n : []); })
      .finally(() => setLoading(false));
  }, [calVer]);

  const active  = useMemo(() => tasks.filter((t) => t.delYn !== '1'), [tasks]);
  const overdue = useMemo(() => active.filter((t) => isOverdue(t.dueDate, t.status)), [active]);

  const cols = useMemo(() => ({
    pending:     active.filter((t) => t.status === 'pending'     && !isOverdue(t.dueDate, t.status)),
    in_progress: active.filter((t) => t.status === 'in_progress' && !isOverdue(t.dueDate, t.status)),
    done:        active.filter((t) => t.status === 'done'),
    overdue,
  }), [active, overdue]);

  /* ── 색상 (라이트/다크) ── */
  const D = isDark ? {
    pageBg:   '#0f1117',
    navBg:    '#161922',
    border:   'rgba(255,255,255,.07)',
    text1:    '#e8e8ee',
    text2:    '#64748b',
    colBg:    'rgba(255,255,255,.03)',
    cardBg:   'rgba(255,255,255,.04)',
    cardBor:  'rgba(255,255,255,.07)',
    addBor:   'rgba(255,255,255,.1)',
    addTxt:   '#555',
    stripBg:  '#161922',
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.pageBg }}>
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
      cntC:  isDark ? '#666' : '#64748B',
      colBg: D.colBg,
      tasks: cols.pending,
    },
    {
      key: 'in_progress',
      label: '진행중',
      dot:   '#3B82F6',
      cntBg: isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF',
      cntC:  '#3B82F6',
      colBg: D.colBg,
      tasks: cols.in_progress,
    },
    {
      key: 'done',
      label: '완료',
      dot:   '#059669',
      cntBg: isDark ? 'rgba(5,150,105,.15)' : '#F0FDF4',
      cntC:  '#059669',
      colBg: D.colBg,
      tasks: cols.done,
    },
    {
      key: 'overdue',
      label: '지연',
      dot:   '#EF4444',
      cntBg: isDark ? 'rgba(239,68,68,.15)' : '#FEE2E2',
      cntC:  '#DC2626',
      colBg: isDark ? 'rgba(239,68,68,.05)' : '#FFF5F5',
      tasks: cols.overdue,
    },
  ];

  /* 우선순위 태그 */
  const PRIO = {
    high:   { label: '높음', bg: '#FFF7ED', color: '#C2410C' },
    normal: { label: '보통', bg: '#EFF6FF', color: '#3B82F6' },
    low:    { label: '낮음', bg: '#F0FDF4', color: '#15803D' },
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: D.pageBg,
      overflow: 'hidden',
    }}>

      {/* ── 고정(핀)한 메모 띠 ── */}
      {pinnedMemos.length > 0 && (
        <div style={{
          flexShrink: 0,
          padding: '12px 24px 4px',
          borderBottom: `1px solid ${D.border}`,
          background: D.stripBg,
        }}>
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
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
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

      {/* ── 칸반 보드 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        padding: '14px 24px',
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        alignContent: 'start',
      }}>
        {COLUMNS.map((col) => (
          <div key={col.key} style={{
            background: col.colBg,
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            border: col.key === 'overdue' ? `1px solid ${isDark ? 'rgba(239,68,68,.2)' : '#FECACA'}` : undefined,
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
            <div style={{ padding: '0 10px 0', display: 'flex', flexDirection: 'column', gap: 7 }}>
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
                    onClick={() => navigate('/tasks')}
                    style={{
                      background: D.cardBg,
                      borderRadius: 9,
                      padding: '11px 13px',
                      border: `1px solid ${late ? '#FECACA' : D.cardBor}`,
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
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

            {/* + 업무 추가 */}
            <div
              onClick={() => navigate('/tasks')}
              style={{
                margin: '7px 10px 10px',
                padding: 7,
                borderRadius: 8,
                border: `1.5px dashed ${col.key === 'overdue' ? (isDark ? 'rgba(239,68,68,.25)' : '#FECACA') : D.addBor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 11,
                color: col.key === 'overdue' ? (isDark ? '#F87171' : '#FCA5A5') : D.addTxt,
                cursor: 'pointer',
                transition: '.12s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (col.key !== 'overdue') {
                  e.currentTarget.style.borderColor = '#93C5FD';
                  e.currentTarget.style.color = '#3B82F6';
                  e.currentTarget.style.background = isDark ? 'rgba(59,130,246,.08)' : '#EFF6FF';
                }
              }}
              onMouseLeave={(e) => {
                if (col.key !== 'overdue') {
                  e.currentTarget.style.borderColor = D.addBor;
                  e.currentTarget.style.color = D.addTxt;
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: 10 }}>+</span> 업무 추가
            </div>
          </div>
        ))}
      </div>

      {/* ── 하단 활동 스트립 ── */}
      <div style={{
        height: 42,
        background: D.stripBg,
        borderTop: `1px solid ${D.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        overflow: 'hidden',
        flexShrink: 0,
        gap: 0,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: D.text2,
          letterSpacing: '1px', textTransform: 'uppercase',
          marginRight: 16, whiteSpace: 'nowrap', flexShrink: 0,
        }}>최근 활동</span>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', overflow: 'hidden' }}>
          {notifs.length === 0 ? (
            <span style={{ fontSize: 11, color: D.text2 }}>활동 내역이 없습니다.</span>
          ) : notifs.slice(0, 6).map((n, i) => (
            <div key={n.id || i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: isDark ? '#64748b' : '#64748B',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: nameColor(n.title || '시스템'),
                color: '#fff', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 7.5, fontWeight: 700, flexShrink: 0,
              }}>{(n.title || '시')[0]}</span>
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n.body || n.title}
              </span>
              <span style={{ color: isDark ? '#374151' : '#CBD5E1', fontSize: 10 }}>
                {n.createdAt ? dayjs(n.createdAt).fromNow() : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
