import dayjs from 'dayjs';

export const calcDday = (dueDate) => {
  if (!dueDate) return null;
  const today = dayjs().startOf('day');
  const due = dayjs(dueDate).startOf('day');
  const diff = due.diff(today, 'day');

  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return 'D-Day';
  return `D+${Math.abs(diff)}`;
};

export const getDdayColor = (dueDate) => {
  if (!dueDate) return null;
  const today = dayjs().startOf('day');
  const due = dayjs(dueDate).startOf('day');
  const diff = due.diff(today, 'day');

  if (diff < 0) return '#ff4d4f'; // 초과: 빨강
  if (diff === 0) return '#ff7a00'; // 당일: 주황
  if (diff <= 3) return '#faad14'; // 임박: 노랑
  return '#52c41a'; // 여유: 초록
};

export const isOverdue = (dueDate, status) => {
  if (!dueDate || status === 'done') return false;
  return dayjs(dueDate).startOf('day').isBefore(dayjs().startOf('day'));
};

export const isDueSoon = (dueDate, status) => {
  if (!dueDate || status === 'done') return false;
  const today = dayjs().startOf('day');
  const due = dayjs(dueDate).startOf('day');
  const diff = due.diff(today, 'day');
  return diff >= 0 && diff <= 3;
};

// 실제 표시 상태: 마감 초과이면 'overdue', 아니면 DB 상태 그대로
export const getEffectiveStatus = (status, dueDate) => {
  if (isOverdue(dueDate, status)) return 'overdue';
  return status;
};
