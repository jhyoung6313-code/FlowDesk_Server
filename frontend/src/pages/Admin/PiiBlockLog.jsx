import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Typography, Space, Select, Button, Tag, Tooltip,
} from 'antd';
import {
  StopOutlined, ReloadOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getPiiBlocks } from '../../api/admin';
import { getUsers } from '../../api/users';

// backend/src/utils/piiPatterns.js 의 유형과 1:1 대응
const TYPE_COLORS = {
  주민등록번호: 'red',
  신용카드번호: 'volcano',
  계좌번호: 'orange',
  연락처: 'gold',
};

const PAGE_SIZE = 20;

export default function PiiBlockLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filterUserId, setFilterUserId] = useState(undefined);
  const [filterType, setFilterType] = useState(undefined);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...(filterUserId ? { userId: filterUserId } : {}),
        ...(filterType ? { piiType: filterType } : {}),
      };
      const data = await getPiiBlocks(params);
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, filterUserId, filterType]);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      title: '일시',
      dataIndex: 'createdAt',
      width: 160,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '사용자',
      dataIndex: 'user',
      width: 130,
      render: (u, rec) => (
        <Space size={4}>
          <UserOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
          <span style={{ fontSize: 13 }}>{u?.displayName || rec.username || '익명'}</span>
        </Space>
      ),
    },
    {
      title: '유형',
      dataIndex: 'piiType',
      width: 110,
      render: (v) => <Tag color={TYPE_COLORS[v] || 'default'} style={{ fontSize: 12 }}>{v}</Tag>,
    },
    {
      title: '마스킹',
      dataIndex: 'masked',
      width: 130,
      render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '입력 위치(필드)',
      dataIndex: 'fieldPath',
      width: 150,
      render: (v) => v
        ? <Tooltip title={v}><Typography.Text style={{ fontSize: 12 }} ellipsis>{v}</Typography.Text></Tooltip>
        : '-',
    },
    {
      title: '요청',
      dataIndex: 'endpoint',
      width: 200,
      render: (v) => v
        ? <Tooltip title={v}><Typography.Text style={{ fontSize: 12, color: 'var(--fd-text-secondary)' }} ellipsis>{v}</Typography.Text></Tooltip>
        : '-',
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      width: 130,
      render: (v) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '-'}</span>,
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        <StopOutlined style={{ marginRight: 8, color: '#cf1322' }} />
        개인정보 입력 차단 로그
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        주민등록번호·신용카드번호·계좌번호·연락처(010)가 입력되어 저장이 차단된 시도 이력입니다.
        원문은 저장하지 않으며, 식별용 마스킹본만 표시됩니다. (관리자 전용)
      </Typography.Paragraph>

      <Card style={{ borderRadius: 8 }}>
        <Space className="fd-toolbar" style={{ marginBottom: 12 }} wrap>
          <Select
            placeholder="유형 필터"
            allowClear
            value={filterType}
            onChange={(v) => { setFilterType(v); setPage(1); }}
            style={{ width: 150 }}
            size="small"
            options={Object.keys(TYPE_COLORS).map((t) => ({ value: t, label: t }))}
          />
          <Select
            placeholder="사용자 필터"
            allowClear
            value={filterUserId}
            onChange={(v) => { setFilterUserId(v); setPage(1); }}
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
          scroll={{ x: 1180 }}
        />
      </Card>
    </div>
  );
}
