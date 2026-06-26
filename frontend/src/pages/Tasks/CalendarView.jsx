import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Typography, Modal, Descriptions, Tag, Space, message,
  Button, Tooltip, Input, Form, Popconfirm,
} from 'antd';
import {
  EditOutlined, UnorderedListOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { getCalendarTasks } from '../../api/tasks';
import {
  getCalendarNotes, createCalendarNote, updateCalendarNote, deleteCalendarNote,
} from '../../api/calendarNotes';
import { getMilestones } from '../../api/milestones';
import { STATUS_COLORS, getAvatarColor } from '../../utils/colors';
import { getHolidayName, getDayCellClassNames } from '../../utils/koreanHolidays';
import StatusBadge from '../../components/Task/StatusBadge';
import PriorityBadge from '../../components/Task/PriorityBadge';
import DdayBadge from '../../components/Task/DdayBadge';
import TaskForm from '../../components/Task/TaskForm';
import useTaskStore from '../../store/taskStore';
import useAuthStore from '../../store/authStore';

const calendarStyles = `
  .fc-day-kr-holiday { background-color: #fff1f0 !important; }
  .fc-day-kr-sunday  { background-color: #fff6f6 !important; }
  .fc-day-kr-saturday { background-color: #f0f5ff !important; }
  .fc-day-kr-holiday .fc-daygrid-day-number,
  .fc-day-kr-sunday  .fc-daygrid-day-number { color: #ff4d4f !important; }
  .fc-day-kr-saturday .fc-daygrid-day-number { color: #1677ff !important; }
  .kr-holiday-name {
    font-size: 9px;
    color: #ff4d4f;
    font-weight: 600;
    line-height: 1.1;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 2px;
    display: block;
  }
`;

export default function CalendarView({ isActive }) {
  const [searchParams] = useSearchParams();
  const calendarRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const [noteModal, setNoteModal] = useState(false);
  const [noteDate, setNoteDate] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteEditTarget, setNoteEditTarget] = useState(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const [selectedNote, setSelectedNote] = useState(null);
  const [noteVersion, setNoteVersion] = useState(0);

  const { editTask, calendarVersion } = useTaskStore();
  const user = useAuthStore((s) => s.user);

  /* ── 탭이 활성화될 때 캘린더 레이아웃 강제 갱신 ── */
  useEffect(() => {
    if (isActive && calendarRef.current) {
      setTimeout(() => {
        calendarRef.current?.getApi()?.updateSize();
      }, 50);
    }
  }, [isActive]);

  /* ── URL ?date=YYYY-MM 파라미터로 해당 월로 이동 ── */
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam && calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.gotoDate(dayjs(dateParam).startOf('month').toDate());
    }
  }, [searchParams]);

  /* ── 업무/임시업무 변경 시 캘린더 자동 갱신 ── */
  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().refetchEvents();
    }
  }, [calendarVersion, noteVersion]);

  const fetchEvents = useCallback(async (info, successCallback, failureCallback) => {
    try {
      const start = info.startStr.slice(0, 10);
      const end   = info.endStr.slice(0, 10);

      const [tasks, notes, milestoneList] = await Promise.all([
        getCalendarTasks(start, end),
        getCalendarNotes(start, end),
        getMilestones({ start, end }),
      ]);

      const taskEvents = tasks.map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        start: task.startDate || task.dueDate,
        end: task.dueDate
          ? dayjs(task.dueDate).add(1, 'day').format('YYYY-MM-DD')
          : undefined,
        backgroundColor:
          task.status === 'done'
            ? STATUS_COLORS.done.color
            : task.assignees?.[0]?.user?.id
            ? getAvatarColor(task.assignees[0].user.id)
            : '#1677ff',
        borderColor: 'transparent',
        textColor: '#fff',
        extendedProps: { type: 'task', ...task },
      }));

      const noteEvents = notes.map((note) => ({
        id: `note-${note.id}`,
        title: `📝 ${note.content}`,
        start: dayjs(note.date).format('YYYY-MM-DD'),
        allDay: true,
        backgroundColor: '#8c8c8c',
        borderColor: 'transparent',
        textColor: '#fff',
        extendedProps: { type: 'note', ...note },
      }));

      const milestoneEvents = milestoneList.map((m) => ({
        id: `milestone-${m.id}`,
        title: `🚩 ${m.name}`,
        start: dayjs(m.date).format('YYYY-MM-DD'),
        allDay: true,
        backgroundColor: m.color,
        borderColor: m.color,
        textColor: '#fff',
        extendedProps: { type: 'milestone', ...m },
      }));

      successCallback([...taskEvents, ...noteEvents, ...milestoneEvents]);
    } catch {
      failureCallback(new Error('일정을 불러오지 못했습니다.'));
    }
  }, []);

  const handleEventClick = useCallback(({ event }) => {
    const props = event.extendedProps;
    if (props.type === 'note') {
      setSelectedNote(props);
    } else if (props.type === 'milestone') {
      // 무시
    } else {
      setSelected(props);
    }
  }, []);

  const handleDateClick = useCallback(({ dateStr }) => {
    setNoteDate(dateStr);
    setNoteContent('');
    setNoteEditTarget(null);
    setNoteModal(true);
  }, []);

  const handleEventDrop = useCallback(async ({ event, revert }) => {
    const props = event.extendedProps;
    if (props.type === 'note') {
      revert();
      return;
    }
    const task = props;
    const newStart = dayjs(event.start).format('YYYY-MM-DD');
    const duration =
      task.dueDate && task.startDate
        ? dayjs(task.dueDate).diff(dayjs(task.startDate), 'day')
        : 0;
    const newDue = dayjs(newStart).add(duration, 'day').format('YYYY-MM-DD');

    try {
      await editTask(task.id, { startDate: newStart, dueDate: newDue });
      message.success(`"${task.title}" 기한이 변경되었습니다.`);
      setSelected((prev) =>
        prev?.id === task.id ? { ...prev, startDate: newStart, dueDate: newDue } : prev,
      );
    } catch {
      revert();
      message.error('기한 변경에 실패했습니다.');
    }
  }, [editTask]);

  const handleOpenEdit = useCallback((task) => {
    setEditTarget(task);
    setSelected(null);
    setFormOpen(true);
  }, []);

  const handleFormSubmit = useCallback(async (data) => {
    await editTask(editTarget.id, data);
    message.success('업무가 수정되었습니다.');
  }, [editTarget, editTask]);

  const handleNoteSave = useCallback(async () => {
    if (!noteContent.trim()) {
      message.warning('내용을 입력해주세요.');
      return;
    }
    setNoteSaving(true);
    try {
      if (noteEditTarget) {
        await updateCalendarNote(noteEditTarget.id, { content: noteContent });
        message.success('임시업무가 수정되었습니다.');
      } else {
        await createCalendarNote({ date: noteDate, content: noteContent });
        message.success('임시업무가 등록되었습니다.');
      }
      setNoteModal(false);
      setNoteVersion((v) => v + 1);
    } catch {
      message.error('저장에 실패했습니다.');
    } finally {
      setNoteSaving(false);
    }
  }, [noteContent, noteDate, noteEditTarget]);

  const handleNoteDelete = useCallback(async (note) => {
    try {
      await deleteCalendarNote(note.id);
      message.success('임시업무가 삭제되었습니다.');
      setSelectedNote(null);
      setNoteVersion((v) => v + 1);
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  }, []);

  const handleNoteEdit = useCallback((note) => {
    setNoteDate(dayjs(note.date).format('YYYY-MM-DD'));
    setNoteContent(note.content);
    setNoteEditTarget(note);
    setSelectedNote(null);
    setNoteModal(true);
  }, []);

  const canEdit = (task) =>
    user?.role === 'admin' ||
    task?.createdBy === user?.id ||
    task?.assignees?.some((a) => (a.userId ?? a.user?.id) === user?.id);

  const canEditNote = (note) =>
    user?.role === 'admin' || note?.createdBy === user?.id;

  const dayCellClassNames = useCallback(({ date }) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    return getDayCellClassNames(dateStr);
  }, []);

  const dayCellContent = useCallback(({ date, dayNumberText }) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    const holidayName = getHolidayName(dateStr);
    return (
      <div style={{ width: '100%' }}>
        <span className="fc-daygrid-day-number" style={{ float: 'right', padding: '2px 4px' }}>
          {dayNumberText}
        </span>
        {holidayName && (
          <span className="kr-holiday-name" title={holidayName}>
            {holidayName}
          </span>
        )}
      </div>
    );
  }, []);

  const renderEventContent = useCallback((arg) => {
    const props = arg.event.extendedProps;

    if (props.type === 'note') {
      return (
        <div style={{ padding: '1px 4px', overflow: 'hidden', fontSize: 11, fontWeight: 500 }}>
          📝 {props.content}
        </div>
      );
    }

    const task = props;
    const isOver =
      task.dueDate &&
      task.status !== 'done' &&
      dayjs(task.dueDate).isBefore(dayjs(), 'day');
    return (
      <div style={{
        padding: '1px 4px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        opacity: task.status === 'done' ? 0.65 : 1,
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
        background: isOver ? 'rgba(255,77,79,0.85)' : undefined,
        borderRadius: 3,
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 130,
        }}>
          {arg.event.title}
        </span>
        {task.dueDate && task.status !== 'done' && (
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            background: 'rgba(255,255,255,0.25)',
            borderRadius: 3,
            padding: '0 3px',
            flexShrink: 0,
          }}>
            {dayjs(task.dueDate).diff(dayjs().startOf('day'), 'day') === 0
              ? 'D-Day'
              : dayjs(task.dueDate).diff(dayjs().startOf('day'), 'day') > 0
              ? `D-${dayjs(task.dueDate).diff(dayjs().startOf('day'), 'day')}`
              : `D+${Math.abs(dayjs(task.dueDate).diff(dayjs().startOf('day'), 'day'))}`}
          </span>
        )}
      </div>
    );
  }, []);

  return (
    <div>
      <style>{calendarStyles}</style>

      {/* 힌트 태그 */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Tooltip title="날짜를 클릭하면 임시업무를 등록할 수 있습니다.">
          <Tag color="green" icon={<PlusOutlined />}>임시업무: 날짜 클릭</Tag>
        </Tooltip>
      </div>

      <div style={{ background: 'var(--fd-surface)', borderRadius: 8, padding: 16 }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          events={fetchEvents}
          editable
          droppable
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
          dayCellClassNames={dayCellClassNames}
          dayCellContent={dayCellContent}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{ today: '오늘', month: '월', week: '주', day: '일' }}
          height="auto"
          dayMaxEvents={4}
          moreLinkText={(n) => `+${n}건 더보기`}
        />
      </div>

      {/* 업무 상세 팝업 */}
      <Modal
        open={!!selected}
        onCancel={() => setSelected(null)}
        title={
          <Space>
            <span>{selected?.title}</span>
            {selected && (
              <DdayBadge dueDate={selected.dueDate} status={selected.status} />
            )}
          </Space>
        }
        footer={
          selected
            ? [
                canEdit(selected) && (
                  <Button
                    key="edit"
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() => handleOpenEdit(selected)}
                  >
                    수정
                  </Button>
                ),
                <Button key="close" onClick={() => setSelected(null)}>
                  닫기
                </Button>,
              ].filter(Boolean)
            : []
        }
        width={460}
      >
        {selected && (
          <Descriptions column={1} size="small" bordered style={{ marginTop: 8 }}>
            <Descriptions.Item label="상태">
              <StatusBadge status={selected.status} />
            </Descriptions.Item>
            <Descriptions.Item label="우선순위">
              <PriorityBadge priority={selected.priority} />
            </Descriptions.Item>
            <Descriptions.Item label="시작일">
              {selected.startDate ? dayjs(selected.startDate).format('YYYY-MM-DD') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="마감일">
              <Space>
                {selected.dueDate ? dayjs(selected.dueDate).format('YYYY-MM-DD') : '-'}
                {selected.dueDate && (
                  <DdayBadge dueDate={selected.dueDate} status={selected.status} />
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="담당파트">
              {selected.part?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="담당자">
              <Space wrap>
                {selected.assignees?.map((a) => (
                  <Tag key={a.userId ?? a.user?.id} color="blue">
                    {a.user?.displayName}
                  </Tag>
                ))}
                {selected.extraAssignees?.map((e) => (
                  <Tag key={`extra-${e.id}`} color="default">{e.name}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
            {selected.description && (
              <Descriptions.Item label="설명">{selected.description}</Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* 임시업무 상세 팝업 */}
      <Modal
        open={!!selectedNote}
        onCancel={() => setSelectedNote(null)}
        title={`📝 임시업무 (${selectedNote ? dayjs(selectedNote.date).format('YYYY-MM-DD') : ''})`}
        footer={
          selectedNote
            ? [
                canEditNote(selectedNote) && (
                  <Button
                    key="edit"
                    icon={<EditOutlined />}
                    onClick={() => handleNoteEdit(selectedNote)}
                  >
                    수정
                  </Button>
                ),
                canEditNote(selectedNote) && (
                  <Popconfirm
                    key="delete"
                    title="이 임시업무를 삭제하시겠습니까?"
                    onConfirm={() => handleNoteDelete(selectedNote)}
                    okText="삭제"
                    cancelText="취소"
                  >
                    <Button danger icon={<DeleteOutlined />}>삭제</Button>
                  </Popconfirm>
                ),
                <Button key="close" onClick={() => setSelectedNote(null)}>닫기</Button>,
              ].filter(Boolean)
            : []
        }
        width={380}
      >
        {selectedNote && (
          <div style={{ padding: '8px 0' }}>
            <Typography.Text>{selectedNote.content}</Typography.Text>
            <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
              등록자: {selectedNote.creator?.displayName}
            </div>
          </div>
        )}
      </Modal>

      {/* 임시업무 등록/수정 모달 */}
      <Modal
        open={noteModal}
        onCancel={() => setNoteModal(false)}
        title={noteEditTarget ? `📝 임시업무 수정 (${noteDate})` : `📝 임시업무 등록 (${noteDate})`}
        onOk={handleNoteSave}
        okText={noteEditTarget ? '수정' : '등록'}
        cancelText="취소"
        confirmLoading={noteSaving}
        width={400}
      >
        <Form layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="내용" required>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              placeholder="임시업무 내용을 입력하세요 (최대 200자)"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              autoFocus
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 캘린더에서 바로 업무 수정 */}
      <TaskForm
        open={formOpen}
        task={editTarget}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
