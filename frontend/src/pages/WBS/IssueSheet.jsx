import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Table, Button, Select, DatePicker, InputNumber, Input, Popconfirm,
  Tag, Space, message, Progress, Tooltip,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, LinkOutlined, FilterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as wbsApi from '../../api/wbs';

const { TextArea } = Input;
const { Option } = Select;

const STATUS_COLOR = {
  open: 'red',
  in_progress: 'blue',
  closed: 'green',
  hold: 'orange',
};
const STATUS_LABEL = {
  open: '오픈',
  in_progress: '진행중',
  closed: '완료',
  hold: '보류',
};

function EditableCell({ value, onChange, type = 'text', options = [], style = {} }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  const save = () => {
    setEditing(false);
    if (val !== value) onChange(val);
  };

  if (!editing) {
    if (type === 'date') {
      return (
        <div style={{ minHeight: 22, cursor: 'pointer', ...style }} onClick={() => { setVal(value); setEditing(true); }}>
          {value ? dayjs(value).format('MM/DD') : <span style={{ color: '#bbb', fontSize: 12 }}>-</span>}
        </div>
      );
    }
    if (type === 'select') {
      return (
        <div style={{ cursor: 'pointer' }} onClick={() => { setVal(value); setEditing(true); }}>
          <Tag color={STATUS_COLOR[value]}>{STATUS_LABEL[value] || value}</Tag>
        </div>
      );
    }
    if (type === 'number') {
      const num = value ?? 0;
      return (
        <div style={{ cursor: 'pointer' }} onClick={() => { setVal(num); setEditing(true); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Progress percent={num} size="small" style={{ flex: 1, margin: 0 }} showInfo={false}
              strokeColor={num >= 100 ? '#52c41a' : num >= 50 ? '#1890ff' : '#faad14'} />
            <span style={{ fontSize: 11, minWidth: 30 }}>{num}%</span>
          </div>
        </div>
      );
    }
    return (
      <div style={{ minHeight: 22, cursor: 'pointer', ...style }} onClick={() => { setVal(value); setEditing(true); }}>
        {value || <span style={{ color: '#bbb', fontSize: 12 }}>입력</span>}
      </div>
    );
  }

  if (type === 'date') {
    return (
      <DatePicker size="small" autoFocus
        defaultValue={value ? dayjs(value) : null}
        onChange={(d) => setVal(d ? d.format('YYYY-MM-DD') : null)}
        onBlur={save} style={{ width: '100%' }} />
    );
  }
  if (type === 'select') {
    return (
      <Select size="small" autoFocus defaultValue={value}
        onChange={(v) => { setVal(v); onChange(v); setEditing(false); }}
        onBlur={() => setEditing(false)}
        style={{ width: '100%' }}>
        {options.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
      </Select>
    );
  }
  if (type === 'number') {
    return (
      <InputNumber size="small" autoFocus min={0} max={100}
        defaultValue={value}
        onChange={(v) => setVal(v)}
        onBlur={save} onPressEnter={save}
        style={{ width: '100%' }} addonAfter="%" />
    );
  }
  if (type === 'textarea') {
    return (
      <TextArea autoFocus autoSize={{ minRows: 1, maxRows: 4 }}
        defaultValue={value}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save} style={{ width: '100%' }} />
    );
  }
  return (
    <Input size="small" autoFocus defaultValue={value}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save} onPressEnter={save} />
  );
}

// ─── WBS 항목 연결 셀 ────────────────────────────────
const WBS_LINK_STORAGE_KEY = 'wbs_link_dropdown_width';
const DEFAULT_DROPDOWN_WIDTH = 320;

function WbsLinkCell({ value, onChange, wbsTasks }) {
  const [editing, setEditing] = useState(false);
  const [dropdownWidth, setDropdownWidth] = useState(
    () => Number(localStorage.getItem(WBS_LINK_STORAGE_KEY)) || DEFAULT_DROPDOWN_WIDTH
  );
  const resizingRef = useRef(null);

  const matched = wbsTasks.find((t) => t.name === value);
  const displayNum = matched?._num ?? '';
  const displayName = matched ? matched.name : value;

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = dropdownWidth;

    const onMouseMove = (moveEvent) => {
      const next = Math.max(220, Math.min(700, startWidth + moveEvent.clientX - startX));
      setDropdownWidth(next);
    };
    const onMouseUp = (upEvent) => {
      const final = Math.max(220, Math.min(700, startWidth + upEvent.clientX - startX));
      localStorage.setItem(WBS_LINK_STORAGE_KEY, String(final));
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [dropdownWidth]);

  if (!editing) {
    return (
      <div
        style={{ cursor: 'pointer', minHeight: 22, display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={() => setEditing(true)}
      >
        {displayName ? (
          <Tooltip title={`[${displayNum}] ${displayName}`}>
            <Tag icon={<LinkOutlined />} color="geekblue" style={{ margin: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayNum && <span style={{ opacity: 0.7, marginRight: 3 }}>{displayNum}</span>}
              {displayName}
            </Tag>
          </Tooltip>
        ) : (
          <span style={{ color: '#bbb', fontSize: 12 }}>연결 없음</span>
        )}
      </div>
    );
  }

  return (
    <Select
      autoFocus
      size="small"
      allowClear
      showSearch
      placeholder="번호 또는 작업명으로 검색..."
      defaultValue={value || undefined}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      filterOption={(input, option) =>
        (option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())
      }
      dropdownRender={(menu) => (
        <div ref={resizingRef} style={{ width: dropdownWidth, minWidth: 220, maxWidth: 700, position: 'relative' }}>
          {menu}
          {/* 리사이즈 핸들 */}
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 16, height: 16, cursor: 'col-resize',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              padding: 2,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.35 }}>
              <line x1="9" y1="1" x2="1" y2="9" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9" y1="5" x2="5" y2="9" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
      options={[
        { value: '', label: '연결 없음', searchLabel: '연결 없음' },
        ...wbsTasks.map((t) => ({
          value: t.name,
          searchLabel: `${t._num ?? ''} ${t.name}`,
          label: (
            <span>
              <span style={{
                display: 'inline-block', minWidth: 36,
                fontSize: 11, color: '#1890ff', fontWeight: 700,
                marginRight: 6, fontVariantNumeric: 'tabular-nums',
              }}>
                {t._num}
              </span>
              <span style={{ paddingLeft: t.level * 8, color: t.level === 0 ? '#1b5e20' : t.level === 1 ? '#2e7d32' : '#555', fontWeight: t.level === 0 ? 700 : t.level === 1 ? 600 : 400 }}>
                {t.name}
              </span>
            </span>
          ),
        })),
      ]}
      onChange={(v) => {
        onChange(v || null);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
    />
  );
}

export default function IssueSheet({ projectId, issues, onRefresh, wbsTasks = [] }) {
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return issues;
    return issues.filter((i) => i.status === statusFilter);
  }, [issues, statusFilter]);

  const handleAdd = async () => {
    setLoading(true);
    try {
      await wbsApi.createIssue(projectId, { content: '새 이슈', status: 'open', progress: 0 });
      onRefresh();
    } catch {
      message.error('이슈 추가 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (issueId, field, value) => {
    try {
      await wbsApi.updateIssue(issueId, { [field]: value });
      onRefresh();
    } catch {
      message.error('수정 실패');
    }
  };

  const handleDelete = async (issueId) => {
    try {
      await wbsApi.deleteIssue(issueId);
      onRefresh();
    } catch {
      message.error('삭제 실패');
    }
  };

  // 마감 임박 여부 (3일 이내)
  const isDueSoon = (targetDate, status) => {
    if (!targetDate || status === 'closed') return false;
    return dayjs(targetDate).diff(dayjs(), 'day') <= 3;
  };

  const isOverdue = (targetDate, status) => {
    if (!targetDate || status === 'closed') return false;
    return dayjs().isAfter(dayjs(targetDate), 'day');
  };

  const noWrapHeader = { onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }) };

  const columns = [
    {
      title: 'No',
      key: 'no',
      width: 44,
      align: 'center',
      ...noWrapHeader,
      render: (_, __, idx) => (
        <span style={{ fontSize: 12, color: '#999' }}>{idx + 1}</span>
      ),
    },
    {
      title: 'WBS 연결',
      dataIndex: 'category',
      key: 'wbsLink',
      width: 150,
      ...noWrapHeader,
      render: (val, record) => (
        <WbsLinkCell
          value={val}
          wbsTasks={wbsTasks}
          onChange={(v) => handleUpdate(record.id, 'category', v)}
        />
      ),
    },
    {
      title: '이슈내용',
      dataIndex: 'content',
      key: 'content',
      ...noWrapHeader,
      render: (val, record) => (
        <EditableCell
          value={val}
          type="textarea"
          onChange={(v) => handleUpdate(record.id, 'content', v)}
        />
      ),
    },
    {
      title: '발생일',
      dataIndex: 'occurDate',
      key: 'occurDate',
      width: 82,
      ...noWrapHeader,
      render: (val, record) => (
        <EditableCell value={val} type="date" onChange={(v) => handleUpdate(record.id, 'occurDate', v)} />
      ),
    },
    {
      title: '목표해결일',
      dataIndex: 'targetDate',
      key: 'targetDate',
      width: 96,
      ...noWrapHeader,
      render: (val, record) => {
        const over = isOverdue(val, record.status);
        const soon = isDueSoon(val, record.status);
        return (
          <div style={{ color: over ? '#ff4d4f' : soon ? '#fa8c16' : undefined }}>
            <EditableCell value={val} type="date" onChange={(v) => handleUpdate(record.id, 'targetDate', v)} />
            {over && <div style={{ fontSize: 10, color: '#ff4d4f' }}>지연</div>}
            {!over && soon && <div style={{ fontSize: 10, color: '#fa8c16' }}>임박</div>}
          </div>
        );
      },
    },
    {
      title: '진척률',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      ...noWrapHeader,
      render: (val, record) => (
        <EditableCell value={Number(val)} type="number" onChange={(v) => handleUpdate(record.id, 'progress', v)} />
      ),
    },
    {
      title: '완료예정일',
      dataIndex: 'expectedDate',
      key: 'expectedDate',
      width: 96,
      ...noWrapHeader,
      render: (val, record) => (
        <EditableCell value={val} type="date" onChange={(v) => handleUpdate(record.id, 'expectedDate', v)} />
      ),
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      ...noWrapHeader,
      render: (val, record) => (
        <EditableCell
          value={val}
          type="select"
          options={[
            { value: 'open', label: '오픈' },
            { value: 'in_progress', label: '진행중' },
            { value: 'closed', label: '완료' },
            { value: 'hold', label: '보류' },
          ]}
          onChange={(v) => handleUpdate(record.id, 'status', v)}
        />
      ),
    },
    {
      title: '비고',
      dataIndex: 'note',
      key: 'note',
      width: 150,
      ...noWrapHeader,
      render: (val, record) => (
        <EditableCell value={val} type="textarea" onChange={(v) => handleUpdate(record.id, 'note', v)} />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 44,
      render: (_, record) => (
        <Popconfirm title="이슈를 삭제하시겠습니까?" onConfirm={() => handleDelete(record.id)}>
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  // 상태별 카운트
  const counts = useMemo(() => {
    const c = { all: issues.length, open: 0, in_progress: 0, closed: 0, hold: 0 };
    issues.forEach((i) => { if (c[i.status] !== undefined) c[i.status]++; });
    return c;
  }, [issues]);

  return (
    <div>
      {/* 상태 필터 */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FilterOutlined style={{ color: '#aaa' }} />
        {[
          { key: 'all', label: '전체', color: 'default' },
          { key: 'open', label: '오픈', color: 'red' },
          { key: 'in_progress', label: '진행중', color: 'blue' },
          { key: 'hold', label: '보류', color: 'orange' },
          { key: 'closed', label: '완료', color: 'green' },
        ].map(({ key, label, color }) => (
          <Tag
            key={key}
            color={statusFilter === key ? color : 'default'}
            style={{
              cursor: 'pointer',
              fontWeight: statusFilter === key ? 700 : 400,
              border: statusFilter === key ? undefined : '1px dashed #d9d9d9',
            }}
            onClick={() => setStatusFilter(key)}
          >
            {label} {counts[key] > 0 ? `(${counts[key]})` : ''}
          </Tag>
        ))}
        <span style={{ fontSize: 12, color: '#aaa', marginLeft: 4 }}>
          표시: {filtered.length} / 전체 {issues.length}건
        </span>
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: 1200 }}
        rowClassName={(record) => {
          if (record.status === 'closed') return 'issue-row-closed';
          if (isOverdue(record.targetDate, record.status)) return 'issue-row-overdue';
          if (isDueSoon(record.targetDate, record.status)) return 'issue-row-soon';
          return '';
        }}
      />

      <style>{`
        .issue-row-closed td { opacity: 0.5; }
        .issue-row-overdue { background: #fff1f0 !important; }
        .issue-row-overdue td { background: #fff1f0 !important; }
        .issue-row-soon { background: #fffbe6 !important; }
        .issue-row-soon td { background: #fffbe6 !important; }
      `}</style>

      <Button icon={<PlusOutlined />} onClick={handleAdd} loading={loading} style={{ marginTop: 8 }}>
        이슈 추가
      </Button>
    </div>
  );
}
