import React from 'react';
import { PRIORITY_COLORS } from '../../utils/colors';

/* Notion Warm: 솔리드 대신 연한 배경 + 컬러 글자의 파스텔 캡슐 */
export default function PriorityBadge({ priority }) {
  const cfg = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal;
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
