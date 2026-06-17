import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Table, Button, Input, DatePicker, InputNumber, Popconfirm,
  Space, message, Tooltip, Modal, Drawer, Select, Tag, Badge, Divider, Progress, Upload,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PlusCircleOutlined,
  FileTextOutlined, ExpandAltOutlined, SearchOutlined,
  ExclamationCircleOutlined, BugOutlined, CloseOutlined,
  PaperClipOutlined, DownloadOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as wbsApi from '../../api/wbs';

// ─── 컬럼 리사이즈 핸들 헤더 셀 ──────────────────────────
function ResizableHeaderCell({ onResize, width, ...restProps }) {
  const thRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (width === undefined) return;
    const startX = e.clientX;
    const startWidth = width;
    const handleMouseMove = (moveEvent) => {
      onResize(Math.max(40, startWidth + moveEvent.clientX - startX));
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (thRef.current) thRef.current.style.userSelect = '';
    };
    if (thRef.current) thRef.current.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onResize]);

  return (
    <th ref={thRef} {...restProps} style={{ ...restProps.style, position: 'relative', borderRight: '2px solid #b7d8b7' }}>
      {restProps.children}
      {width !== undefined && onResize && (
        <div
          onMouseDown={handleMouseDown}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1, background: 'transparent' }}
          title="드래그하여 열 너비 조정"
        >
          <div style={{
            position: 'absolute', right: 2, top: '20%', bottom: '20%',
            width: 2, borderRadius: 1, background: '#c0d8c0',
            opacity: 0, transition: 'opacity 0.15s',
          }} className="resize-indicator" />
        </div>
      )}
    </th>
  );
}

// ─── 인라인 편집 셀 ───────────────────────────────────
function EditCell({ value, onChange, type = 'text', style = {}, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  const save = () => {
    setEditing(false);
    if (val !== value) onChange(val);
  };

  if (!editing) {
    if (type === 'date') {
      return (
        <div
          style={{ cursor: readOnly ? 'default' : 'pointer', minHeight: 22, ...style }}
          onClick={() => { if (!readOnly) { setVal(value); setEditing(true); } }}
        >
          {value ? dayjs(value).format('MM/DD') : <span style={{ color: '#ccc', fontSize: 12 }}>-</span>}
        </div>
      );
    }
    if (type === 'progress') {
      const num = Number(value) || 0;
      return (
        <div
          style={{ cursor: readOnly ? 'default' : 'pointer', ...style }}
          onClick={() => { if (!readOnly) { setVal(num); setEditing(true); } }}
        >
          <span style={{ fontSize: 11, minWidth: 28, display: 'block', textAlign: 'right' }}>{num}%</span>
        </div>
      );
    }
    return (
      <div
        style={{ cursor: readOnly ? 'default' : 'pointer', minHeight: 22, ...style }}
        onClick={() => { if (!readOnly) { setVal(value); setEditing(true); } }}
      >
        {value || <span style={{ color: '#ccc', fontSize: 12 }}>-</span>}
      </div>
    );
  }

  if (type === 'date') {
    return (
      <DatePicker
        size="small" autoFocus
        defaultValue={value ? dayjs(value) : null}
        onChange={(d) => setVal(d ? d.format('YYYY-MM-DD') : null)}
        onBlur={save}
        style={{ width: '100%' }}
      />
    );
  }
  if (type === 'progress') {
    return (
      <InputNumber
        size="small" autoFocus min={0} max={100}
        defaultValue={val}
        onChange={(v) => setVal(v ?? 0)}
        onBlur={save} onPressEnter={save}
        addonAfter="%" style={{ width: '100%' }}
      />
    );
  }
  return (
    <Input
      size="small" autoFocus
      defaultValue={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save} onPressEnter={save}
    />
  );
}

// ─── 이중 진척률 바 (계획 회색 + 실적 컬러 오버레이) ───
function DualProgressBar({ planned, actual }) {
  const p = Number(planned) || 0;
  const a = Number(actual) || 0;
  const barColor = a >= p ? '#52c41a' : a >= p * 0.8 ? '#faad14' : '#ff7875';
  return (
    <div style={{ position: 'relative', height: 14, borderRadius: 7, background: '#f0f0f0', overflow: 'hidden' }}>
      {/* 계획 바 (연한 회색 테두리 효과) */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${p}%`, background: '#d0e8ff', borderRadius: 7,
      }} />
      {/* 실적 바 */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${a}%`, background: barColor, borderRadius: 7,
        transition: 'width 0.3s ease',
      }} />
      {/* 계획 표시선 */}
      {p > 0 && p < 100 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${p}%`, width: 2, background: '#1890ff', opacity: 0.7,
          transform: 'translateX(-1px)',
        }} />
      )}
    </div>
  );
}

// ─── 메모 셀 ──────────────────────────────────────────
function MemoCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVal, setModalVal] = useState(value || '');

  const save = () => {
    setEditing(false);
    if (val !== (value || '')) onChange(val || null);
  };
  const saveModal = () => {
    setModalOpen(false);
    onChange(modalVal || null);
  };

  if (editing) {
    return (
      <Input.TextArea
        autoFocus autoSize={{ minRows: 1, maxRows: 4 }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); save(); } }}
        style={{ fontSize: 12, background: '#fffde7', border: '1.5px solid #ffe082', borderRadius: 4 }}
      />
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, minHeight: 26,
      background: value ? '#fffdf0' : '#fafafa',
      border: `1px dashed ${value ? '#ffe082' : '#d9d9d9'}`,
      borderRadius: 4, padding: '2px 6px', cursor: 'pointer', transition: 'background 0.15s',
    }}>
      {value ? (
        <>
          <Tooltip title={value} placement="topLeft">
            <span
              style={{ flex: 1, fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { setVal(value); setEditing(true); }}
            >
              <FileTextOutlined style={{ color: '#faad14', marginRight: 4 }} />
              {value}
            </span>
          </Tooltip>
          <Tooltip title="확장 편집">
            <Button
              type="text" size="small" icon={<ExpandAltOutlined />}
              style={{ flexShrink: 0, color: '#aaa', padding: '0 2px' }}
              onClick={() => { setModalVal(value || ''); setModalOpen(true); }}
            />
          </Tooltip>
        </>
      ) : (
        <span
          style={{ color: '#bbb', fontSize: 12, flex: 1, fontStyle: 'italic' }}
          onClick={() => { setVal(''); setEditing(true); }}
        >
          클릭하여 메모 입력...
        </span>
      )}
      <Modal title="메모 편집" open={modalOpen} onOk={saveModal} onCancel={() => setModalOpen(false)} okText="저장" cancelText="취소" width={480}>
        <Input.TextArea
          autoFocus rows={6} value={modalVal}
          onChange={(e) => setModalVal(e.target.value)}
          placeholder="메모를 입력하세요..."
          style={{ background: '#fffde7', border: '1.5px solid #ffe082' }}
        />
      </Modal>
    </div>
  );
}

// ─── 산출물 셀 (텍스트 + 파일 첨부) ──────────────────
function DeliverableCell({ taskId, value, fileOrigName, onChange, onRefresh }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const result = await wbsApi.uploadDeliverable(taskId, file);
      if (!value && result.deliverableOrigName) {
        // 산출물명이 비어있으면 파일명으로 자동 채우기
        onChange(file.name.replace(/\.[^.]+$/, ''));
      }
      onRefresh();
      message.success(`파일 첨부 완료: ${result.deliverableOrigName}`);
    } catch {
      message.error('파일 업로드 실패');
    } finally {
      setUploading(false);
    }
    return false; // ant-design Upload 자동 업로드 방지
  };

  const handleDownload = async () => {
    try {
      await wbsApi.downloadDeliverable(taskId, fileOrigName);
    } catch {
      message.error('파일 다운로드 실패');
    }
  };

  const handleDeleteFile = async () => {
    setDeleting(true);
    try {
      await wbsApi.deleteDeliverable(taskId);
      await wbsApi.updateTask(taskId, { deliverable: null });
      onRefresh();
      message.success('첨부 파일이 삭제되었습니다.');
    } catch {
      message.error('파일 삭제 실패');
    } finally {
      setDeleting(false);
    }
  };

  const hasFile = Boolean(fileOrigName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 산출물명 텍스트 편집 */}
      <EditCell value={value} onChange={onChange} />

      {/* 파일 첨부 영역 */}
      {hasFile ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: '#e6f4ff', border: '1px solid #91caff',
          borderRadius: 4, padding: '2px 6px', fontSize: 11,
        }}>
          <PaperClipOutlined style={{ color: '#1890ff', flexShrink: 0 }} />
          <Tooltip title={fileOrigName} placement="topLeft">
            <span style={{
              flex: 1, color: '#1890ff', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
              maxWidth: 80,
            }} onClick={handleDownload}>
              {fileOrigName}
            </span>
          </Tooltip>
          <Tooltip title="다운로드">
            <Button type="text" size="small" icon={<DownloadOutlined />}
              style={{ color: '#1890ff', padding: '0 2px', height: 18, lineHeight: '18px' }}
              onClick={handleDownload}
            />
          </Tooltip>
          <Popconfirm title="첨부 파일을 삭제하시겠습니까?" onConfirm={handleDeleteFile} okText="삭제" cancelText="취소">
            <Button type="text" size="small" icon={<CloseOutlined />}
              loading={deleting}
              style={{ color: '#ff4d4f', padding: '0 2px', height: 18, lineHeight: '18px' }}
            />
          </Popconfirm>
        </div>
      ) : (
        <Upload showUploadList={false} beforeUpload={handleUpload} accept="*">
          <Button
            type="text" size="small" icon={<PaperClipOutlined />}
            loading={uploading}
            style={{ color: '#aaa', fontSize: 11, padding: '0 4px', height: 18, lineHeight: '18px' }}
          >
            파일 첨부
          </Button>
        </Upload>
      )}
    </div>
  );
}

// ─── 헬퍼 함수들 ─────────────────────────────────────
function calcDuration(startDate, endDate) {
  if (!startDate || !endDate) return '-';
  const diff = dayjs(endDate).diff(dayjs(startDate), 'day') + 1;
  return diff > 0 ? `${diff}일` : '-';
}

function calcCompliance(planned, actual) {
  const p = parseFloat(planned);
  const a = parseFloat(actual);
  if (!isFinite(p) || p === 0) return null;
  if (!isFinite(a)) return null;
  return Math.min(parseFloat(((a / p) * 100).toFixed(1)), 100);
}

function calcDelay(endDate, actualProgress, refDate) {
  if (!endDate) return null;
  const actual = parseFloat(actualProgress) || 0;
  if (actual >= 100) return null;
  const base = refDate ? dayjs(refDate) : dayjs();
  const diff = base.startOf('day').diff(dayjs(endDate).startOf('day'), 'day');
  return diff > 0 ? diff : null;
}

function assignNumbers(nodes, prefix = '') {
  return nodes.map((node, i) => {
    const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    return {
      ...node,
      _num: num,
      children: node.children?.length ? assignNumbers(node.children, num) : undefined,
    };
  });
}

// ─── 검색어로 트리 필터링 (자식 포함 유지) ────────────
function filterTree(nodes, keyword) {
  if (!keyword) return nodes;
  const kw = keyword.toLowerCase();
  return nodes.reduce((acc, node) => {
    const filteredChildren = filterTree(node.children || [], keyword);
    const match = (node.name || '').toLowerCase().includes(kw)
      || (node.deliverable || '').toLowerCase().includes(kw)
      || (node.memo || '').toLowerCase().includes(kw);
    if (match || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
    }
    return acc;
  }, []);
}

const LEVEL_CONFIG = [
  { rowBg: '#dff0df', borderColor: '#2e7d32', borderWidth: 4, dotColor: '#1b5e20', textColor: '#1b5e20', fontWeight: 800, fontSize: 14, label: '대', labelBg: '#2e7d32' },
  { rowBg: '#edf7ed', borderColor: '#43a047', borderWidth: 3, dotColor: '#2e7d32', textColor: '#2e7d32', fontWeight: 700, fontSize: 13, label: '중', labelBg: '#43a047' },
  { rowBg: '#f3faf3', borderColor: '#81c784', borderWidth: 2, dotColor: '#388e3c', textColor: '#2d5a31', fontWeight: 600, fontSize: 13, label: '소', labelBg: '#66bb6a' },
  { rowBg: '#f9fdf9', borderColor: '#c8e6c9', borderWidth: 2, dotColor: '#66bb6a', textColor: '#37474f', fontWeight: 500, fontSize: 12, label: null, labelBg: '#a5d6a7' },
  { rowBg: '#ffffff', borderColor: '#e8f5e9', borderWidth: 1, dotColor: '#a5d6a7', textColor: '#546e7a', fontWeight: 400, fontSize: 12, label: null, labelBg: '#c8e6c9' },
];

const DEFAULT_COL_WIDTHS = {
  _num: 72, name: 200, deliverable: 160, duration: 60,
  startDate: 90, endDate: 90,
  plannedProgress: 140, actualProgress: 140,
  compliance: 80, delay: 70, memo: 210, action: 88,
};

const ISSUE_STATUS_OPTIONS = [
  { value: 'open', label: '오픈', color: 'red' },
  { value: 'in_progress', label: '진행중', color: 'blue' },
  { value: 'hold', label: '보류', color: 'orange' },
  { value: 'closed', label: '완료', color: 'green' },
];

export default function WbsSheet({ projectId, tasks, issues = [], onRefresh, refDate }) {
  const [loading, setLoading] = useState(false);
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const [searchText, setSearchText] = useState('');

  // 이슈 드로어 상태
  const [issueDrawer, setIssueDrawer] = useState({ open: false, taskName: '', taskNum: '' });
  const [newIssue, setNewIssue] = useState({ content: '', status: 'open', occurDate: null, targetDate: null });
  const [issueLoading, setIssueLoading] = useState(false);

  const filteredTasks = useMemo(() => filterTree(tasks || [], searchText), [tasks, searchText]);
  const numbered = useMemo(() => assignNumbers(filteredTasks), [filteredTasks]);

  // 작업명 → 이슈 목록 맵 (closed 제외한 활성 이슈)
  const issuesByTask = useMemo(() => {
    const map = {};
    issues.forEach((issue) => {
      const key = issue.category;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(issue);
    });
    return map;
  }, [issues]);

  const drawerIssues = useMemo(
    () => (issuesByTask[issueDrawer.taskName] || []).slice().sort((a, b) => {
      const order = { open: 0, in_progress: 1, hold: 2, closed: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    }),
    [issuesByTask, issueDrawer.taskName]
  );

  const openIssueDrawer = (taskName, taskNum = '') => {
    setIssueDrawer({ open: true, taskName, taskNum });
    setNewIssue({ content: '', status: 'open', occurDate: null, targetDate: null });
  };

  const handleCreateIssue = async () => {
    if (!newIssue.content.trim()) { message.warning('이슈 내용을 입력하세요.'); return; }
    setIssueLoading(true);
    try {
      await wbsApi.createIssue(projectId, {
        category: issueDrawer.taskName,
        content: newIssue.content,
        status: newIssue.status,
        occurDate: newIssue.occurDate || null,
        targetDate: newIssue.targetDate || null,
        progress: 0,
      });
      setNewIssue({ content: '', status: 'open', occurDate: null, targetDate: null });
      onRefresh();
    } catch {
      message.error('이슈 등록 실패');
    } finally {
      setIssueLoading(false);
    }
  };

  const handleIssueStatusChange = async (issueId, status) => {
    try {
      await wbsApi.updateIssue(issueId, { status });
      onRefresh();
    } catch {
      message.error('상태 변경 실패');
    }
  };

  const handleIssueDelete = async (issueId) => {
    try {
      await wbsApi.deleteIssue(issueId);
      onRefresh();
    } catch {
      message.error('삭제 실패');
    }
  };

  const handleResize = useCallback((key) => (newWidth) => {
    setColWidths((prev) => ({ ...prev, [key]: newWidth }));
  }, []);

  const handleUpdate = async (taskId, field, value) => {
    try {
      await wbsApi.updateTask(taskId, { [field]: value });
      onRefresh();
    } catch {
      message.error('수정 실패');
    }
  };

  const handleAddRoot = async () => {
    setLoading(true);
    try {
      await wbsApi.createTask(projectId, { name: '새 작업', parentId: null });
      onRefresh();
    } catch {
      message.error('항목 추가 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleAddChild = async (parentId) => {
    try {
      await wbsApi.createTask(projectId, { name: '하위 작업', parentId });
      onRefresh();
    } catch {
      message.error('항목 추가 실패');
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await wbsApi.deleteTask(taskId);
      onRefresh();
    } catch {
      message.error('삭제 실패');
    }
  };

  const withResize = (key, col) => ({
    ...col,
    width: colWidths[key],
    onHeaderCell: () => ({ width: colWidths[key], onResize: handleResize(key) }),
  });

  const columns = [
    withResize('_num', {
      title: 'No',
      dataIndex: '_num',
      key: '_num',
      align: 'center',
      render: (v, record) => {
        const cfg = LEVEL_CONFIG[Math.min(record.level, LEVEL_CONFIG.length - 1)];
        return (
          <span style={{
            display: 'inline-block', textAlign: 'center',
            background: cfg.labelBg, color: '#fff',
            fontSize: record.level === 0 ? 12 : 11,
            fontWeight: record.level === 0 ? 800 : 600,
            borderRadius: 10, padding: '1px 7px', lineHeight: '18px',
            letterSpacing: 0.2, whiteSpace: 'nowrap',
          }}>
            {v}
          </span>
        );
      },
    }),
    withResize('name', {
      title: '작업명',
      dataIndex: 'name',
      key: 'name',
      render: (val, record) => {
        const cfg = LEVEL_CONFIG[Math.min(record.level, LEVEL_CONFIG.length - 1)];
        const taskIssues = issuesByTask[val] || [];
        const activeIssues = taskIssues.filter((i) => i.status !== 'closed');
        const hasIssue = activeIssues.length > 0;

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: record.level * 20 }}>
            {cfg.label ? (
              <span style={{ flexShrink: 0, background: cfg.labelBg, color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1, padding: '2px 4px', borderRadius: 3, letterSpacing: 0.5 }}>
                {cfg.label}
              </span>
            ) : (
              <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: cfg.dotColor, display: 'inline-block' }} />
            )}
            <EditCell
              value={val}
              onChange={(v) => handleUpdate(record.id, 'name', v)}
              style={{ color: cfg.textColor, fontWeight: cfg.fontWeight, fontSize: cfg.fontSize }}
            />
            {hasIssue && (
              <Tooltip title={`클릭하여 이슈 ${activeIssues.length}건 보기`} placement="right">
                <span
                  onClick={() => openIssueDrawer(val, record._num)}
                  style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2,
                    background: '#ff4d4f', color: '#fff',
                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                    padding: '2px 5px', borderRadius: 8,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  <ExclamationCircleOutlined style={{ fontSize: 9 }} />
                  이슈 {activeIssues.length}
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    }),
    withResize('deliverable', {
      title: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <FolderOpenOutlined style={{ color: '#1890ff' }} />산출물
        </span>
      ),
      dataIndex: 'deliverable',
      key: 'deliverable',
      render: (val, record) => (
        <DeliverableCell
          taskId={record.id}
          value={val}
          fileOrigName={record.deliverableOrigName}
          onChange={(v) => handleUpdate(record.id, 'deliverable', v)}
          onRefresh={onRefresh}
        />
      ),
    }),
    withResize('duration', {
      title: '기간',
      key: 'duration',
      render: (_, record) => (
        <span style={{ color: '#666', fontSize: 12 }}>{calcDuration(record.startDate, record.endDate)}</span>
      ),
    }),
    withResize('startDate', {
      title: '시작일',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (val, record) => (
        <EditCell value={val} type="date" onChange={(v) => handleUpdate(record.id, 'startDate', v)} />
      ),
    }),
    withResize('endDate', {
      title: '종료일',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (val, record) => (
        <EditCell value={val} type="date" onChange={(v) => handleUpdate(record.id, 'endDate', v)} />
      ),
    }),
    withResize('plannedProgress', {
      title: (
        <div>
          <div>계획진척률</div>
          <div style={{ fontSize: 9, color: '#1890ff', fontWeight: 400 }}>━ 파란선</div>
        </div>
      ),
      dataIndex: 'plannedProgress',
      key: 'plannedProgress',
      render: (val, record) => (
        <div>
          <DualProgressBar planned={Number(val) || 0} actual={Number(record.actualProgress) || 0} />
          <EditCell
            value={Number(val) || 0}
            type="progress"
            onChange={(v) => handleUpdate(record.id, 'plannedProgress', v)}
            style={{ marginTop: 2 }}
          />
        </div>
      ),
    }),
    withResize('actualProgress', {
      title: (
        <div>
          <div>실적진척률</div>
          <div style={{ fontSize: 9, color: '#52c41a', fontWeight: 400 }}>▓ 컬러바</div>
        </div>
      ),
      dataIndex: 'actualProgress',
      key: 'actualProgress',
      render: (val, record) => (
        <EditCell
          value={Number(val) || 0}
          type="progress"
          onChange={(v) => handleUpdate(record.id, 'actualProgress', v)}
        />
      ),
    }),
    withResize('compliance', {
      title: '공정준수율',
      key: 'compliance',
      render: (_, record) => {
        const rate = calcCompliance(record.plannedProgress, record.actualProgress);
        if (rate === null) return <span style={{ color: '#ccc' }}>-</span>;
        const color = rate >= 100 ? '#52c41a' : rate >= 80 ? '#faad14' : '#ff4d4f';
        return (
          <Tooltip title={`계획 ${Number(record.plannedProgress) || 0}% / 실적 ${Number(record.actualProgress) || 0}%`}>
            <span style={{ color, fontWeight: 600 }}>{rate}%</span>
          </Tooltip>
        );
      },
    }),
    withResize('delay', {
      title: '지연',
      key: 'delay',
      align: 'center',
      render: (_, record) => {
        const days = calcDelay(record.endDate, record.actualProgress, refDate);
        if (days === null) return null;
        return (
          <Tooltip title={`${dayjs(record.endDate).format('MM/DD')} 종료 → ${days}일 초과`}>
            <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 12, cursor: 'help' }}>
              D+{days}일
            </span>
          </Tooltip>
        );
      },
    }),
    withResize('memo', {
      title: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileTextOutlined style={{ color: '#faad14' }} />메모
        </span>
      ),
      dataIndex: 'memo',
      key: 'memo',
      onHeaderCell: () => ({
        width: colWidths['memo'],
        onResize: handleResize('memo'),
        style: { background: '#fffbea', borderLeft: '2px solid #ffe082' },
      }),
      onCell: () => ({ style: { background: '#fffdf5', borderLeft: '1px solid #ffe08280' } }),
      render: (val, record) => (
        <MemoCell value={val} onChange={(v) => handleUpdate(record.id, 'memo', v)} />
      ),
    }),
    withResize('action', {
      title: '',
      key: 'action',
      render: (_, record) => {
        const taskIssueCount = (issuesByTask[record.name] || []).filter((i) => i.status !== 'closed').length;
        return (
          <Space size={2}>
            <Tooltip title="이슈 등록/조회">
              <Badge count={taskIssueCount} size="small" offset={[-2, 2]}>
                <Button
                  type="text" icon={<BugOutlined />} size="small"
                  onClick={() => openIssueDrawer(record.name, record._num)}
                  style={{ color: taskIssueCount > 0 ? '#ff4d4f' : '#bbb' }}
                />
              </Badge>
            </Tooltip>
            <Tooltip title="하위 항목 추가">
              <Button
                type="text" icon={<PlusCircleOutlined />} size="small"
                onClick={() => handleAddChild(record.id)}
                style={{ color: '#52c41a' }}
              />
            </Tooltip>
            <Popconfirm title="이 항목과 하위 항목이 모두 삭제됩니다." onConfirm={() => handleDelete(record.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </Popconfirm>
          </Space>
        );
      },
    }),
  ];

  const finalColumns = columns.map((col) =>
    col.key === 'memo'
      ? { ...col, onHeaderCell: () => ({ width: colWidths['memo'], onResize: handleResize('memo'), style: { background: '#fffbea', borderLeft: '2px solid #ffe082' } }) }
      : col
  );

  const totalWidth = Object.values(colWidths).reduce((s, w) => s + w, 0);

  return (
    <div>
      {/* 검색 바 */}
      <div style={{ marginBottom: 8 }}>
        <Input
          placeholder="작업명 / 산출물명 / 메모 검색..."
          prefix={<SearchOutlined style={{ color: '#aaa' }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ width: 320 }}
          size="small"
        />
        {searchText && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
            검색 결과: {filteredTasks.length}개 최상위 항목
          </span>
        )}
      </div>

      <style>{`
        .wbs-table .ant-table-thead > tr > th {
          background: #f0f7f0; border-bottom: 2px solid #a5d6a7 !important;
          font-weight: 700; font-size: 12px; color: #2e7d32; white-space: nowrap;
        }
        .wbs-table .ant-table-tbody > tr > td {
          border-right: 1px solid #d4e8d4 !important;
          border-bottom: 1px solid #e8f5e9 !important;
          padding: 4px 8px;
        }
        .wbs-table .ant-table-thead > tr > th:hover .resize-indicator { opacity: 1 !important; }
        .wbs-table .ant-table-thead > tr > th { cursor: default; }
      `}</style>
      <Table
        className="wbs-table"
        dataSource={numbered}
        columns={finalColumns}
        rowKey="id"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: totalWidth }}
        expandable={{ defaultExpandAllRows: true }}
        components={{ header: { cell: ResizableHeaderCell } }}
        onRow={(record) => {
          const cfg = LEVEL_CONFIG[Math.min(record.level, LEVEL_CONFIG.length - 1)];
          return { style: { background: cfg.rowBg, borderLeft: `${cfg.borderWidth}px solid ${cfg.borderColor}` } };
        }}
      />
      <Button icon={<PlusOutlined />} onClick={handleAddRoot} loading={loading} style={{ marginTop: 8 }}>
        최상위 항목 추가
      </Button>

      {/* 이슈 드로어 */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BugOutlined style={{ color: '#ff4d4f' }} />
            {issueDrawer.taskNum && (
              <span style={{ fontSize: 12, color: '#1890ff', fontWeight: 700, background: '#e6f4ff', padding: '1px 6px', borderRadius: 4 }}>
                {issueDrawer.taskNum}
              </span>
            )}
            <span style={{ fontWeight: 700 }}>{issueDrawer.taskName}</span>
            <span style={{ fontSize: 13, color: '#888', fontWeight: 400 }}>이슈사항</span>
          </div>
        }
        placement="right"
        width={480}
        open={issueDrawer.open}
        onClose={() => setIssueDrawer({ open: false, taskName: '' })}
        styles={{ body: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 0 } }}
      >
        {/* 이슈 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {drawerIssues.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bbb', padding: '32px 0', fontSize: 13 }}>
              <BugOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
              등록된 이슈가 없습니다
            </div>
          ) : (
            drawerIssues.map((iss) => {
              const statusOpt = ISSUE_STATUS_OPTIONS.find((o) => o.value === iss.status);
              return (
                <div key={iss.id} style={{
                  border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px',
                  marginBottom: 8, background: iss.status === 'closed' ? '#fafafa' : '#fff',
                  opacity: iss.status === 'closed' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Select
                      size="small"
                      value={iss.status}
                      onChange={(v) => handleIssueStatusChange(iss.id, v)}
                      style={{ width: 82, flexShrink: 0 }}
                      options={ISSUE_STATUS_OPTIONS.map((o) => ({ value: o.value, label: <Tag color={o.color} style={{ margin: 0 }}>{o.label}</Tag> }))}
                    />
                    <div style={{ flex: 1, fontSize: 13, lineHeight: '20px', wordBreak: 'break-all' }}>{iss.content}</div>
                    <Popconfirm title="이슈를 삭제하시겠습니까?" onConfirm={() => handleIssueDelete(iss.id)} okText="삭제" cancelText="취소">
                      <Button type="text" icon={<CloseOutlined />} size="small" style={{ color: '#ccc', flexShrink: 0 }} />
                    </Popconfirm>
                  </div>
                  {(iss.occurDate || iss.targetDate) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#aaa', display: 'flex', gap: 12 }}>
                      {iss.occurDate && <span>발생일: {dayjs(iss.occurDate).format('MM/DD')}</span>}
                      {iss.targetDate && (
                        <span style={{ color: dayjs().isAfter(dayjs(iss.targetDate), 'day') && iss.status !== 'closed' ? '#ff4d4f' : '#aaa' }}>
                          목표: {dayjs(iss.targetDate).format('MM/DD')}
                          {dayjs().isAfter(dayjs(iss.targetDate), 'day') && iss.status !== 'closed' && ' ⚠ 지연'}
                        </span>
                      )}
                      {iss.progress > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          진척: <Progress percent={iss.progress} size="small" style={{ width: 60, margin: 0 }} showInfo={false} />
                          {iss.progress}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <Divider style={{ margin: '0 0 12px' }} />

        {/* 이슈 등록 폼 */}
        <div style={{ background: '#f9fffe', border: '1px dashed #b7eb8f', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#52c41a', marginBottom: 8 }}>
            <PlusOutlined /> 새 이슈 등록
          </div>
          <Input.TextArea
            placeholder="이슈 내용을 입력하세요..."
            rows={3}
            value={newIssue.content}
            onChange={(e) => setNewIssue((p) => ({ ...p, content: e.target.value }))}
            style={{ marginBottom: 8, resize: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <Select
              size="small"
              value={newIssue.status}
              onChange={(v) => setNewIssue((p) => ({ ...p, status: v }))}
              style={{ width: 90 }}
              options={ISSUE_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <DatePicker
              size="small" placeholder="발생일"
              value={newIssue.occurDate ? dayjs(newIssue.occurDate) : null}
              onChange={(d) => setNewIssue((p) => ({ ...p, occurDate: d ? d.format('YYYY-MM-DD') : null }))}
              style={{ width: 110 }}
            />
            <DatePicker
              size="small" placeholder="목표해결일"
              value={newIssue.targetDate ? dayjs(newIssue.targetDate) : null}
              onChange={(d) => setNewIssue((p) => ({ ...p, targetDate: d ? d.format('YYYY-MM-DD') : null }))}
              style={{ width: 110 }}
            />
          </div>
          <Button
            type="primary" size="small" block
            icon={<PlusOutlined />}
            loading={issueLoading}
            onClick={handleCreateIssue}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            이슈 등록
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
