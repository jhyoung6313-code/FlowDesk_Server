import React from 'react';
import { Tag, Avatar, Checkbox, Typography, Tooltip } from 'antd';
import { LinkOutlined, MailOutlined, PhoneOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

function parseValue(value) {
  if (value === null || value === undefined || value === '') return null;
  try { return JSON.parse(value); } catch { return value; }
}

export default function PropertyValue({ property, value, card }) {
  const parsed = parseValue(value);

  const { type, options = [] } = property;

  // 자동 속성: 카드 데이터에서 직접 읽음
  if (type === 'created_time') {
    const date = card?.createdAt ?? parsed;
    if (!date) return <Text type="secondary">—</Text>;
    return (
      <Tooltip title={dayjs(date).format('YYYY-MM-DD HH:mm')}>
        <Text style={{ fontSize: 11 }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {dayjs(date).format('MM/DD HH:mm')}
        </Text>
      </Tooltip>
    );
  }

  if (type === 'created_by') {
    const creator = card?.creator ?? (parsed ? { displayName: parsed } : null);
    if (!creator) return <Text type="secondary">—</Text>;
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Avatar size={16} style={{ backgroundColor: creator.avatarColor || '#1677ff', fontSize: 9 }}>
          {creator.displayName?.[0]}
        </Avatar>
        <Text style={{ fontSize: 11 }}>{creator.displayName}</Text>
      </span>
    );
  }

  if (parsed === null || parsed === undefined) return <Text type="secondary">—</Text>;

  if (type === 'checkbox') {
    return <Checkbox checked={parsed === true || parsed === 'true'} disabled />;
  }
  if (type === 'url') {
    return (
      <a href={parsed} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11 }}>
        <LinkOutlined /> {parsed}
      </a>
    );
  }
  if (type === 'email') {
    return (
      <a href={`mailto:${parsed}`} onClick={e => e.stopPropagation()} style={{ fontSize: 11 }}>
        <MailOutlined style={{ marginRight: 3 }} />{parsed}
      </a>
    );
  }
  if (type === 'phone') {
    return (
      <a href={`tel:${parsed}`} onClick={e => e.stopPropagation()} style={{ fontSize: 11 }}>
        <PhoneOutlined style={{ marginRight: 3 }} />{parsed}
      </a>
    );
  }
  if (type === 'select') {
    const opt = options.find(o => o.value === parsed);
    return opt ? <Tag color={opt.color} style={{ fontSize: 11 }}>{opt.value}</Tag> : <Text style={{ fontSize: 11 }}>{parsed}</Text>;
  }
  if (type === 'multiselect') {
    const vals = Array.isArray(parsed) ? parsed : [];
    return (
      <span>
        {vals.map(v => {
          const opt = options.find(o => o.value === v);
          return <Tag key={v} color={opt?.color} style={{ fontSize: 11 }}>{v}</Tag>;
        })}
      </span>
    );
  }
  if (type === 'user') {
    const users = Array.isArray(parsed) ? parsed : [parsed];
    return (
      <Avatar.Group max={{ count: 3 }} size="small">
        {users.map(u => (
          <Tooltip key={u.id ?? u} title={u.displayName ?? u}>
            <Avatar size={16} style={{ backgroundColor: u.avatarColor || '#1677ff', fontSize: 9 }}>
              {(u.displayName ?? u)?.[0]}
            </Avatar>
          </Tooltip>
        ))}
      </Avatar.Group>
    );
  }
  if (type === 'date') {
    return <Text style={{ fontSize: 11 }}>{String(parsed).slice(0, 10)}</Text>;
  }
  return <Text style={{ fontSize: 11 }}>{String(parsed)}</Text>;
}
