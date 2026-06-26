import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Typography, Space, Select, Button, Tag, Spin,
} from 'antd';
import {
  HistoryOutlined, ReloadOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getActivityLog } from '../../api/admin';
import { getUsers } from '../../api/users';

const ACTION_LABELS = {
  create: { label: '생성', color: 'green' },
  update: { label: '수정', color: 'blue' },
  delete: { label: '삭제', color: 'red' },
  status_change: { label: '상태변경', color: 'orange' },
  comment: { label: '댓글', color: 'purple' },
  attachment: { label: '첨부', color: 'cyan' },
};

const FIELD_LABELS = {
  title: '제목', description: '설명', status: '상태', priority: '우선순위',
  startDate: '시작일', dueDate: '마감일', partId: '파트', assignees: '담당자',
  predecessors: '선행업무', tags: '태그',
};

const PAGE_SIZE = 20;

export default function ActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filterUserId, setFilterUserId] = useState(undefined);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...(filterUserId ? { userId: filterUserId } : {}),
      };
      const data = await getActivityLog(params);
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, filterUserId]);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFilterChange = (val) => {
    setFilterUserId(val);
    setPage(1);
  };

  const columns = [
    {
      title: '일시',
      dataIndex: 'createdAt',
      width: 150,
      render: (v) => dayjs(v).format('MM/DD HH:mm'),
    },
    {
      title: '사용자',
      dataIndex: 'user',
      width: 100,
      render: (u) => (
        <Space size={4}>
          <UserOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />
          <span style={{ fontSize: 13 }}>{u?.displayName || '-'}</span>
        </Space>
      ),
    },
    {
      title: '액션',
      dataIndex: 'action',
      width: 90,
      render: (v) => {
        const cfg = ACTION_LABELS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color} style={{ fontSize: 11 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '업무',
      dataIndex: 'task',
      render: (t) => (
        <Typography.Text style={{ fontSize: 13 }} ellipsis={{ tooltip: t?.title }}>
          {t?.title || '(삭제된 업무)'}
        </Typography.Text>
      ),
    },
    {
      title: '필드',
      dataIndex: 'field',
      width: 90,
      render: (v) => v ? <span style={{ fontSize: 12, color: 'var(--fd-text-secondary)' }}>{FIELD_LABELS[v] || v}</span> : '-',
    },
    {
      title: '변경 내용',
      key: 'change',
      render: (_, rec) => {
        if (!rec.oldValue && !rec.newValue) return '-';
        return (
          <Space size={4} style={{ fontSize: 12 }}>
            {rec.oldValue && <span style={{ color: '#ff4d4f', textDecoration: 'line-through' }}>{rec.oldValue}</span>}
            {rec.oldValue && rec.newValue && <span style={{ color: '#8c8c8c' }}>→</span>}
            {rec.newValue && <span style={{ color: '#52c41a' }}>{rec.newValue}</span>}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        <HistoryOutlined style={{ marginRight: 8 }} />
        활동 로그
      </Typography.Title>

      {/* 필터 + 테이블 */}
      <Card style={{ borderRadius: 8 }}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            placeholder="사용자 필터"
            allowClear
            value={filterUserId}
            onChange={handleFilterChange}
            style={{ width: 150 }}
            size="small"
          >
            {users.map((u) => (
              <Select.Option key={u.id} value={u.id}>{u.displayName}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} size="small" onClick={load}>새로고침</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `총 ${t}건`,
          }}
          scroll={{ x: 700 }}
        />
      </Card>
    </div>
  );
}
