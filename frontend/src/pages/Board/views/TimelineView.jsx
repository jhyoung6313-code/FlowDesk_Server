import React, { useMemo } from 'react';
import { Typography, Tag, Avatar, Tooltip, Empty } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAvatarColor } from '../../../utils/colors';

const { Text } = Typography;

const STATUS_COLORS = {
  todo: '#8c8c8c',
  in_progress: '#1677ff',
  review: '#722ed1',
  done: '#52c41a',
  hold: '#fa8c16',
  cancelled: '#ff4d4f',
};

const STATUS_LABELS = {
  todo: '예정',
  in_progress: '진행중',
  review: '검토중',
  done: '완료',
  hold: '보류',
  cancelled: '취소',
};

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 48;
const LEFT_WIDTH = 220;
const DAY_WIDTH = 28;

function generateDays(startDate, endDate) {
  const days = [];
  let cur = dayjs(startDate);
  const end = dayjs(endDate);
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    days.push(cur);
    cur = cur.add(1, 'day');
  }
  return days;
}

export default function TimelineView({ board, cards, onEditCard }) {
  const cardsWithDates = cards.filter(c => c.startDate || c.dueDate);

  const { minDate, maxDate } = useMemo(() => {
    if (cardsWithDates.length === 0) {
      return { minDate: dayjs().startOf('month'), maxDate: dayjs().endOf('month') };
    }
    const allDates = cardsWithDates.flatMap(c => [
      c.startDate ? dayjs(c.startDate) : null,
      c.dueDate ? dayjs(c.dueDate) : null,
    ].filter(Boolean));
    const min = allDates.reduce((a, b) => a.isBefore(b) ? a : b).subtract(3, 'day');
    const max = allDates.reduce((a, b) => a.isAfter(b) ? a : b).add(7, 'day');
    return { minDate: min, maxDate: max };
  }, [cardsWithDates]);

  const days = useMemo(() => generateDays(minDate, maxDate), [minDate, maxDate]);
  const totalWidth = days.length * DAY_WIDTH;
  const today = dayjs();
  const todayOffset = today.diff(minDate, 'day');

  if (cardsWithDates.length === 0) {
    return (
      <Empty
        image={<CalendarOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />}
        description={
          <span>
            시작일 또는 마감일이 있는 카드가 없습니다.<br />
            카드에 날짜를 설정하면 타임라인에 표시됩니다.
          </span>
        }
        style={{ padding: '60px 0' }}
      />
    );
  }

  // 월별 그룹 생성
  const months = [];
  let curMonth = null;
  let count = 0;
  days.forEach((d, i) => {
    const m = d.format('YYYY년 MM월');
    if (m !== curMonth) {
      if (curMonth) months.push({ label: curMonth, span: count });
      curMonth = m;
      count = 1;
    } else {
      count++;
    }
  });
  if (curMonth) months.push({ label: curMonth, span: count });

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)', border: '1px solid #e8e8e8', borderRadius: 8 }}>
      <div style={{ display: 'flex', minWidth: LEFT_WIDTH + totalWidth }}>
        {/* 고정 왼쪽 열 */}
        <div style={{ width: LEFT_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: '#fff', borderRight: '1px solid #e8e8e8' }}>
          {/* 헤더 - 월 */}
          <div style={{ height: HEADER_HEIGHT / 2, borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', padding: '0 12px', background: '#fafafa' }}>
            <Text strong style={{ fontSize: 12 }}>카드</Text>
          </div>
          {/* 헤더 - 일 */}
          <div style={{ height: HEADER_HEIGHT / 2, borderBottom: '1px solid #e8e8e8', background: '#fafafa' }} />
          {/* 카드 행 */}
          {cardsWithDates.map(card => (
            <div
              key={card.id}
              style={{
                height: ROW_HEIGHT,
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                cursor: 'pointer',
                overflow: 'hidden',
                gap: 6,
              }}
              onClick={() => onEditCard?.(card)}
            >
              {card.cardNumber && (
                <Text style={{ fontSize: 10, color: '#bfbfbf', flexShrink: 0 }}>#{card.cardNumber}</Text>
              )}
              <Tag
                color={STATUS_COLORS[card.status]}
                style={{ fontSize: 10, margin: 0, flexShrink: 0 }}
              >
                {STATUS_LABELS[card.status] ?? card.status}
              </Tag>
              <Text
                ellipsis
                style={{ fontSize: 12, flex: 1 }}
                title={card.title}
              >
                {card.title}
              </Text>
            </div>
          ))}
        </div>

        {/* 오른쪽 타임라인 영역 */}
        <div style={{ flex: 1, minWidth: totalWidth }}>
          {/* 월 헤더 */}
          <div style={{ height: HEADER_HEIGHT / 2, display: 'flex', borderBottom: '1px solid #e8e8e8', background: '#fafafa' }}>
            {months.map((m, i) => (
              <div
                key={i}
                style={{
                  width: m.span * DAY_WIDTH,
                  flexShrink: 0,
                  borderRight: '1px solid #e8e8e8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#595959',
                }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* 일 헤더 */}
          <div style={{ height: HEADER_HEIGHT / 2, display: 'flex', borderBottom: '1px solid #e8e8e8', background: '#fafafa' }}>
            {days.map((d, i) => {
              const isToday = d.isSame(today, 'day');
              const isWeekend = d.day() === 0 || d.day() === 6;
              return (
                <div
                  key={i}
                  style={{
                    width: DAY_WIDTH,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: isToday ? '#1677ff' : isWeekend ? '#ff4d4f' : '#8c8c8c',
                    fontWeight: isToday ? 700 : 400,
                    borderRight: '1px solid #f0f0f0',
                    background: isToday ? '#e6f4ff' : undefined,
                  }}
                >
                  {d.format('D')}
                </div>
              );
            })}
          </div>

          {/* 카드 행 */}
          {cardsWithDates.map(card => {
            const start = card.startDate ? dayjs(card.startDate) : (card.dueDate ? dayjs(card.dueDate) : null);
            const end = card.dueDate ? dayjs(card.dueDate) : start;
            if (!start) return null;

            const startOffset = start.diff(minDate, 'day');
            const span = Math.max(end.diff(start, 'day') + 1, 1);
            const barLeft = startOffset * DAY_WIDTH;
            const barWidth = span * DAY_WIDTH - 2;
            const color = STATUS_COLORS[card.status] ?? '#1677ff';
            const isOverdue = card.dueDate && dayjs(card.dueDate).isBefore(today, 'day') && card.status !== 'done';

            return (
              <div
                key={card.id}
                style={{
                  height: ROW_HEIGHT,
                  borderBottom: '1px solid #f0f0f0',
                  position: 'relative',
                  overflow: 'visible',
                }}
              >
                {/* 주말 배경 */}
                {days.map((d, i) => {
                  if (d.day() !== 0 && d.day() !== 6) return null;
                  return (
                    <div key={i} style={{
                      position: 'absolute', left: i * DAY_WIDTH, top: 0,
                      width: DAY_WIDTH, height: '100%',
                      background: 'rgba(255,77,79,0.04)',
                    }} />
                  );
                })}

                {/* 오늘 세로선 */}
                {todayOffset >= 0 && todayOffset < days.length && (
                  <div style={{
                    position: 'absolute',
                    left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
                    top: 0, bottom: 0, width: 1,
                    background: '#1677ff', opacity: 0.3,
                    zIndex: 1,
                  }} />
                )}

                {/* 바 */}
                <Tooltip
                  title={
                    <div>
                      <div style={{ fontWeight: 600 }}>{card.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.85 }}>
                        {card.startDate ? dayjs(card.startDate).format('MM/DD') : '?'} ~ {card.dueDate ? dayjs(card.dueDate).format('MM/DD') : '?'}
                      </div>
                      {card.progress > 0 && <div style={{ fontSize: 11 }}>진행도: {card.progress}%</div>}
                    </div>
                  }
                >
                  <div
                    onClick={() => onEditCard?.(card)}
                    style={{
                      position: 'absolute',
                      left: barLeft + 1,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: barWidth,
                      height: 26,
                      background: isOverdue ? '#ff4d4f' : color,
                      borderRadius: 4,
                      cursor: 'pointer',
                      zIndex: 2,
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      padding: '0 6px',
                      opacity: card.status === 'cancelled' ? 0.5 : 1,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  >
                    {/* 진행도 오버레이 */}
                    {card.progress > 0 && card.progress < 100 && (
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${card.progress}%`,
                        background: 'rgba(255,255,255,0.25)',
                        borderRadius: '4px 0 0 4px',
                      }} />
                    )}
                    <Text
                      ellipsis
                      style={{ fontSize: 11, color: '#fff', fontWeight: 500, flex: 1, zIndex: 1 }}
                    >
                      {card.cardNumber ? `#${card.cardNumber} ` : ''}{card.title}
                    </Text>
                    {(card.assignees ?? []).filter(a => a.type === 'assignee').slice(0, 2).map(a => (
                      <Avatar
                        key={a.id}
                        size={16}
                        style={{ backgroundColor: getAvatarColor(a.userId), fontSize: 9, flexShrink: 0, zIndex: 1 }}
                      >
                        {a.user?.displayName?.slice(0, 1)}
                      </Avatar>
                    ))}
                  </div>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
