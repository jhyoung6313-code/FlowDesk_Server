import React from 'react';
import { STATUS_COLORS } from '../../utils/colors';
import { getEffectiveStatus } from '../../utils/dday';

/* Notion Warm: 연한 배경 + 컬러 글자의 파스텔 캡슐 */
export default function StatusBadge({ status, dueDate }) {
  const effective = dueDate !== undefined ? getEffectiveStatus(status, dueDate) : status;
  const cfg = STATUS_COLORS[effective] || STATUS_COLORS.pending;
  return (
    <span
      style={{
        display: 'inline-block',
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}29`,
        borderRadius: 20,
        fontWeight: 600,
        fontSize: 12,
        lineHeight: '18px',
        padding: '1px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}
