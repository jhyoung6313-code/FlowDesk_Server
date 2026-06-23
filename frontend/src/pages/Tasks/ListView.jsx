import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Table, Button, Space, Select, Input, Popconfirm, message,
  Typography, Tag, Avatar, Tooltip, Row, Col, Card, Drawer,
  Descriptions, Divider, List, Form, Input as AntInput, Spin,
  Tabs, Upload, Timeline,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  CalendarOutlined, EyeOutlined, SendOutlined, FileExcelOutlined,
  PaperClipOutlined, UploadOutlined, HistoryOutlined, MessageOutlined,
  InboxOutlined, DownloadOutlined, FilePdfOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { exportTasksPdf } from '../../utils/pdf';
import TimeTracker from '../../components/Task/TimeTracker';
import { getComments, createComment, updateComment, deleteComment } from '../../api/comments';
import {
  getAttachments, uploadAttachment, deleteAttachment,
  getAttachmentDownloadUrl, getTaskHistory, bulkAction,
} from '../../api/tasks';
import dayjs from 'dayjs';
import useTaskStore from '../../store/taskStore';
import useAuthStore from '../../store/authStore';
import TaskForm from '../../components/Task/TaskForm';
import StatusBadge from '../../components/Task/StatusBadge';
import PriorityBadge from '../../components/Task/PriorityBadge';
import DdayBadge from '../../components/Task/DdayBadge';
import { getParts } from '../../api/parts';
import { getUsers } from '../../api/users';
import { getAvatarColor } from '../../utils/colors';
import { isOverdue } from '../../utils/dday';
import { getTags } from '../../api/tags';

const { Option } = Select;

export default function ListView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    tasks, loading,
    fetchTasks, addTask, editTask: storeEditTask,
    removeTask, changeStatus,
  } = useTaskStore();
  const user = useAuthStore((s) => s.user);

  const [formOpen, setFormOpen]     = useState(false);
  const [currentTask, setCurrentTask] = useState(null);
  const [detailTask, setDetailTask]   = useState(null);
  const [parts, setParts]   = useState([]);
  const [users, setUsers]   = useState([]);
  const [tags, setTags]     = useState([]);

  const [comments, setComments]         = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText]   = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [excelExporting, setExcelExporting] = useState(false);

  const [attachments, setAttachments]     = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [uploading, setUploading]         = useState(false);

  const [histories, setHistories]         = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState('detail');
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimerRef = useRef(null);
  const [filters, setFilters] = useState({
    status:     searchParams.get('status') || undefined,
    partId:     undefined,
    assigneeId: undefined,
    priority:   undefined,
    tagId:      undefined,
    search:     '',
  });

  useEffect(() => {
    const highlightTaskId = location.state?.highlightTaskId;
    if (!highlightTaskId) return;
    setHighlightId(highlightTaskId);
    clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 3000);
    window.history.replaceState({}, '');
    return () => clearTimeout(highlightTimerRef.current);
  }, [location.state?.highlightTaskId]);

  useEffect(() => {
    getParts().then(setParts);
    getUsers().then((u) => setUsers(u.filter((u) => u.isActive)));
    getTags().then(setTags);
  }, []);

  useEffect(() => {
    const params = {};
    // 'overdue'는 서버 상태값이 아니므로 API에 전달하지 않음 (클라이언트 필터링)
    if (filters.status && filters.status !== 'overdue') params.status = filters.status;
    if (filters.partId)     params.partId     = filters.partId;
    if (filters.assigneeId) params.assigneeId = filters.assigneeId;
    if (filters.priority)   params.priority   = filters.priority;
    if (filters.tagId)      params.tagId      = filters.tagId;
    fetchTasks(params);
  }, [filters.status, filters.partId, filters.assigneeId, filters.priority, filters.tagId]);

  const handleOpenEdit = useCallback((task) => {
    setCurrentTask(task);
    setDetailTask(null);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(async (id) => {
    try {
      await removeTask(id);
      message.success('업무가 삭제되었습니다.');
      if (detailTask?.id === id) setDetailTask(null);
    } catch (err) {
      message.error(err?.response?.data?.error || '삭제에 실패했습니다.');
    }
  }, [removeTask, detailTask]);

  const handleStatusChange = useCallback(async (id, status) => {
    try {
      await changeStatus(id, status);
      setDetailTask((prev) =>
        prev?.id === id ? { ...prev, status } : prev
      );
      message.success('상태가 변경되었습니다.');
    } catch {
      message.error('상태 변경에 실패했습니다.');
    }
  }, [changeStatus]);

  const handleSubmit = useCallback(async (data) => {
    if (currentTask) {
      const updated = await storeEditTask(currentTask.id, data);
      message.success('업무가 수정되었습니다.');
      if (detailTask?.id === currentTask.id) setDetailTask(updated);
    } else {
      await addTask(data);
      message.success('업무가 등록되었습니다.');
    }
    fetchTasks();
  }, [currentTask, detailTask, storeEditTask, addTask, fetchTasks]);

  useEffect(() => {
    if (!detailTask) {
      setComments([]);
      setAttachments([]);
      setHistories([]);
      setDrawerTab('detail');
      return;
    }
    setCommentsLoading(true);
    getComments(detailTask.id)
      .then(setComments)
      .catch(() => {})
      .finally(() => setCommentsLoading(false));

    setAttachLoading(true);
    getAttachments(detailTask.id)
      .then(setAttachments)
      .catch(() => {})
      .finally(() => setAttachLoading(false));

    setHistoryLoading(true);
    getTaskHistory(detailTask.id)
      .then(setHistories)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));

    setCommentText('');
    setEditingComment(null);
  }, [detailTask?.id]);

  const handleCommentSubmit = useCallback(async () => {
    if (!commentText.trim() || !detailTask) return;
    setCommentSending(true);
    try {
      const created = await createComment(detailTask.id, commentText.trim());
      setComments((prev) => [...prev, created]);
      setCommentText('');
    } catch {
      message.error('댓글 등록에 실패했습니다.');
    } finally {
      setCommentSending(false);
    }
  }, [commentText, detailTask]);

  const handleCommentUpdate = useCallback(async () => {
    if (!editingComment?.content.trim()) return;
    try {
      const updated = await updateComment(editingComment.id, editingComment.content);
      setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingComment(null);
    } catch {
      message.error('댓글 수정에 실패했습니다.');
    }
  }, [editingComment]);

  const handleCommentDelete = useCallback(async (commentId) => {
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      message.error('댓글 삭제에 실패했습니다.');
    }
  }, []);

  const handleExcelExport = useCallback(async () => {
    setExcelExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'deleted') params.set('status', filters.status);
      if (filters.partId) params.set('partId', filters.partId);
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
      if (filters.priority) params.set('priority', filters.priority);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/tasks/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `업무목록_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Excel 내보내기에 실패했습니다.');
    } finally {
      setExcelExporting(false);
    }
  }, [filters]);

  const handleBulkAction = useCallback(async (action, status) => {
    if (selectedRowKeys.length === 0) return;
    setBulkLoading(true);
    try {
      const result = await bulkAction(selectedRowKeys, action, status);
      message.success(result.message);
      setSelectedRowKeys([]);
      fetchTasks();
    } catch (err) {
      message.error(err?.response?.data?.error || '일괄 처리에 실패했습니다.');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedRowKeys, fetchTasks]);

  const handleGoCalendar = useCallback((task) => {
    if (task.dueDate) {
      const ym = dayjs(task.dueDate).format('YYYY-MM');
      navigate(`/tasks?view=calendar&date=${ym}`);
    } else {
      navigate('/tasks?view=calendar');
    }
  }, [navigate]);

  const filtered = tasks.filter((t) => {
    if (filters.status === 'overdue' && !isOverdue(t.dueDate, t.status)) return false;
    if (!filters.search) return true;
    return t.title.toLowerCase().includes(filters.search.toLowerCase());
  });

  const canEdit = (task) =>
    user?.role === 'admin' ||
    task.createdBy === user?.id ||
    task.assignees?.some((a) => (a.userId ?? a.user?.id) === user?.id);

  const columns = [
    {
      title: '업무명',
      dataIndex: 'title',
      key: 'title',
      render: (title, record) => (
        <Space direction="vertical" size={2}>
          <Space size={6}>
            <Typography.Link
              style={{
                fontWeight: 600,
                color: isOverdue(record.dueDate, record.status) ? '#ff4d4f' : '#1677ff',
              }}
              onClick={() => setDetailTask(record)}
            >
              {title}
            </Typography.Link>
            {isOverdue(record.dueDate, record.status) && (
              <Tag color="error" style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px', marginInlineEnd: 0 }}>지연</Tag>
            )}
            <DdayBadge dueDate={record.dueDate} status={record.status} />
          </Space>
          {record.part && (
            <Tag color="blue" style={{ fontSize: 11, marginTop: 2 }}>
              {record.part.name}
            </Tag>
          )}
          {record.tags?.length > 0 && (
            <Space size={2} style={{ marginTop: 2 }} wrap>
              {record.tags.map((tt) => (
                <Tag
                  key={tt.tagId ?? tt.tag?.id}
                  style={{
                    fontSize: 10, padding: '0 4px', lineHeight: '16px',
                    backgroundColor: tt.tag?.color + '22',
                    borderColor: tt.tag?.color,
                    color: tt.tag?.color,
                  }}
                >
                  {tt.tag?.name}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: '우선순위',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (p) => <PriorityBadge priority={p} />,
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status, record) => {
        if (record.delYn === '1') {
          return <Tag color="default">삭제됨</Tag>;
        }
        return (
          <Space direction="vertical" size={2}>
            {isOverdue(record.dueDate, record.status) && (
              <StatusBadge status={status} dueDate={record.dueDate} />
            )}
            <Select
              value={status}
              size="small"
              style={{ width: 110 }}
              disabled={!canEdit(record)}
              onChange={(v) => handleStatusChange(record.id, v)}
            >
              <Option value="pending">대기</Option>
              <Option value="in_progress">진행중</Option>
              <Option value="done">완료</Option>
              <Option value="hold">보류</Option>
            </Select>
          </Space>
        );
      },
    },
    {
      title: '담당자',
      key: 'assignees',
      width: 120,
      render: (_, record) => (
        <Avatar.Group max={{ count: 4 }} size="small">
          {record.assignees?.map((a) => {
            const uid = a.userId ?? a.user?.id;
            return (
              <Tooltip key={uid} title={a.user?.displayName}>
                <Avatar size="small" style={{ backgroundColor: getAvatarColor(uid) }}>
                  {a.user?.displayName?.slice(0, 1)}
                </Avatar>
              </Tooltip>
            );
          })}
          {record.extraAssignees?.map((e) => (
            <Tooltip key={`extra-${e.id}`} title={e.name}>
              <Avatar size="small" style={{ backgroundColor: '#8c8c8c' }}>
                {e.name?.slice(0, 1)}
              </Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      ),
    },
    {
      title: '기한',
      key: 'dates',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={1}>
          {record.startDate && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              시작 {dayjs(record.startDate).format('MM/DD')}
            </Typography.Text>
          )}
          <Space size={4}>
            {record.dueDate ? (
              <>
                <Typography.Text
                  style={{
                    fontSize: 12,
                    color: isOverdue(record.dueDate, record.status) ? '#ff4d4f' : undefined,
                    fontWeight: isOverdue(record.dueDate, record.status) ? 600 : undefined,
                  }}
                >
                  마감 {dayjs(record.dueDate).format('YYYY-MM-DD')}
                </Typography.Text>
                <Tooltip title="캘린더에서 보기">
                  <CalendarOutlined
                    style={{ color: '#1677ff', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => handleGoCalendar(record)}
                  />
                </Tooltip>
              </>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>-</Typography.Text>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="상세보기">
            <Button
              type="text" size="small"
              icon={<EyeOutlined />}
              onClick={() => setDetailTask(record)}
            />
          </Tooltip>
          {record.delYn !== '1' && canEdit(record) && (
            <Tooltip title="수정">
              <Button
                type="text" size="small"
                icon={<EditOutlined />}
                onClick={() => handleOpenEdit(record)}
              />
            </Tooltip>
          )}
          {record.delYn !== '1' && (user?.role === 'admin' || record.createdBy === user?.id) && (
            <Tooltip title="삭제">
              <Popconfirm
                title="정말 삭제하시겠습니까?"
                description="업무가 삭제 처리되며 삭제됨 목록에서 확인할 수 있습니다."
                onConfirm={() => handleDelete(record.id)}
                okText="삭제"
                cancelText="취소"
                okButtonProps={{ danger: true }}
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 액션 버튼 영역 */}
      <Row justify="end" style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<FileExcelOutlined />}
            loading={excelExporting}
            onClick={handleExcelExport}
          >
            Excel 내보내기
          </Button>
          <Button
            icon={<FilePdfOutlined />}
            onClick={() => exportTasksPdf(filtered)}
          >
            PDF 출력
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCurrentTask(null); setFormOpen(true); }}>
            업무 등록
          </Button>
        </Space>
      </Row>

      {/* 필터 바 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }} styles={{ body: { padding: '12px 16px' } }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="업무명 검색"
              prefix={<SearchOutlined />}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              allowClear
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select placeholder="파트" style={{ width: '100%' }}
              value={filters.partId} onChange={(v) => setFilters((f) => ({ ...f, partId: v }))} allowClear>
              {parts.map((p) => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select placeholder="담당자" style={{ width: '100%' }}
              value={filters.assigneeId} onChange={(v) => setFilters((f) => ({ ...f, assigneeId: v }))} allowClear>
              {users.map((u) => <Option key={u.id} value={u.id}>{u.displayName}</Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select placeholder="상태" style={{ width: '100%' }}
              value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} allowClear>
              <Option value="pending">대기</Option>
              <Option value="in_progress">진행중</Option>
              <Option value="done">완료</Option>
              <Option value="hold">보류</Option>
              <Option value="overdue">지연</Option>
              <Option value="deleted">삭제됨</Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select placeholder="우선순위" style={{ width: '100%' }}
              value={filters.priority} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))} allowClear>
              <Option value="high">높음</Option>
              <Option value="normal">보통</Option>
              <Option value="low">낮음</Option>
            </Select>
          </Col>
          {tags.length > 0 && (
            <Col xs={12} sm={4}>
              <Select placeholder="태그" style={{ width: '100%' }}
                value={filters.tagId} onChange={(v) => setFilters((f) => ({ ...f, tagId: v }))} allowClear>
                {tags.map((t) => (
                  <Option key={t.id} value={t.id}>
                    <Space size={4}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: t.color }} />
                      {t.name}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Col>
          )}
        </Row>
      </Card>

      {/* 일괄 처리 툴바 */}
      {selectedRowKeys.length > 0 && (
        <Card
          style={{ marginBottom: 8, borderRadius: 8, border: '1.5px solid #1677ff', background: '#e6f4ff' }}
          styles={{ body: { padding: '8px 16px' } }}
        >
          <Space wrap>
            <Typography.Text strong style={{ color: '#1677ff' }}>
              {selectedRowKeys.length}건 선택됨
            </Typography.Text>
            <Select
              placeholder="상태 일괄 변경"
              size="small"
              style={{ width: 130 }}
              loading={bulkLoading}
              onChange={(v) => handleBulkAction('status', v)}
            >
              <Option value="pending">→ 대기</Option>
              <Option value="in_progress">→ 진행중</Option>
              <Option value="done">→ 완료</Option>
              <Option value="hold">→ 보류</Option>
            </Select>
            <Popconfirm
              title={`선택한 ${selectedRowKeys.length}건을 삭제하시겠습니까?`}
              onConfirm={() => handleBulkAction('delete')}
              okText="삭제" cancelText="취소"
              okButtonProps={{ danger: true }}
            >
              <Button danger size="small" icon={<DeleteOutlined />} loading={bulkLoading}>
                일괄 삭제
              </Button>
            </Popconfirm>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>선택 해제</Button>
          </Space>
        </Card>
      )}

      {/* 업무 테이블 */}
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          getCheckboxProps: (r) => ({ disabled: r.delYn === '1' }),
        }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `총 ${t}건` }}
        rowClassName={(r) => {
          if (r.id === highlightId) return 'task-row-highlight';
          if (r.delYn === '1') return 'task-row-deleted';
          if (isOverdue(r.dueDate, r.status)) return 'task-row-overdue';
          return '';
        }}
      />

      {/* 업무 등록/수정 폼 */}
      <TaskForm
        open={formOpen}
        task={currentTask}
        onClose={() => { setFormOpen(false); setCurrentTask(null); }}
        onSubmit={handleSubmit}
      />

      {/* 업무 상세보기 Drawer */}
      <Drawer
        title={
          <Space>
            <span>{detailTask?.title}</span>
            {detailTask && isOverdue(detailTask.dueDate, detailTask.status) && (
              <Tag color="error" style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px', marginInlineEnd: 0 }}>지연</Tag>
            )}
            {detailTask && <DdayBadge dueDate={detailTask.dueDate} status={detailTask.status} />}
          </Space>
        }
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
        width={420}
        extra={
          detailTask && (
            <Space>
              {canEdit(detailTask) && (
                <Button
                  type="primary" size="small" icon={<EditOutlined />}
                  onClick={() => handleOpenEdit(detailTask)}
                >
                  수정
                </Button>
              )}
              {detailTask.dueDate && (
                <Button
                  size="small" icon={<CalendarOutlined />}
                  onClick={() => handleGoCalendar(detailTask)}
                >
                  캘린더
                </Button>
              )}
            </Space>
          )
        }
      >
        {detailTask && (
          <Tabs
            activeKey={drawerTab}
            onChange={setDrawerTab}
            size="small"
            items={[
              {
                key: 'detail',
                label: <span><EyeOutlined style={{ marginRight: 4 }} />상세정보</span>,
                children: (
                  <>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="상태">
                        {detailTask.delYn === '1' ? (
                          <Tag color="default">삭제됨</Tag>
                        ) : (
                          <Select
                            value={detailTask.status}
                            size="small"
                            style={{ width: 110 }}
                            disabled={!canEdit(detailTask)}
                            onChange={(v) => handleStatusChange(detailTask.id, v)}
                          >
                            <Option value="pending">대기</Option>
                            <Option value="in_progress">진행중</Option>
                            <Option value="done">완료</Option>
                            <Option value="hold">보류</Option>
                          </Select>
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="우선순위">
                        <PriorityBadge priority={detailTask.priority} />
                      </Descriptions.Item>
                      <Descriptions.Item label="담당파트">
                        {detailTask.part?.name || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="담당자">
                        <Space wrap>
                          {detailTask.assignees?.map((a) => {
                            const uid = a.userId ?? a.user?.id;
                            return (
                              <Tag key={uid} color="blue">{a.user?.displayName}</Tag>
                            );
                          })}
                          {detailTask.extraAssignees?.map((e) => (
                            <Tag key={`extra-${e.id}`} color="default">{e.name}</Tag>
                          ))}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="시작일">
                        {detailTask.startDate ? dayjs(detailTask.startDate).format('YYYY-MM-DD') : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="마감일">
                        <Space>
                          {detailTask.dueDate ? dayjs(detailTask.dueDate).format('YYYY-MM-DD') : '-'}
                          {detailTask.dueDate && (
                            <Tooltip title="캘린더에서 보기">
                              <CalendarOutlined
                                style={{ color: '#1677ff', cursor: 'pointer' }}
                                onClick={() => handleGoCalendar(detailTask)}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      </Descriptions.Item>
                      {detailTask.predecessors?.length > 0 && (
                        <Descriptions.Item label="선행 업무">
                          <Space direction="vertical" size={2}>
                            {detailTask.predecessors.map((p) => (
                              <Tag key={p.predecessorId}>{p.predecessor?.title}</Tag>
                            ))}
                          </Space>
                        </Descriptions.Item>
                      )}
                    </Descriptions>

                    {detailTask.description && (
                      <>
                        <Divider style={{ margin: '12px 0' }} />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>설명</Typography.Text>
                        <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                          {detailTask.description}
                        </div>
                      </>
                    )}

                    {detailTask.delYn !== '1' && (user?.role === 'admin' || detailTask.createdBy === user?.id) && (
                      <>
                        <Divider style={{ margin: '16px 0' }} />
                        <Popconfirm
                          title="정말 삭제하시겠습니까?"
                          description="업무가 삭제 처리되며 삭제됨 목록에서 확인할 수 있습니다."
                          onConfirm={() => handleDelete(detailTask.id)}
                          okText="삭제" cancelText="취소"
                          okButtonProps={{ danger: true }}
                        >
                          <Button danger block icon={<DeleteOutlined />}>
                            이 업무 삭제
                          </Button>
                        </Popconfirm>
                      </>
                    )}
                  </>
                ),
              },
              {
                key: 'comments',
                label: (
                  <span>
                    <MessageOutlined style={{ marginRight: 4 }} />댓글{comments.length > 0 ? ` (${comments.length})` : ''}
                  </span>
                ),
                children: (
                  <>
                    {commentsLoading ? (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}><Spin size="small" /></div>
                    ) : (
                      <div>
                        {comments.map((c) => (
                          <div key={c.id} style={{
                            background: '#fafafa', borderRadius: 6, padding: '8px 10px',
                            marginBottom: 8, border: '1px solid #f0f0f0',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <Space size={6}>
                                <Avatar size={20} style={{ backgroundColor: getAvatarColor(c.userId), fontSize: 10 }}>
                                  {c.user?.displayName?.slice(0, 1)}
                                </Avatar>
                                <Typography.Text strong style={{ fontSize: 12 }}>{c.user?.displayName}</Typography.Text>
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                  {dayjs(c.createdAt).format('MM/DD HH:mm')}
                                </Typography.Text>
                              </Space>
                              {(c.userId === user?.id || user?.role === 'admin') && (
                                <Space size={2}>
                                  {c.userId === user?.id && (
                                    <Button type="text" size="small" style={{ fontSize: 11, height: 20, padding: '0 4px' }}
                                      onClick={() => setEditingComment({ id: c.id, content: c.content })}>
                                      수정
                                    </Button>
                                  )}
                                  <Popconfirm title="댓글을 삭제하시겠습니까?"
                                    onConfirm={() => handleCommentDelete(c.id)}
                                    okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}>
                                    <Button type="text" size="small" danger style={{ fontSize: 11, height: 20, padding: '0 4px' }}>
                                      삭제
                                    </Button>
                                  </Popconfirm>
                                </Space>
                              )}
                            </div>
                            {editingComment?.id === c.id ? (
                              <Space.Compact style={{ width: '100%' }}>
                                <AntInput
                                  size="small"
                                  value={editingComment.content}
                                  onChange={(e) => setEditingComment((p) => ({ ...p, content: e.target.value }))}
                                  onPressEnter={handleCommentUpdate}
                                />
                                <Button size="small" type="primary" onClick={handleCommentUpdate}>저장</Button>
                                <Button size="small" onClick={() => setEditingComment(null)}>취소</Button>
                              </Space.Compact>
                            ) : (
                              <Typography.Text style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.content}</Typography.Text>
                            )}
                          </div>
                        ))}
                        <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                          <AntInput
                            placeholder="댓글을 입력하세요"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onPressEnter={handleCommentSubmit}
                            disabled={commentSending}
                          />
                          <Button type="primary" icon={<SendOutlined />}
                            loading={commentSending} onClick={handleCommentSubmit}>
                            등록
                          </Button>
                        </Space.Compact>
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: 'attachments',
                label: (
                  <span>
                    <PaperClipOutlined style={{ marginRight: 4 }} />첨부{attachments.length > 0 ? ` (${attachments.length})` : ''}
                  </span>
                ),
                children: (
                  <>
                    {attachLoading ? (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}><Spin size="small" /></div>
                    ) : (
                      <>
                        {detailTask.delYn !== '1' && (
                          <Upload.Dragger
                            multiple={false}
                            showUploadList={false}
                            beforeUpload={async (file) => {
                              setUploading(true);
                              try {
                                const created = await uploadAttachment(detailTask.id, file);
                                setAttachments((prev) => [...prev, created]);
                                message.success(`${file.name} 업로드 완료`);
                              } catch {
                                message.error('업로드에 실패했습니다.');
                              } finally {
                                setUploading(false);
                              }
                              return false;
                            }}
                            style={{ marginBottom: 12 }}
                          >
                            <p className="ant-upload-drag-icon">
                              <InboxOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                            </p>
                            <p style={{ fontSize: 13 }}>클릭 또는 파일을 드래그하여 업로드 (최대 20MB)</p>
                          </Upload.Dragger>
                        )}

                        {attachments.length === 0 ? (
                          <div style={{ textAlign: 'center', color: '#bbb', padding: '16px 0', fontSize: 13 }}>
                            첨부파일이 없습니다.
                          </div>
                        ) : (
                          <List
                            size="small"
                            dataSource={attachments}
                            renderItem={(att) => (
                              <List.Item
                                actions={[
                                  <Tooltip title="다운로드" key="dl">
                                    <Button
                                      type="text" size="small" icon={<DownloadOutlined />}
                                      onClick={() => {
                                        const token = localStorage.getItem('token');
                                        fetch(getAttachmentDownloadUrl(att.id), {
                                          headers: { Authorization: `Bearer ${token}` },
                                        })
                                          .then((r) => r.blob())
                                          .then((blob) => {
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = att.originalName;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                          })
                                          .catch(() => message.error('다운로드에 실패했습니다.'));
                                      }}
                                    />
                                  </Tooltip>,
                                  (user?.role === 'admin' || att.uploadedBy === user?.id) && (
                                    <Popconfirm
                                      key="del"
                                      title="파일을 삭제하시겠습니까?"
                                      onConfirm={async () => {
                                        try {
                                          await deleteAttachment(att.id);
                                          setAttachments((prev) => prev.filter((a) => a.id !== att.id));
                                          message.success('파일이 삭제되었습니다.');
                                        } catch {
                                          message.error('삭제에 실패했습니다.');
                                        }
                                      }}
                                      okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}
                                    >
                                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  ),
                                ].filter(Boolean)}
                              >
                                <Space size={6}>
                                  <PaperClipOutlined style={{ color: '#1677ff' }} />
                                  <div>
                                    <Typography.Text style={{ fontSize: 13 }} ellipsis={{ tooltip: att.originalName }}>
                                      {att.originalName}
                                    </Typography.Text>
                                    <div>
                                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                        {(att.size / 1024).toFixed(1)} KB · {att.uploader?.displayName} · {dayjs(att.createdAt).format('MM/DD HH:mm')}
                                      </Typography.Text>
                                    </div>
                                  </div>
                                </Space>
                              </List.Item>
                            )}
                          />
                        )}
                      </>
                    )}
                  </>
                ),
              },
              {
                key: 'history',
                label: (
                  <span>
                    <HistoryOutlined style={{ marginRight: 4 }} />히스토리
                  </span>
                ),
                children: (
                  <>
                    {historyLoading ? (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}><Spin size="small" /></div>
                    ) : histories.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#bbb', padding: '16px 0', fontSize: 13 }}>
                        변경 이력이 없습니다.
                      </div>
                    ) : (
                      <Timeline
                        style={{ marginTop: 8 }}
                        items={histories.map((h) => {
                          const ACTION_LABEL = {
                            create: '업무 생성',
                            update: '수정',
                            delete: '삭제',
                            attach: '파일 첨부',
                            detach: '파일 삭제',
                          };
                          let desc = '';
                          if (h.action === 'update' && h.field) {
                            desc = `${h.field}: ${h.oldValue ?? '-'} → ${h.newValue ?? '-'}`;
                          } else if (h.action === 'attach') {
                            desc = `파일 추가: ${h.newValue}`;
                          } else if (h.action === 'detach') {
                            desc = `파일 삭제: ${h.oldValue}`;
                          } else if (h.action === 'create') {
                            desc = `"${h.newValue}" 업무 생성됨`;
                          } else if (h.action === 'delete') {
                            desc = '업무 삭제됨';
                          }
                          return {
                            color: h.action === 'delete' ? 'red' : h.action === 'create' ? 'green' : 'blue',
                            children: (
                              <div style={{ fontSize: 12 }}>
                                <Space size={6}>
                                  <Typography.Text strong style={{ fontSize: 12 }}>
                                    {ACTION_LABEL[h.action] || h.action}
                                  </Typography.Text>
                                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                    {h.user?.displayName}
                                  </Typography.Text>
                                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                    {dayjs(h.createdAt).format('MM/DD HH:mm')}
                                  </Typography.Text>
                                </Space>
                                {desc && (
                                  <div style={{ color: '#595959', marginTop: 2 }}>{desc}</div>
                                )}
                              </div>
                            ),
                          };
                        })}
                      />
                    )}
                  </>
                ),
              },
              {
                key: 'timetracking',
                label: (
                  <span>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />시간 기록
                  </span>
                ),
                children: (
                  <TimeTracker taskId={detailTask?.id} currentUser={user} />
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </div>
  );
}
