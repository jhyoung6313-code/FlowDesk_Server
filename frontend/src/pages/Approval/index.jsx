import { useEffect, useState, useCallback } from 'react';
import {
  Tabs, Button, Space, Typography, Tag, Select, message, Popconfirm,
  theme as antTheme, Badge, Tooltip, Avatar, Pagination, Empty, Spin, Drawer, Grid, Input, Modal, Tree,
} from 'antd';
import { PlusOutlined, DeleteOutlined, CloseCircleOutlined, FileDoneOutlined, ClockCircleOutlined, CopyOutlined, FireOutlined, CheckOutlined, FolderOutlined, FileTextOutlined, AppstoreOutlined } from '@ant-design/icons';
import { getApprovals, getApprovalTree, deleteApproval, cancelApproval, approveApproval, rejectApproval } from '../../api/approval';
import DocumentForm from './DocumentForm';
import DocumentDetail from './DocumentDetail';
import SpellTextArea from '../../components/common/SpellTextArea';
import { avatarColor } from '../../utils/listkit';
import useAuthStore from '../../store/authStore';
import dayjs from 'dayjs';

const { Text } = Typography;
const { useToken } = antTheme;

const STATUS_CONFIG = {
  draft:     { color: 'default',    label: '임시저장', bg: '' },
  pending:   { color: 'processing', label: '결재중',   bg: '#1677ff' },
  approved:  { color: 'success',    label: '승인완료', bg: '#52c41a' },
  rejected:  { color: 'error',      label: '반려',     bg: '#ff4d4f' },
  cancelled: { color: 'default',    label: '취소',     bg: '#8c8c8c' },
};

const TAB_ITEMS = [
  { key: 'mine',      label: '내 결재 요청' },
  { key: 'pending',   label: '내가 결재할 문서' },
  { key: 'reference', label: '참조 문서' },
];

function getInitial(name) { return name ? name[0].toUpperCase() : 'U'; }

export default function ApprovalPage() {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const { token } = useToken();

  const [tab, setTab] = useState('mine');
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [formState, setFormState] = useState({ open: false, docId: null, copyFromId: null });
  const [detailId, setDetailId] = useState(null);
  const screens = Grid.useBreakpoint();
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [formTypeId, setFormTypeId] = useState(undefined);
  const [templateId, setTemplateId] = useState(undefined);
  // ── 결재종류 트리 ──
  const [tree, setTree] = useState([]);
  const [treeKey, setTreeKey] = useState('all');       // 선택 노드 키
  const [treeExpanded, setTreeExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem('approval_tree_expanded') || '[]'); } catch { return []; }
  });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState(null); // { id } | null
  const [rejectReason, setRejectReason] = useState('');

  // 내 차례(승인 대기) 여부
  const isMyPendingTurn = (d) => d.status === 'pending'
    && (d.steps || []).some(s => s.stepOrder === d.currentStep && s.approverId === user?.id && s.status === 'pending' && s.type !== 'reference');

  const tabs = isAdmin ? [...TAB_ITEMS, { key: 'all', label: '전체' }] : TAB_ITEMS;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getApprovals({ tab, status: statusFilter, page, limit: 20, q: q || undefined, formTypeId, templateId });
      setDocuments(data.documents || []);
      setTotal(data.total || 0);
    } catch { message.error('목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, [tab, statusFilter, page, q, formTypeId, templateId]);

  useEffect(() => { load(); }, [load]);

  // 트리(결재종류→양식 + 건수)는 탭·상태·검색 변경 시 갱신 (선택/페이지와 무관)
  useEffect(() => {
    getApprovalTree({ tab, status: statusFilter, q: q || undefined })
      .then(d => setTree(d.tree || [])).catch(() => {});
  }, [tab, statusFilter, q]);

  // 트리 노드 선택 → 목록 필터 (formType/template)
  const onTreeSelect = (keys) => {
    const key = keys[0] || 'all';
    setTreeKey(key);
    setPage(1);
    if (key === 'all') { setFormTypeId(undefined); setTemplateId(undefined); }
    else if (key.startsWith('ft-')) { setFormTypeId(Number(key.slice(3))); setTemplateId(undefined); }
    else if (key.startsWith('tpl-')) { setTemplateId(Number(key.slice(4))); setFormTypeId(undefined); }
  };
  const onTreeExpand = (keys) => {
    setTreeExpanded(keys);
    localStorage.setItem('approval_tree_expanded', JSON.stringify(keys));
  };

  // API 트리 → AntD Tree treeData (건수 배지 포함)
  const buildTreeData = useCallback((nodes) => nodes.map((ft) => ({
    key: `ft-${ft.id}`,
    icon: <FolderOutlined style={{ color: ft.color || token.colorPrimary }} />,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {ft.icon ? <span>{ft.icon}</span> : null}
        <span>{ft.name}</span>
        <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{ft.count}</span>
      </span>
    ),
    children: [
      ...buildTreeData(ft.children || []),
      ...(ft.templates || []).map((tp) => ({
        key: `tpl-${tp.id}`,
        icon: <FileTextOutlined style={{ color: token.colorTextTertiary }} />,
        isLeaf: true,
        title: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{tp.name}</span>
            <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{tp.count}</span>
          </span>
        ),
      })),
    ],
  })), [token]);

  const treeData = [
    { key: 'all', icon: <AppstoreOutlined style={{ color: token.colorPrimary }} />, isLeaf: true,
      title: <span style={{ fontWeight: 600 }}>전체</span> },
    ...buildTreeData(tree),
  ];

  const handleDelete = async (id) => {
    try { await deleteApproval(id); message.success('삭제되었습니다.'); load(); }
    catch (e) { message.error(e.response?.data?.error || '삭제 실패'); }
  };

  const handleCancel = async (id) => {
    try { await cancelApproval(id); message.success('취소되었습니다.'); load(); }
    catch (e) { message.error(e.response?.data?.error || '취소 실패'); }
  };

  // 인라인 승인 / 반려 / 일괄 승인 (결재자)
  const handleApproveOne = async (id) => {
    try { await approveApproval(id, ''); message.success('승인되었습니다.'); load(); }
    catch (e) { message.error(e.response?.data?.error || '승인 실패'); }
  };
  const doReject = async () => {
    if (!rejectReason.trim()) { message.warning('반려 사유를 입력하세요.'); return; }
    try {
      await rejectApproval(rejectModal.id, rejectReason);
      message.success('반려되었습니다.'); setRejectModal(null); setRejectReason(''); load();
    } catch (e) { message.error(e.response?.data?.error || '반려 실패'); }
  };
  const handleBulkApprove = async () => {
    const targets = documents.filter(isMyPendingTurn);
    if (targets.length === 0) return;
    setBulkLoading(true);
    let ok = 0;
    for (const d of targets) { try { await approveApproval(d.id, ''); ok++; } catch {} }
    setBulkLoading(false);
    message.success(`${ok}건 승인되었습니다.`);
    load();
  };
  const myTurnCount = documents.filter(isMyPendingTurn).length;

  const pendingCount = documents.filter(d => d.status === 'pending' && d.steps?.some(s => s.approverId === user?.id && s.stepOrder === d.currentStep)).length;

  // 진행 상태 요약 문구
  const progressText = (doc) => {
    if (doc.status === 'approved') return '승인 완료';
    if (doc.status === 'rejected') return doc.rejectedStep > 1 ? '반려 · 재상신 가능' : '반려됨';
    if (doc.status === 'cancelled') return '취소됨';
    if (doc.status === 'draft') return doc.totalSteps > 0 ? '임시저장' : '결재선 미지정';
    const cur = doc.steps?.find(s => s.stepOrder === doc.currentStep && s.type !== 'reference');
    const isMe = cur?.approverId === user?.id;
    return `${doc.currentStep - 1}/${doc.totalSteps} · ${isMe ? '내 차례' : (cur?.approver?.displayName || '') + ' 결재중'}`;
  };

  // 진행률(0~100) + 바 색상
  const progressPct = (doc) => {
    const total = doc.totalSteps || (doc.steps || []).filter(s => s.type !== 'reference').length || 1;
    if (doc.status === 'approved') return 100;
    if (doc.status === 'rejected') return Math.round(((doc.rejectedStep || 1) - 1) / total * 100);
    if (doc.status === 'cancelled' || doc.status === 'draft') return 0;
    return Math.round((doc.currentStep - 1) / total * 100);
  };
  const progressColor = (doc) => {
    if (doc.status === 'approved') return token.colorSuccess;
    if (doc.status === 'rejected') return token.colorError;
    return token.colorPrimary;
  };

  // 컬럼 그리드 (헤더/행 공유)
  const GRID_COLS = '92px 1fr 60px 188px 84px 72px 132px';

  const renderDoc = (doc) => {
    const cfg = STATUS_CONFIG[doc.status] || { color: 'default', label: doc.status };
    const isOwner = doc.createdBy === user?.id || isAdmin;
    const isMyTurn = doc.status === 'pending' && doc.steps?.some(s => s.stepOrder === doc.currentStep && s.approverId === user?.id && s.type !== 'reference');

    const pct = progressPct(doc);
    const over = doc.dueDate && doc.status === 'pending' && dayjs(doc.dueDate).endOf('day').isBefore(dayjs());

    return (
      <div
        key={doc.id}
        onClick={(e) => { if (e.target.closest('button')) return; setDetailId(doc.id); }}
        style={{
          display: 'grid', gridTemplateColumns: GRID_COLS, gap: 14, alignItems: 'center',
          padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, cursor: 'pointer',
          background: isMyTurn ? token.colorPrimaryBg : 'transparent',
          borderLeft: `3px solid ${isMyTurn ? token.colorPrimary : 'transparent'}`,
        }}
        onMouseEnter={e => { if (!isMyTurn) e.currentTarget.style.background = token.colorFillQuaternary; }}
        onMouseLeave={e => { if (!isMyTurn) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* 문서번호 */}
        <div style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 700,
          color: doc.docNo ? token.colorPrimary : token.colorTextTertiary,
          background: doc.docNo ? token.colorPrimaryBg : token.colorFillQuaternary,
          padding: '5px 6px', borderRadius: 7, textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-all',
        }}>
          {doc.docNo || '미채번'}
        </div>

        {/* 제목 + 양식 */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, minWidth: 0 }}>
            {doc.isUrgent && (
              <Tag color="error" style={{ margin: 0, fontSize: 10, lineHeight: '16px', flexShrink: 0, padding: '0 5px' }}>
                <FireOutlined /> 긴급
              </Tag>
            )}
            <span style={{ fontWeight: 700, fontSize: 13, color: token.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {doc.title}
            </span>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {doc.template?.formType?.name && `${doc.template.formType.name} / `}{doc.template?.name}
          </Text>
        </div>

        {/* 기안자 */}
        <div style={{ textAlign: 'center' }}>
          <Tooltip title={doc.creator?.displayName}>
            <Avatar size={26} style={{ background: avatarColor(doc.creator?.displayName), fontSize: 12 }}>
              {getInitial(doc.creator?.displayName)}
            </Avatar>
          </Tooltip>
        </div>

        {/* 결재 진행 (텍스트 + 바) */}
        <div>
          <Text style={{ fontSize: 12, display: 'block', marginBottom: 5, color: isMyTurn ? token.colorPrimary : token.colorTextSecondary, fontWeight: isMyTurn ? 600 : 400 }}>
            {progressText(doc)}
          </Text>
          <div style={{ height: 4, borderRadius: 999, background: token.colorFillQuaternary, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: progressColor(doc), borderRadius: 999, transition: 'width .3s' }} />
          </div>
        </div>

        {/* 상태 */}
        <div style={{ textAlign: 'center' }}>
          <Tag color={cfg.color} style={{ margin: 0, borderRadius: 999, fontWeight: 600 }}>{cfg.label}</Tag>
        </div>

        {/* 기한 */}
        <div style={{ textAlign: 'center' }}>
          {doc.dueDate ? (
            <Text style={{ fontSize: 12, color: over ? token.colorError : token.colorTextSecondary, fontWeight: over ? 600 : 400 }}>
              {dayjs(doc.dueDate).format('MM/DD')}{over ? ' !' : ''}
            </Text>
          ) : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>}
        </div>

        {/* 액션 */}
        <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          {tab === 'pending' && isMyTurn ? (
            <>
              <Button size="small" type="primary" onClick={() => handleApproveOne(doc.id)}>승인</Button>
              <Button size="small" danger ghost onClick={() => { setRejectModal({ id: doc.id }); setRejectReason(''); }}>반려</Button>
            </>
          ) : (
            <>
              <Tooltip title="이 문서로 복제">
                <Button size="small" type="text" icon={<CopyOutlined />}
                  onClick={() => setFormState({ open: true, docId: null, copyFromId: doc.id })} />
              </Tooltip>
              {isOwner && ['draft', 'pending'].includes(doc.status) && (
                <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(doc.id)} okText="취소" cancelText="아니요">
                  <Tooltip title="취소"><Button size="small" type="text" icon={<CloseCircleOutlined />} /></Tooltip>
                </Popconfirm>
              )}
              {isOwner && doc.status === 'draft' && (
                <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(doc.id)} okText="삭제" cancelText="취소">
                  <Tooltip title="삭제"><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
                </Popconfirm>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderHeader = () => (
    <div style={{
      display: 'grid', gridTemplateColumns: GRID_COLS, gap: 14, alignItems: 'center',
      padding: '9px 16px 9px 19px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      background: token.colorFillQuaternary,
      fontSize: 12, fontWeight: 600, color: token.colorTextTertiary, letterSpacing: 0.2,
    }}>
      <div>문서번호</div>
      <div>제목</div>
      <div style={{ textAlign: 'center' }}>기안자</div>
      <div>결재 진행</div>
      <div style={{ textAlign: 'center' }}>상태</div>
      <div style={{ textAlign: 'center' }}>기한</div>
      <div />
    </div>
  );

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space align="center" size={10}>
          <FileDoneOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
          <Typography.Title level={5} style={{ margin: 0 }}>전자결재</Typography.Title>
          {tab === 'pending' && pendingCount > 0 && (
            <Tag color="red" icon={<ClockCircleOutlined />}>{pendingCount}건 결재 대기</Tag>
          )}
        </Space>
        <Space size={6} align="center" wrap className="fd-toolbar">
          <Input.Search
            allowClear placeholder="제목·문서번호·기안자"
            style={{ width: 180 }} size="small"
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onSearch={v => { setQ((v || '').trim()); setPage(1); }}
          />
          <Select
            allowClear placeholder="상태 필터"
            style={{ width: 116 }} size="small"
            value={statusFilter}
            onChange={v => { setStatusFilter(v); setPage(1); }}
          >
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v.label}</Select.Option>
            ))}
          </Select>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, docId: null, copyFromId: null })}>
            결재 요청
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* ── 좌측: 결재 종류 트리 ── */}
      <div style={{
        width: 230, flexShrink: 0,
        background: token.colorBgContainer, borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`, padding: '10px 6px',
        maxHeight: 'calc(100vh - 180px)', overflow: 'auto',
      }}>
        <div style={{ fontSize: 'var(--fd-fs-caption, 12px)', fontWeight: 700, color: token.colorTextTertiary, padding: '2px 8px 8px', letterSpacing: 0.2 }}>결재 종류</div>
        <Tree
          blockNode
          showIcon
          treeData={treeData}
          selectedKeys={[treeKey]}
          expandedKeys={treeExpanded}
          onSelect={onTreeSelect}
          onExpand={onTreeExpand}
        />
      </div>

      {/* ── 우측: 탭 + 목록 ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <Tabs
        activeKey={tab}
        onChange={k => { setTab(k); setPage(1); }}
        items={tabs.map(t => ({
          ...t,
          label: t.key === 'pending'
            ? <Badge count={tab === 'pending' ? 0 : pendingCount} size="small" offset={[6, 0]}>{t.label}</Badge>
            : t.label,
        }))}
        size="small"
        style={{ marginBottom: 12 }}
      />

      {tab === 'pending' && myTurnCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', marginBottom: 10, borderRadius: token.borderRadius,
          background: token.colorPrimaryBg, border: `1px solid ${token.colorPrimaryBorder}`,
        }}>
          <Text style={{ fontSize: 13, color: token.colorPrimary, fontWeight: 600 }}>
            <ClockCircleOutlined style={{ marginRight: 6 }} />내 차례 결재 대기 {myTurnCount}건 (이 페이지)
          </Text>
          <Popconfirm title={`표시된 ${myTurnCount}건을 모두 승인하시겠습니까?`} onConfirm={handleBulkApprove} okText="일괄 승인" cancelText="취소">
            <Button type="primary" size="small" icon={<CheckOutlined />} loading={bulkLoading}>일괄 승인</Button>
          </Popconfirm>
        </div>
      )}

      <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG, border: `1px solid ${token.colorBorderSecondary}`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>
        ) : documents.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="문서가 없습니다." style={{ padding: '48px 0' }} />
        ) : (
          <>
            {renderHeader()}
            {documents.map(renderDoc)}
          </>
        )}
        {total > 20 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px' }}>
            <Pagination current={page} pageSize={20} total={total} onChange={setPage} showSizeChanger={false} size="small" />
          </div>
        )}
      </div>
      </div>{/* 우측 콘텐츠 끝 */}
      </div>{/* 2-pane 끝 */}

      {/* 결재 기안/수정 Drawer */}
      <Drawer
        title={formState.docId ? '결재 문서 수정' : (formState.copyFromId ? '결재 요청 (복제)' : '결재 요청')}
        placement="right"
        width={screens.md ? 720 : '100%'}
        open={formState.open}
        onClose={() => setFormState({ open: false, docId: null, copyFromId: null })}
        destroyOnClose
        styles={{ body: { padding: 20 } }}
      >
        {formState.open && (
          <DocumentForm
            embedded
            initialDocId={formState.docId}
            copyFromId={formState.copyFromId}
            onClose={() => setFormState({ open: false, docId: null, copyFromId: null })}
            onSaved={() => { setFormState({ open: false, docId: null, copyFromId: null }); load(); }}
          />
        )}
      </Drawer>

      {/* 결재 문서 상세 Drawer */}
      <Drawer
        title="결재 문서"
        placement="right"
        width={screens.lg ? 980 : '100%'}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        destroyOnClose
        styles={{ body: { padding: 20, background: token.colorBgLayout } }}
      >
        {detailId && (
          <DocumentDetail
            embedded
            docId={detailId}
            onClose={() => setDetailId(null)}
            onChanged={load}
            onEdit={(eid) => { setDetailId(null); setFormState({ open: true, docId: eid, copyFromId: null }); }}
            onCopy={(cid) => { setDetailId(null); setFormState({ open: true, docId: null, copyFromId: cid }); }}
            onNext={(nid) => setDetailId(nid)}
          />
        )}
      </Drawer>

      {/* 인라인 반려 사유 입력 */}
      <Modal
        title={<Space><CloseCircleOutlined style={{ color: token.colorError }} />반려</Space>}
        open={!!rejectModal}
        onOk={doReject}
        onCancel={() => { setRejectModal(null); setRejectReason(''); }}
        okText="반려" okButtonProps={{ danger: true }} cancelText="취소"
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>반려 사유를 입력하세요 (필수).</Text>
        </div>
        <SpellTextArea value={rejectReason} onChange={setRejectReason} rows={3} placeholder="반려 사유를 반드시 입력하세요." />
      </Modal>
    </div>
  );
}
