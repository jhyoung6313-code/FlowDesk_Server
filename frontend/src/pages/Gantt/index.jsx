import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Typography, Select, Space, Spin, Empty, message, Button, Tooltip,
  Modal, Form, Input, DatePicker, Popconfirm, Tag,
} from 'antd';
import { FlagOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import { Gantt, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import dayjs from 'dayjs';
import { getGanttTasks, updateTask } from '../../api/tasks';
import { getMilestones, createMilestone, updateMilestone, deleteMilestone } from '../../api/milestones';
import { getParts } from '../../api/parts';
import { getUsers } from '../../api/users';
import { STATUS_COLORS } from '../../utils/colors';
import useAuthStore from '../../store/authStore';
import useTaskStore from '../../store/taskStore';

const { Option } = Select;

const STATUS_LABEL = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
  hold: '보류',
};

const VIEW_MODE_MAP = {
  Day: ViewMode.Day,
  Week: ViewMode.Week,
  Month: ViewMode.Month,
};

const PRESET_COLORS = [
  '#722ed1', '#1677ff', '#52c41a', '#fa8c16',
  '#f5222d', '#13c2c2', '#eb2f96', '#fadb14',
];

function toGanttTask(t) {
  const today = new Date();
  const start = t.startDate ? new Date(t.startDate) : today;
  const end = t.dueDate
    ? new Date(t.dueDate)
    : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const safeEnd = end <= start ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : end;

  const isOverdue =
    t.dueDate && dayjs(t.dueDate).isBefore(dayjs(), 'day') && t.status !== 'done';

  let progress = 0;
  if (t.status === 'done') progress = 100;
  else if (t.status === 'in_progress') progress = 50;
  else if (t.status === 'hold') progress = 20;

  const partLabel = t.part?.name ? `[${t.part.name}] ` : '';

  return {
    id: String(t.id),
    name: `${partLabel}${t.title}`,
    start,
    end: safeEnd,
    progress,
    type: 'task',
    isDisabled: false,
    dependencies: t.predecessors?.map((p) => String(p.predecessorId)) || [],
    styles: {
      progressColor: isOverdue ? '#ff7875' : STATUS_COLORS[t.status]?.color || '#1677ff',
      progressSelectedColor: isOverdue ? '#ff4d4f' : STATUS_COLORS[t.status]?.color || '#1677ff',
      backgroundColor: isOverdue
        ? '#fff1f0'
        : t.status === 'done'
        ? '#f6ffed'
        : t.status === 'hold'
        ? '#fff7e6'
        : '#e6f4ff',
      backgroundSelectedColor: isOverdue ? '#ffccc7' : '#bae0ff',
    },
    _raw: t,
  };
}

function toGanttMilestone(m) {
  const date = new Date(m.date);
  return {
    id: `milestone-${m.id}`,
    name: m.name,
    start: date,
    end: date,
    progress: 0,
    type: 'milestone',
    isDisabled: true,
    styles: {
      progressColor: m.color,
      progressSelectedColor: m.color,
      backgroundColor: m.color,
      backgroundSelectedColor: m.color,
    },
    _milestone: m,
  };
}

export default function GanttPage({ embedded = false }) {
  const [tasks, setTasks]           = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [parts, setParts]           = useState([]);
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [viewMode, setViewMode]     = useState('Week');
  const [columnWidth, setColumnWidth] = useState(65);
  const [showMilestones, setShowMilestones] = useState(true);

  // 필터
  const [filterPartId, setFilterPartId]     = useState(undefined);
  const [filterStatus, setFilterStatus]     = useState(undefined);
  const [filterAssigneeId, setFilterAssigneeId] = useState(undefined);
  const [filterSearch, setFilterSearch]     = useState('');

  // 마일스톤 모달
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [msEditing, setMsEditing]     = useState(null);
  const [msForm] = Form.useForm();
  const [msSaving, setMsSaving]       = useState(false);
  const [msColor, setMsColor]         = useState('#722ed1');

  const user = useAuthStore((s) => s.user);
  const bumpVersion = useTaskStore((s) => s.bumpVersion);
  const isAdmin = user?.role === 'admin';

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getGanttTasks(), getMilestones(), getParts(), getUsers()])
      .then(([t, m, p, u]) => {
        setTasks(t);
        setMilestones(m);
        setParts(p);
        setUsers(u);
      })
      .catch(() => message.error('간트 차트 데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setColumnWidth(viewMode === 'Day' ? 40 : viewMode === 'Week' ? 65 : 160);
  }, [viewMode]);

  // 필터 적용
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterPartId && t.part?.id !== filterPartId) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      if (filterAssigneeId) {
        const assigneeIds = t.assignees?.map((a) => a.userId) || [];
        if (!assigneeIds.includes(filterAssigneeId)) return false;
      }
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterPartId, filterStatus, filterAssigneeId, filterSearch]);

  const hasFilter = filterPartId || filterStatus || filterAssigneeId || filterSearch;

  const resetFilters = () => {
    setFilterPartId(undefined);
    setFilterStatus(undefined);
    setFilterAssigneeId(undefined);
    setFilterSearch('');
  };

  const ganttTasks = [
    ...filteredTasks.map(toGanttTask),
    ...(showMilestones ? milestones.map(toGanttMilestone) : []),
  ].sort((a, b) => a.start - b.start);

  const handleDateChange = useCallback(async (task) => {
    if (task.type === 'milestone') return;
    try {
      await updateTask(Number(task.id), {
        startDate: dayjs(task.start).format('YYYY-MM-DD'),
        dueDate: dayjs(task.end).format('YYYY-MM-DD'),
      });
      load();
      bumpVersion(); // 마감일 변경 → 요약 바 지연 카운트 등 calVer 구독 화면 갱신
      message.success('기간이 업데이트되었습니다.');
    } catch {
      message.error('업데이트에 실패했습니다.');
    }
  }, [load, bumpVersion]);

  const handleProgressChange = useCallback(async (task) => {
    if (task.type === 'milestone') return;
    try {
      await updateTask(Number(task.id), {
        startDate: dayjs(task.start).format('YYYY-MM-DD'),
        dueDate: dayjs(task.end).format('YYYY-MM-DD'),
      });
      load();
      bumpVersion();
    } catch {
      message.error('업데이트에 실패했습니다.');
    }
  }, [load, bumpVersion]);

  // 마일스톤 CRUD
  const openMsCreate = () => {
    setMsEditing(null);
    setMsColor('#722ed1');
    msForm.resetFields();
    setMsModalOpen(true);
  };

  const openMsEdit = (m) => {
    setMsEditing(m);
    setMsColor(m.color);
    msForm.setFieldsValue({ name: m.name, date: dayjs(m.date), description: m.description });
    setMsModalOpen(true);
  };

  const handleMsSave = async () => {
    try {
      const values = await msForm.validateFields();
      setMsSaving(true);
      const data = {
        name: values.name,
        date: values.date.format('YYYY-MM-DD'),
        color: msColor,
        description: values.description,
      };
      if (msEditing) {
        await updateMilestone(msEditing.id, data);
        message.success('수정되었습니다.');
      } else {
        await createMilestone(data);
        message.success('마일스톤이 추가되었습니다.');
      }
      setMsModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setMsSaving(false);
    }
  };

  const handleMsDelete = async (id) => {
    try {
      await deleteMilestone(id);
      message.success('삭제되었습니다.');
      load();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      {/* 상단 제목 + 뷰 전환 + 마일스톤 버튼 */}
      <Space style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {!embedded && '간트 차트'}
          {hasFilter && (
            <Tag color="blue" style={{ marginLeft: embedded ? 0 : 8, fontSize: 12, fontWeight: 400 }}>
              {filteredTasks.length}/{tasks.length}건 표시
            </Tag>
          )}
        </Typography.Title>
        <Space wrap>
          <Select value={viewMode} onChange={setViewMode} style={{ width: 80 }}>
            <Option value="Day">일</Option>
            <Option value="Week">주</Option>
            <Option value="Month">월</Option>
          </Select>
          <Button
            icon={<FlagOutlined />}
            type={showMilestones ? 'primary' : 'default'}
            onClick={() => setShowMilestones((v) => !v)}
          >
            마일스톤
          </Button>
          {isAdmin && (
            <Button icon={<PlusOutlined />} onClick={openMsCreate}>마일스톤 추가</Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={load}>새로고침</Button>
        </Space>
      </Space>

      {/* 필터 행 */}
      <Space style={{ marginBottom: 12, flexWrap: 'wrap' }} size={[8, 8]} wrap>
        <FilterOutlined style={{ color: '#8c8c8c' }} />
        <Input.Search
          placeholder="업무명 검색"
          allowClear
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          style={{ width: 160 }}
          size="small"
        />
        <Select
          placeholder="파트"
          allowClear
          value={filterPartId}
          onChange={setFilterPartId}
          style={{ width: 120 }}
          size="small"
        >
          {parts.map((p) => <Option key={p.id} value={p.id}>{p.name}</Option>)}
        </Select>
        <Select
          placeholder="상태"
          allowClear
          value={filterStatus}
          onChange={setFilterStatus}
          style={{ width: 100 }}
          size="small"
        >
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <Option key={k} value={k}>{v}</Option>
          ))}
        </Select>
        <Select
          placeholder="담당자"
          allowClear
          value={filterAssigneeId}
          onChange={setFilterAssigneeId}
          style={{ width: 120 }}
          size="small"
          showSearch
          filterOption={(input, option) =>
            option?.children?.toLowerCase().includes(input.toLowerCase())
          }
        >
          {users.map((u) => <Option key={u.id} value={u.id}>{u.displayName}</Option>)}
        </Select>
        {hasFilter && (
          <Button size="small" onClick={resetFilters}>초기화</Button>
        )}
      </Space>

      {/* 범례 */}
      <Space style={{ marginBottom: 12 }} wrap>
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <Space key={key} size={4}>
            <span style={{
              display: 'inline-block', width: 12, height: 12, borderRadius: 2,
              backgroundColor: STATUS_COLORS[key]?.color || '#ccc',
            }} />
            <Typography.Text style={{ fontSize: 12 }}>{label}</Typography.Text>
          </Space>
        ))}
        <Space size={4}>
          <span style={{
            display: 'inline-block', width: 12, height: 12, borderRadius: 2,
            backgroundColor: '#ff4d4f',
          }} />
          <Typography.Text style={{ fontSize: 12 }}>마감초과</Typography.Text>
        </Space>
        <Space size={4}>
          <FlagOutlined style={{ fontSize: 12, color: '#722ed1' }} />
          <Typography.Text style={{ fontSize: 12 }}>마일스톤</Typography.Text>
        </Space>
      </Space>

      {/* 마일스톤 목록 (활성 시) */}
      {showMilestones && milestones.length > 0 && (
        <Space style={{ marginBottom: 12, flexWrap: 'wrap' }} size={[8, 4]} wrap>
          {milestones.map((m) => (
            <Tag
              key={m.id}
              icon={<FlagOutlined />}
              color={m.color}
              style={{ cursor: isAdmin ? 'pointer' : 'default' }}
            >
              <span>{m.name}</span>
              <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 11 }}>
                {dayjs(m.date).format('MM/DD')}
              </span>
              {isAdmin && (
                <>
                  <EditOutlined
                    style={{ marginLeft: 6, fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); openMsEdit(m); }}
                  />
                  <Popconfirm
                    title="삭제하시겠습니까?"
                    onConfirm={() => handleMsDelete(m.id)}
                    onPopupClick={(e) => e.stopPropagation()}
                  >
                    <DeleteOutlined style={{ marginLeft: 4, fontSize: 11 }} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </>
              )}
            </Tag>
          ))}
        </Space>
      )}

      {ganttTasks.length === 0 ? (
        <Empty description="표시할 업무가 없습니다." style={{ marginTop: 40 }} />
      ) : (
        <div className="gantt-container" style={{ overflowX: 'auto', background: 'var(--fd-surface)', borderRadius: 8, padding: '12px 0' }}>
          <Gantt
            tasks={ganttTasks}
            viewMode={VIEW_MODE_MAP[viewMode]}
            onDateChange={handleDateChange}
            onProgressChange={handleProgressChange}
            listCellWidth="180px"
            columnWidth={columnWidth}
            locale="ko"
            rowHeight={38}
            headerHeight={52}
            fontSize="12px"
            TooltipContent={({ task }) => {
              if (task.type === 'milestone') {
                const m = task._milestone;
                return (
                  <div style={{
                    background: 'var(--fd-surface)', border: '1px solid var(--fd-border)', borderRadius: 6,
                    padding: '8px 12px', minWidth: 160, fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: m.color }}>
                      <FlagOutlined /> {m.name}
                    </div>
                    <div>날짜: {dayjs(m.date).format('YYYY-MM-DD')}</div>
                    {m.description && <div style={{ marginTop: 4, color: 'var(--fd-text-secondary)' }}>{m.description}</div>}
                  </div>
                );
              }
              const raw = task._raw;
              return (
                <div style={{
                  background: 'var(--fd-surface)', border: '1px solid var(--fd-border)', borderRadius: 6,
                  padding: '8px 12px', minWidth: 200, fontSize: 12,
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{raw?.title}</div>
                  {raw?.part && <div>파트: {raw.part.name}</div>}
                  <div>상태: {STATUS_LABEL[raw?.status]}</div>
                  {raw?.startDate && <div>시작: {dayjs(raw.startDate).format('YYYY-MM-DD')}</div>}
                  {raw?.dueDate && <div>마감: {dayjs(raw.dueDate).format('YYYY-MM-DD')}</div>}
                  <div>진행률: {task.progress}%</div>
                  {raw?.assignees?.length > 0 && (
                    <div>담당자: {raw.assignees.map((a) => a.user?.displayName).join(', ')}</div>
                  )}
                  {raw?.tags?.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      태그: {raw.tags.map((tt) => tt.tag?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              );
            }}
          />
        </div>
      )}

      {/* 마일스톤 추가/수정 모달 */}
      <Modal
        title={msEditing ? '마일스톤 수정' : '마일스톤 추가'}
        open={msModalOpen}
        onOk={handleMsSave}
        onCancel={() => setMsModalOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={msSaving}
      >
        <Form form={msForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="마일스톤 이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input placeholder="예: 1차 릴리즈, 베타 오픈" />
          </Form.Item>
          <Form.Item name="date" label="날짜" rules={[{ required: true, message: '날짜를 선택하세요.' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="색상">
            <Space wrap>
              {PRESET_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setMsColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: 4, backgroundColor: c,
                    cursor: 'pointer',
                    border: msColor === c ? '2px solid #000' : '2px solid transparent',
                  }}
                />
              ))}
            </Space>
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="마일스톤 설명 (선택)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
