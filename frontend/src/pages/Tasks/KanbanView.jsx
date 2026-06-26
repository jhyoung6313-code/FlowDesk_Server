import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Row, Col, Card, Tag, Avatar, Tooltip, Space,
  Select, Input, Button, Spin, message, Popconfirm,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useTaskStore from '../../store/taskStore';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import TaskForm from '../../components/Task/TaskForm';
import PriorityBadge from '../../components/Task/PriorityBadge';
import DdayBadge from '../../components/Task/DdayBadge';
import { getParts } from '../../api/parts';
import { getUsers } from '../../api/users';
import { getAvatarColor } from '../../utils/colors';
import { isOverdue } from '../../utils/dday';

const { Option } = Select;

const COLUMNS = [
  { key: 'pending',     label: '대기',   dot: '#94a3b8', color: '#334155', bg: '#ffffff' },
  { key: 'in_progress', label: '진행중', dot: '#3b82f6', color: '#1d4ed8', bg: '#ffffff' },
  { key: 'overdue',     label: '지연',   dot: '#ef4444', color: '#dc2626', bg: '#ffffff' },
  { key: 'done',        label: '완료',   dot: '#22c55e', color: '#15803d', bg: '#ffffff' },
  { key: 'hold',        label: '보류',   dot: '#f59e0b', color: '#b45309', bg: '#ffffff' },
];

export default function KanbanView() {
  const { tasks, loading, fetchTasks, addTask, editTask: storeEditTask, removeTask, changeStatus } = useTaskStore();
  const user = useAuthStore((s) => s.user);
  const isDark = useThemeStore((s) => s.isDark);

  const [parts, setParts]       = useState([]);
  const [users, setUsers]       = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState(null);
  const [search, setSearch]     = useState('');
  const [filterPart, setFilterPart]         = useState(undefined);
  const [filterAssignee, setFilterAssignee] = useState(undefined);
  const [filterPriority, setFilterPriority] = useState(undefined);

  const [draggingId, setDraggingId]     = useState(null);
  const [dragOverCol, setDragOverCol]   = useState(null);

  useEffect(() => {
    getParts().then(setParts);
    getUsers().then((u) => setUsers(u.filter((x) => x.isActive)));
  }, []);

  useEffect(() => {
    fetchTasks();
  }, []);

  const canEdit = (task) =>
    user?.role === 'admin' ||
    task.createdBy === user?.id ||
    task.assignees?.some((a) => (a.userId ?? a.user?.id) === user?.id);

  const filtered = tasks.filter((t) => {
    if (t.delYn === '1') return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPart && t.partId !== filterPart) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterAssignee && !t.assignees?.some((a) => (a.userId ?? a.user?.id) === filterAssignee)) return false;
    return true;
  });

  const getColumnTasks = (colKey) => {
    if (colKey === 'overdue') return filtered.filter((t) => isOverdue(t.dueDate, t.status));
    return filtered.filter((t) => t.status === colKey && !isOverdue(t.dueDate, t.status));
  };

  const handleDragStart = useCallback((e, task) => {
    setDraggingId(task.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colKey);
  }, []);

  const handleDrop = useCallback(async (e, colKey) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggingId) return;
    // 지연 컬럼은 날짜 기반이므로 드롭 대상으로 사용 불가
    if (colKey === 'overdue') { setDraggingId(null); return; }
    const task = tasks.find((t) => t.id === draggingId);
    if (!task || task.status === colKey) { setDraggingId(null); return; }
    if (!canEdit(task)) {
      message.warning('상태 변경 권한이 없습니다.');
      setDraggingId(null);
      return;
    }
    try {
      await changeStatus(draggingId, colKey);
    } catch {
      message.error('상태 변경에 실패했습니다.');
    }
    setDraggingId(null);
  }, [draggingId, tasks, changeStatus]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverCol(null);
  }, []);

  const handleDelete = useCallback(async (id) => {
    try {
      await removeTask(id);
      message.success('업무가 삭제되었습니다.');
    } catch (err) {
      message.error(err?.response?.data?.error || '삭제에 실패했습니다.');
    }
  }, [removeTask]);

  const handleSubmit = useCallback(async (data) => {
    if (currentTask) {
      await storeEditTask(currentTask.id, data);
      message.success('업무가 수정되었습니다.');
    } else {
      await addTask(data);
      message.success('업무가 등록되었습니다.');
    }
    fetchTasks();
  }, [currentTask, storeEditTask, addTask, fetchTasks]);

  return (
    <div>
      {/* 액션 버튼 영역 */}
      <Row justify="end" style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { setCurrentTask(null); setFormOpen(true); }}>
          업무 등록
        </Button>
      </Row>

      {/* 필터 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }} styles={{ body: { padding: '10px 16px' } }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="업무명 검색"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select placeholder="파트" style={{ width: '100%' }}
              value={filterPart} onChange={setFilterPart} allowClear>
              {parts.map((p) => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select placeholder="담당자" style={{ width: '100%' }}
              value={filterAssignee} onChange={setFilterAssignee} allowClear>
              {users.map((u) => <Option key={u.id} value={u.id}>{u.displayName}</Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select placeholder="우선순위" style={{ width: '100%' }}
              value={filterPriority} onChange={setFilterPriority} allowClear>
              <Option value="high">높음</Option>
              <Option value="normal">보통</Option>
              <Option value="low">낮음</Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* 칸반 컬럼 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <Row gutter={12} style={{ alignItems: 'flex-start' }}>
          {COLUMNS.map((col) => {
            const colTasks = getColumnTasks(col.key);
            const isOver = dragOverCol === col.key;
            return (
              <Col key={col.key} xs={24} sm={12} lg={col.key === 'overdue' ? 5 : 4}
                style={{ marginBottom: 12 }}
                onDragOver={(e) => col.key !== 'overdue' && handleDragOver(e, col.key)}
                onDrop={(e) => handleDrop(e, col.key)}
                onDragLeave={() => setDragOverCol(null)}
              >
                <div className="kanban-column" style={{
                  background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                  border: `1px solid ${isOver ? col.dot : (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0')}`,
                  borderRadius: 8,
                  minHeight: 200,
                  padding: '10px 8px',
                  transition: 'border-color 0.15s',
                }}>
                  <div className="kanban-column-header" style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    marginBottom: 8, padding: '2px 4px 8px',
                    borderBottom: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid var(--fd-border)',
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: col.dot, flexShrink: 0,
                    }} />
                    <span className="kanban-column-label" style={{
                      fontSize: 11, fontWeight: 600,
                      color: isDark ? 'rgba(255,255,255,0.35)' : '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1,
                    }}>
                      {col.label}
                    </span>
                    <span className="kanban-column-count" style={{
                      fontSize: 11, fontWeight: 600,
                      color: isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8',
                      background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                      borderRadius: 4, padding: '1px 6px',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--fd-border)',
                    }}>
                      {colTasks.length}
                    </span>
                  </div>

                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {colTasks.map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        isDark={isDark}
                        dragging={draggingId === task.id}
                        canEdit={canEdit(task)}
                        canDelete={user?.role === 'admin' || task.createdBy === user?.id}
                        onEdit={() => { setCurrentTask(task); setFormOpen(true); }}
                        onDelete={() => handleDelete(task.id)}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                    {colTasks.length === 0 && (
                      <div className="kanban-empty" style={{
                        textAlign: 'center',
                        color: isDark ? 'rgba(255,255,255,0.2)' : '#bfbfbf',
                        fontSize: 12, padding: '16px 0',
                      }}>
                        업무 없음
                      </div>
                    )}
                  </Space>
                </div>
              </Col>
            );
          })}
        </Row>
      )}

      <TaskForm
        open={formOpen}
        task={currentTask}
        onClose={() => { setFormOpen(false); setCurrentTask(null); }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function KanbanCard({ task, isDark, dragging, canEdit, canDelete, onEdit, onDelete, onDragStart, onDragEnd }) {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <Card
      size="small"
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      className={overdue ? 'kanban-card kanban-card-overdue' : 'kanban-card'}
      style={{
        cursor: 'grab',
        opacity: dragging ? 0.4 : 1,
        background: isDark ? '#1a1927' : '#ffffff',
        border: overdue
          ? (isDark ? '1px solid rgba(239,68,68,0.35)' : '1px solid #fca5a5')
          : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--fd-border)'),
        borderLeft: overdue ? '2px solid #ef4444' : '2px solid transparent',
        boxShadow: isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
        borderRadius: 6,
        userSelect: 'none',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
      styles={{ body: { padding: '9px 11px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <Typography.Text
          strong
          style={{ fontSize: 13, color: overdue ? '#f87171' : (isDark ? 'rgba(255,255,255,0.85)' : undefined), flex: 1 }}
        >
          {task.title}
        </Typography.Text>
        <Space size={2} style={{ flexShrink: 0 }}>
          {canEdit && (
            <Tooltip title="수정">
              <Button type="text" size="small" icon={<EditOutlined />}
                style={{ padding: '0 4px', height: 20 }} onClick={onEdit} />
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title="삭제하시겠습니까?"
              onConfirm={onDelete}
              okText="삭제" cancelText="취소"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="삭제">
                <Button type="text" size="small" danger icon={<DeleteOutlined />}
                  style={{ padding: '0 4px', height: 20 }} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      </div>

      {task.part && (
        <Tag color="blue" style={{ fontSize: 11, marginTop: 4 }}>{task.part.name}</Tag>
      )}
      {overdue && (
        <Tag color="default" style={{ fontSize: 10, marginTop: 4 }}>
          {task.status === 'in_progress' ? '진행중' : task.status === 'hold' ? '보류' : '대기'}
        </Tag>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <PriorityBadge priority={task.priority} />
        {task.dueDate && <DdayBadge dueDate={task.dueDate} status={task.status} />}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Avatar.Group max={{ count: 3 }} size={20}>
          {task.assignees?.map((a) => {
            const uid = a.userId ?? a.user?.id;
            return (
              <Tooltip key={uid} title={a.user?.displayName}>
                <Avatar size={20} style={{ backgroundColor: getAvatarColor(uid), fontSize: 10 }}>
                  {a.user?.displayName?.slice(0, 1)}
                </Avatar>
              </Tooltip>
            );
          })}
          {task.extraAssignees?.map((e) => (
            <Tooltip key={`x-${e.id}`} title={e.name}>
              <Avatar size={20} style={{ backgroundColor: '#8c8c8c', fontSize: 10 }}>
                {e.name?.slice(0, 1)}
              </Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
        {task.dueDate && (
          <Typography.Text style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8' }}>
            {dayjs(task.dueDate).format('MM/DD')}
          </Typography.Text>
        )}
      </div>
    </Card>
  );
}
