import React from 'react';
import { Tag } from 'antd';
import { PRIORITY_COLORS } from '../../utils/colors';

export default function PriorityBadge({ priority }) {
  const cfg = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal;
  return (
    <Tag color={cfg.color} style={{ borderRadius: 12, fontWeight: 500 }}>
      {cfg.label}
    </Tag>
  );
}
