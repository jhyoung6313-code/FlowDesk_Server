import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { getTasks } from '../../api/tasks';
import useTaskStore from '../../store/taskStore';
import useAuthStore from '../../store/authStore';
import { isOverdue } from '../../utils/dday';

dayjs.locale('ko');

/* 시간대별 인사말 */
function greet() {
  const h = new Date().getHours();
  if (h < 12) return '좋은 아침입니다';
  if (h < 18) return '좋은 오후입니다';
  return '좋은 저녁입니다';
}

/* 모든 페이지 상단에 공통 표시되는 요약 바 (인사말 + 업무 통계) */
export default function SubHeader() {
  const navigate = useNavigate();
  const user     = useAuthStore((s) => s.user);
  const calVer   = useTaskStore((s) => s.calendarVersion);

  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    let alive = true;
    getTasks()
      .then((t) => { if (alive) setTasks(Array.isArray(t) ? t : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [calVer]);

  const counts = useMemo(() => {
    const active  = tasks.filter((t) => t.delYn !== '1');
    const notOver = (t) => !isOverdue(t.dueDate, t.status);
    return {
      total:      active.length,
      pending:    active.filter((t) => t.status === 'pending'     && notOver(t)).length,
      inProgress: active.filter((t) => t.status === 'in_progress' && notOver(t)).length,
      hold:       active.filter((t) => t.status === 'hold'        && notOver(t)).length,
      done:       active.filter((t) => t.status === 'done').length,
      overdue:    active.filter((t) => isOverdue(t.dueDate, t.status)).length,
    };
  }, [tasks]);

  const displayName = user?.displayName || user?.username || '';
  const dateStr     = dayjs().format('YYYY년 M월 D일');

  const BORDER = '#E8ECF4';
  const TEXT2  = '#94A3B8';
  const TEXT1  = '#0F172A';

  const stats = [
    { v: counts.total,      l: '전체',   c: TEXT1     },
    { v: counts.pending,    l: '대기',   c: '#94A3B8' },
    { v: counts.inProgress, l: '진행중', c: '#3B82F6' },
    { v: counts.hold,       l: '보류',   c: '#FA8C16' },
    { v: counts.done,       l: '완료',   c: '#059669' },
    { v: counts.overdue,    l: '지연',   c: '#EF4444' },
  ];

  return (
    <div style={{
      padding: '12px 24px',
      background: '#ffffff',
      borderBottom: `1px solid ${BORDER}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 10.5, color: TEXT2, fontWeight: 500, marginBottom: 2 }}>
          {greet()} · {dateStr}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT1, letterSpacing: '-0.5px' }}>
          {displayName} 님, 오늘의 업무 현황
        </div>
      </div>

      {/* 통계 pill */}
      <div style={{
        display: 'flex',
        border: `1px solid ${BORDER}`,
        borderRadius: 9,
        overflow: 'hidden',
      }}>
        {stats.map(({ v, l, c }, i, arr) => (
          <div
            key={l}
            onClick={() => navigate('/tasks')}
            style={{
              padding: '6px 22px',
              minWidth: 64,
              borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 800, color: c, letterSpacing: '-0.5px', lineHeight: 1 }}>{v}</span>
            <span style={{ fontSize: 9, fontWeight: 500, color: TEXT2, textTransform: 'uppercase', letterSpacing: '.5px' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
