import React from 'react';
import { calcDday, getDdayColor } from '../../utils/dday';

export default function DdayBadge({ dueDate, status }) {
  if (!dueDate || status === 'done') return null;
  const label = calcDday(dueDate);
  const color = getDdayColor(dueDate);
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 700,
        color,
        background: `${color}18`,
        borderRadius: 20,
        padding: '1px 8px',
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
}
