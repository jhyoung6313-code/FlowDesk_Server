import React, { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { Button, Select, Typography, Empty, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function CalendarView({ board, cards, onAddCard, onEditCard }) {
  const dateProps = (board.properties ?? []).filter(p => p.type === 'date');
  const [selectedPropId, setSelectedPropId] = useState(dateProps[0]?.id ?? null);

  const events = useMemo(() => {
    if (!selectedPropId) return [];
    return cards
      .map(card => {
        const pv = card.properties?.find(p => p.propertyId === selectedPropId);
        if (!pv?.value) return null;
        const dateStr = String(pv.value).slice(0, 10);
        if (!dateStr || dateStr === 'null') return null;
        return {
          id: String(card.id),
          title: card.title,
          date: dateStr,
          backgroundColor: card.coverColor || '#1677ff',
          borderColor: card.coverColor || '#1677ff',
          extendedProps: { card },
        };
      })
      .filter(Boolean);
  }, [cards, selectedPropId]);

  if (dateProps.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Empty description={<span>캘린더 뷰를 사용하려면 <b>date</b> 타입 속성을 추가하세요.</span>} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddCard()}>카드 추가</Button>
        <div>
          <Text type="secondary" style={{ marginRight: 8, fontSize: 12 }}>날짜 기준 속성:</Text>
          <Select
            value={selectedPropId}
            onChange={setSelectedPropId}
            style={{ width: 160 }}
            size="small"
          >
            {dateProps.map(p => (
              <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
            ))}
          </Select>
        </div>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        locale="ko"
        events={events}
        height="auto"
        eventClick={({ event }) => onEditCard(event.extendedProps.card)}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth',
        }}
        buttonText={{ today: '오늘', month: '월' }}
      />
    </div>
  );
}
