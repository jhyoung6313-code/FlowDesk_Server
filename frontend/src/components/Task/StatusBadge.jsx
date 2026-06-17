import React from 'react';
import { Tag } from 'antd';
import { STATUS_COLORS } from '../../utils/colors';
import { getEffectiveStatus } from '../../utils/dday';

export default function StatusBadge({ status, dueDate }) {
  const effective = dueDate !== undefined ? getEffectiveStatus(status, dueDate) : status;
  const cfg = STATUS_COLORS[effective] || STATUS_COLORS.pending;
  return (
    <Tag color={cfg.color} style={{ borderRadius: 12, fontWeight: 500 }}>
      {cfg.label}
    </Tag>
  );
}
