import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Typography, Space, Select, Button, Tag, Tooltip,
} from 'antd';
import {
  SafetyCertificateOutlined, ReloadOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAuditLog } from '../../api/admin';
import { getUsers } from '../../api/users';

// AUDIT_ACTION(backend/src/config/security.js)과 1:1 대응
const ACTION_LABELS = {
  LOGIN_SUCCESS:     { label: '로그인',        color: 'green' },
  LOGIN_FAIL:        { label: '로그인 실패',   color: 'red' },
  LOGOUT:            { label: '로그아웃',      color: 'default' },
  ACCOUNT_LOCKED:    { label: '계정 잠금',     color: 'volcano' },
  PASSWORD_CHANGE:   { label: '비밀번호 변경', color: 'blue' },
  PASSWORD_RESET:    { label: '비밀번호 초기화', color: 'geekblue' },
  PII_READ:          { label: '개인정보 조회', color: 'purple' },
  DATA_EXPORT:       { label: '데이터 반출',   color: 'orange' },
  PERMISSION_DENIED: { label: '권한 거부',     color: 'magenta' },
  DATA_PURGE:        { label: '데이터 파기',   color: 'gold' },
  ANOMALY_DETECTED:  { label: '이상 탐지',     color: 'red' },
};

// 로그인/로그아웃 이력 위주의 빠른 필터 프리셋
const AUTH_ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGOUT', 'ACCOUNT_LOCKED'];

const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filterUserId, setFilterUserId] = useState(undefined);
  const [filterAction, setFilterAction] = useState(undefined);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...(filterUserId ? { userId: filterUserId } : {}),
        ...(filterAction ? { action: filterAction } : {}),
      };
      const data = await getAuditLog(params);
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, filterUserId, filterAction]);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUserFilter = (val) => {
    setFilterUserId(val);
    setPage(1);
  };

  const handleActionFilter = (val) => {
    setFilterAction(val);
    setPage(1);
  };

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
          <UserOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />
          {/* 사용자가 삭제됐어도 username 스냅샷으로 추적 가능 */}
          <span style={{ fontSize: 13 }}>{u?.displayName || rec.username || '-'}</span>
        </Space>
      ),
    },
    {
      title: '액션',
      dataIndex: 'action',
      width: 120,
      render: (v) => {
        const cfg = ACTION_LABELS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color} style={{ fontSize: 11 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '결과',
      dataIndex: 'success',
      width: 70,
      render: (v) => (
        v
          ? <Tag color="success" style={{ fontSize: 11 }}>성공</Tag>
          : <Tag color="error" style={{ fontSize: 11 }}>실패</Tag>
      ),
    },
    {
      title: 'IP 주소',
      dataIndex: 'ipAddress',
      width: 140,
      render: (v) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '-'}</span>,
    },
    {
      title: '대상',
      dataIndex: 'resource',
      width: 140,
      render: (v) => v
        ? <span style={{ fontSize: 12, color: 'var(--fd-text-secondary)' }}>{v}</span>
        : '-',
    },
    {
      title: '상세',
      dataIndex: 'detail',
      render: (v) => v
        ? (
          <Tooltip title={v}>
            <Typography.Text style={{ fontSize: 12 }} ellipsis>{v}</Typography.Text>
          </Tooltip>
        )
        : '-',
    },
    {
      title: 'User-Agent',
      dataIndex: 'userAgent',
      width: 160,
      render: (v) => v
        ? (
          <Tooltip title={v}>
            <Typography.Text style={{ fontSize: 11, color: 'var(--fd-text-secondary)' }} ellipsis>{v}</Typography.Text>
          </Tooltip>
        )
        : '-',
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        <SafetyCertificateOutlined style={{ marginRight: 8 }} />
        접속기록 (보안 감사로그)
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        로그인·로그아웃을 포함한 보안 이벤트 이력입니다. (위·변조 방지를 위해 추가만 가능)
      </Typography.Paragraph>

      <Card style={{ borderRadius: 8 }}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            placeholder="액션 필터"
            allowClear
            value={filterAction}
            onChange={handleActionFilter}
            style={{ width: 160 }}
            size="small"
            options={Object.entries(ACTION_LABELS).map(([value, cfg]) => ({ value, label: cfg.label }))}
          />
          <Select
            placeholder="사용자 필터"
            allowClear
            value={filterUserId}
            onChange={handleUserFilter}
            style={{ width: 150 }}
            size="small"
          >
            {users.map((u) => (
              <Select.Option key={u.id} value={u.id}>{u.displayName}</Select.Option>
            ))}
          </Select>
          <Button
            size="small"
            type={AUTH_ACTIONS.includes(filterAction) ? 'primary' : 'default'}
            onClick={() => handleActionFilter(filterAction === 'LOGIN_SUCCESS' ? undefined : 'LOGIN_SUCCESS')}
          >
            로그인만 보기
          </Button>
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
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
}
