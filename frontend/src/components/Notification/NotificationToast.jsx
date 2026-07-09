import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import useNotificationStore from '../../store/notificationStore';
import { calcDday, getDdayColor } from '../../utils/dday';
import { focusChatPopup } from '../../utils/chatPopup';

const TYPE_CONFIG = {
  overdue:        { label: '마감 초과',  color: '#ff4d4f', bg: '#fff1f0', border: '#ffa39e' },
  due_today:      { label: '오늘 마감',  color: '#fa8c16', bg: '#fff7e6', border: '#ffd591' },
  due_soon:       { label: '마감 임박',  color: '#1677ff', bg: '#e6f4ff', border: '#91caff' },
  sla_warning:    { label: 'SLA 임박',   color: '#d46b08', bg: '#fff7e6', border: '#ffd591' },
  sla_breach:     { label: 'SLA 초과',   color: '#ff4d4f', bg: '#fff1f0', border: '#ffa39e' },
  step_assigned:  { label: '스텝 배정',  color: '#13c2c2', bg: '#e6fffb', border: '#87e8de' },
  step_reminder:  { label: '스텝 미처리', color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7' },
  security_alert: { label: '보안 알림',  color: '#ff4d4f', bg: '#fff1f0', border: '#ffa39e' },
  chat:           { label: '채팅',       color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7' },
  mention:        { label: '멘션',       color: '#eb2f96', bg: '#fff0f6', border: '#ffadd2' },
  board:          { label: '보드',       color: '#13c2c2', bg: '#e6fffb', border: '#87e8de' },
};

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast, onDismiss, onNavigate }) {
  const timerRef = useRef(null);
  const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.due_soon;

  // transient toast (chat/board)는 toast.title / toast.message / toast.path 사용
  const isTransient = !!toast.path || toast.type === 'chat' || toast.type === 'board' || toast.type === 'mention';
  const displayTitle = isTransient
    ? (toast.title || cfg.label)
    : (toast.task?.title || toast.message || cfg.label);
  const displayBody  = isTransient ? toast.message : null;

  const dday      = !isTransient && toast.task?.dueDate ? calcDday(toast.task.dueDate) : null;
  const ddayColor = !isTransient && toast.task?.dueDate ? getDdayColor(toast.task.dueDate) : '#8c8c8c';

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast._toastId), AUTO_DISMISS_MS);
    return () => clearTimeout(timerRef.current);
  }, [toast._toastId, onDismiss]);

  const handleClick = () => {
    onDismiss(toast._toastId);
    onNavigate(isTransient ? { path: toast.path } : { taskId: toast.taskId });
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        width: 320,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 8,
        padding: '12px 36px 12px 14px',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        animation: 'slideInRight 0.3s ease',
        userSelect: 'none',
      }}
    >
      {/* 닫기 버튼 */}
      <div
        onClick={(e) => { e.stopPropagation(); onDismiss(toast._toastId); }}
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          cursor: 'pointer',
          color: '#8c8c8c',
          fontSize: 12,
          lineHeight: 1,
          padding: 2,
        }}
      >
        <CloseOutlined />
      </div>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <BellOutlined style={{ color: cfg.color, fontSize: 14 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
          {cfg.label}
        </span>
      </div>

      {/* 제목 */}
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#262626',
        marginBottom: displayBody ? 2 : 4,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {displayTitle}
      </div>

      {/* transient 본문 (채팅·보드 메시지 미리보기) */}
      {displayBody && (
        <div style={{
          fontSize: 12,
          color: 'var(--fd-text-secondary)',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {displayBody}
        </div>
      )}

      {/* 마감일 + D-day (업무 알림 전용) */}
      {!isTransient && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.task?.dueDate && (
            <span style={{ fontSize: 11, color: 'var(--fd-text-secondary)' }}>
              마감: {dayjs(toast.task.dueDate).format('MM/DD')}
            </span>
          )}
          {dday && (
            <span style={{ fontSize: 11, fontWeight: 700, color: ddayColor }}>
              {dday}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 'auto' }}>
            클릭하여 업무 확인
          </span>
        </div>
      )}

      {/* 진행 바 */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: 3,
        background: cfg.color,
        borderRadius: '0 0 0 4px',
        animation: `shrinkWidth ${AUTO_DISMISS_MS}ms linear forwards`,
        width: '100%',
        opacity: 0.5,
      }} />
    </div>
  );
}

export default function NotificationToast() {
  const navigate = useNavigate();
  const toasts = useNotificationStore((s) => s.toasts);
  const dismissToast = useNotificationStore((s) => s.dismissToast);
  const markRead = useNotificationStore((s) => s.markRead);

  const handleNavigate = ({ taskId, path } = {}) => {
    if (path === '/chat') {
      // 채팅 팝업이 열려 있으면 그 창으로, 아니면 메인 사이드바 채팅으로
      if (!focusChatPopup()) navigate('/chat');
    } else if (path) {
      navigate(path);
    } else {
      navigate('/tasks', { state: { highlightTaskId: taskId } });
    }
  };

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes shrinkWidth {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          bottom: 92,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast._toastId}
            toast={toast}
            onDismiss={dismissToast}
            onNavigate={handleNavigate}
          />
        ))}
      </div>
    </>
  );
}
