export const PRIORITY_COLORS = {
  high: { color: '#ff4d4f', bg: '#fff1f0', label: '높음' },
  normal: { color: '#faad14', bg: '#fffbe6', label: '보통' },
  low: { color: '#8c8c8c', bg: '#fafafa', label: '낮음' },
};

export const STATUS_COLORS = {
  pending: { color: '#8c8c8c', bg: '#fafafa', label: '대기' },
  in_progress: { color: '#1677ff', bg: '#e6f4ff', label: '진행중' },
  done: { color: '#52c41a', bg: '#f6ffed', label: '완료' },
  hold: { color: '#fa8c16', bg: '#fff7e6', label: '보류' },
  overdue: { color: '#ff4d4f', bg: '#fff1f0', label: '지연' },
};

export const NOTIFICATION_LABELS = {
  due_soon: '마감 임박',
  due_today: '오늘 마감',
  overdue: '마감 초과',
  sla_warning: 'SLA 임박',
  sla_breach: 'SLA 초과',
  step_assigned: '스텝 배정',
  step_reminder: '스텝 미처리',
  security_alert: '보안 알림',
};

// 사용자 아바타 배경색 (id 기반 순환)
const AVATAR_COLORS = [
  '#1677ff', '#52c41a', '#fa8c16', '#eb2f96',
  '#722ed1', '#13c2c2', '#f5222d', '#2f54eb',
];

export const AVATAR_COLOR_PRESETS = [
  '#1677ff', '#52c41a', '#fa8c16', '#eb2f96',
  '#722ed1', '#13c2c2', '#f5222d', '#2f54eb',
  '#d46b08', '#0958d9', '#389e0d', '#c41d7f',
];

// id: 사용자 id, customColor: User.avatarColor (optional)
export const getAvatarColor = (id, customColor) =>
  customColor || AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length];
