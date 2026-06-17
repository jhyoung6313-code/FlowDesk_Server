import React from 'react';
import { calcDday, getDdayColor } from '../../utils/dday';

export default function DdayBadge({ dueDate, status }) {
  if (!dueDate || status === 'done') return null;
  const label = calcDday(dueDate);
  const color = getDdayColor(dueDate);
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        background: `${color}18`,
        borderRadius: 4,
        padding: '1px 6px',
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}
