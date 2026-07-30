import { useEffect, useState } from 'react';
import { Modal, Button, Popconfirm, message } from 'antd';
import dayjs from 'dayjs';
import useAuthStore from '../../store/authStore';
import useScheduleStore from '../../store/scheduleStore';
import { getDepartments, getTeams } from '../../api/org';
import { typeMeta } from './scheduleMeta';

export default function ScheduleDetail({ open, event, onClose, onEdit }) {
  const user = useAuthStore((s) => s.user);
  const removeEvent = useScheduleStore((s) => s.removeEvent);
  const [depts, setDepts] = useState([]);
  const [teams, setTeams] = useState([]);

  const hasScopes = !!(event && ((event.shareDeptIds || []).length || (event.shareTeamIds || []).length));
  useEffect(() => {
    if (!open || !hasScopes) return;
    getDepartments().then(setDepts).catch(() => {});
    getTeams().then(setTeams).catch(() => {});
  }, [open, hasScopes]);

  if (!event) return null;

  const scopeNames = [
    ...(event.shareDeptIds || []).map((id) => `${depts.find((d) => d.id === id)?.name || `부서#${id}`} (부서)`),
    ...(event.shareTeamIds || []).map((id) => `${teams.find((t) => t.id === id)?.name || `팀#${id}`} (팀)`),
  ];

  const m = typeMeta(event.type);
  const canManage = user?.role === 'admin' || event.createdBy === user?.id;

  const period = (() => {
    const s = dayjs(event.startDate), e = dayjs(event.endDate);
    const same = s.isSame(e, 'day');
    const base = same ? s.format('YYYY-MM-DD (ddd)') : `${s.format('YYYY-MM-DD')} ~ ${e.format('YYYY-MM-DD')}`;
    if (event.allDay) return `${base} · 종일`;
    return `${base} · ${event.startTime || ''}~${event.endTime || ''}`;
  })();

  const handleDelete = async () => {
    try {
      await removeEvent(event.id);
      message.success('일정이 삭제되었습니다.');
      onClose?.();
    } catch (e) {
      message.error(e?.response?.data?.error || '삭제에 실패했습니다.');
    }
  };

  const Row = ({ k, children }) => (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 11 }}>
      <span style={{ width: 64, color: '#94A3B8', fontWeight: 600, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, color: '#0F172A' }}>{children}</span>
    </div>
  );

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={400} destroyOnClose
      styles={{ body: { paddingTop: 0 } }}>
      {/* 유형 헤더 */}
      <div style={{
        margin: '-20px -24px 18px', padding: '18px 24px', color: '#fff',
        background: `linear-gradient(135deg, ${m.color}, ${m.color}dd)`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 22 }}>{m.icon}</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{event.title || m.label}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{m.label}{event.allDay ? ' · 종일' : ''}</div>
        </div>
      </div>

      <Row k="대상자">{(event.assignees || []).map((a) => a.displayName).join(', ') || '-'}</Row>
      {(event.shares || []).length > 0 && (
        <Row k="공유자">{event.shares.map((s) => s.displayName).join(', ')}</Row>
      )}
      {scopeNames.length > 0 && (
        <Row k="공유범위">{scopeNames.join(', ')}</Row>
      )}
      {event.visibility && event.visibility !== 'public' && (
        <Row k="공개">{event.visibility === 'private' ? '🔒 비공개' : '👥 지정 공유'}</Row>
      )}
      <Row k="기간">{period}</Row>
      {event.resource && <Row k={event.resource.kind === 'room' ? '회의실' : '차량'}>{event.resource.name}</Row>}
      {event.location && <Row k="장소">{event.location}</Row>}
      {event.memo && <Row k="메모">{event.memo}</Row>}
      <Row k="등록자">{event.creator?.displayName || '-'} · {dayjs(event.createdAt).format('MM-DD')}</Row>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        {canManage && (
          <Popconfirm title="이 일정을 삭제할까요?" okText="삭제" cancelText="취소" onConfirm={handleDelete} okButtonProps={{ danger: true }}>
            <Button danger>삭제</Button>
          </Popconfirm>
        )}
        {canManage && <Button onClick={() => onEdit?.(event)}>수정</Button>}
        <Button type="primary" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
