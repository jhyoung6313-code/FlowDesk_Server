import { useEffect, useState, useCallback } from 'react';
import {
  Tabs, Button, Space, Typography, Tag, Select, message, Popconfirm,
  theme as antTheme, Badge, Tooltip, Avatar, Pagination, Empty, Spin, Drawer, Grid, Input,
} from 'antd';
import { PlusOutlined, DeleteOutlined, CloseCircleOutlined, FileDoneOutlined, ClockCircleOutlined, CopyOutlined, FireOutlined } from '@ant-design/icons';
import { getApprovals, deleteApproval, cancelApproval, getApprovalFormTypes } from '../../api/approval';
import DocumentForm from './DocumentForm';
import DocumentDetail from './DocumentDetail';
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
  const [formTypes, setFormTypes] = useState([]);

  useEffect(() => { getApprovalFormTypes().then(setFormTypes).catch(() => {}); }, []);

  const tabs = isAdmin ? [...TAB_ITEMS, { key: 'all', label: '전체' }] : TAB_ITEMS;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getApprovals({ tab, status: statusFilter, page, limit: 20, q: q || undefined, formTypeId });
      setDocuments(data.documents || []);
      setTotal(data.total || 0);
    } catch { message.error('목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, [tab, statusFilter, page, q, formTypeId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try { await deleteApproval(id); message.success('삭제되었습니다.'); load(); }
    catch (e) { message.error(e.response?.data?.error || '삭제 실패'); }
  };

  const handleCancel = async (id) => {
    try { await cancelApproval(id); message.success('취소되었습니다.'); load(); }
    catch (e) { message.error(e.response?.data?.error || '취소 실패'); }
  };

  const pendingCount = documents.filter(d => d.status === 'pending' && d.steps?.some(s => s.approverId === user?.id && s.stepOrder === d.currentStep)).length;

  // 결재자 아바타 배경색 (상태별)
  const stepAvatarBg = (doc, s) => {
    if (s.status === 'approved') return token.colorSuccess;
    if (s.status === 'rejected') return token.colorError;
    if (doc.status === 'pending' && s.stepOrder === doc.currentStep) return token.colorPrimary;
    return token.colorTextQuaternary;
  };

  // 진행 상태 요약 문구
  const progressText = (doc) => {
    if (doc.status === 'approved') return '승인 완료';
    if (doc.status === 'rejected') return doc.rejectedStep > 1 ? '반려 · 재상신 가능' : '반려됨';
    if (doc.status === 'cancelled') return '취소됨';
    if (doc.status === 'draft') return doc.totalSteps > 0 ? '임시저장' : '결재선 미지정';
    const cur = doc.steps?.find(s => s.stepOrder === doc.currentStep && s.type !== 'reference');
    const isMe = cur?.approverId === user?.id;
    return `${doc.currentStep - 1} / ${doc.totalSteps} 단계 · ${isMe ? '내 차례' : (cur?.approver?.displayName || '') + ' 결재중'}`;
  };

  const renderDoc = (doc) => {
    const cfg = STATUS_CONFIG[doc.status] || { color: 'default', label: doc.status };
    const isOwner = doc.createdBy === user?.id || isAdmin;
    const isMyTurn = doc.status === 'pending' && doc.steps?.some(s => s.stepOrder === doc.currentStep && s.approverId === user?.id && s.type !== 'reference');
    const flow = (doc.steps || []).filter(s => s.type !== 'reference');
    const shown = flow.slice(0, 4);
    const rest = flow.length - shown.length;

    return (
      <div
        key={doc.id}
        onClick={(e) => { if (e.target.closest('button')) return; setDetailId(doc.id); }}
        style={{
          display: 'grid', gridTemplateColumns: '84px 1fr 190px 88px 96px', gap: 14, alignItems: 'center',
          padding: '13px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, cursor: 'pointer',
          background: isMyTurn ? token.colorPrimaryBg : 'transparent',
        }}
        onMouseEnter={e => { if (!isMyTurn) e.currentTarget.style.background = token.colorFillQuaternary; }}
        onMouseLeave={e => { if (!isMyTurn) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* 문서번호 */}
        <div style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, fontWeight: 700,
          color: doc.docNo ? token.colorPrimary : token.colorTextTertiary,
          background: doc.docNo ? token.colorPrimaryBg : token.colorFillQuaternary,
          padding: '5px 6px', borderRadius: 7, textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-all',
        }}>
          {doc.docNo || '미채번'}
        </div>

        {/* 제목 + 양식 */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, minWidth: 0 }}>
            {doc.isUrgent && <FireOutlined style={{ color: '#e0483d', flexShrink: 0 }} />}
            <span style={{ fontWeight: 700, fontSize: 14, color: token.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {doc.title}
            </span>
            {doc.dueDate && (() => {
              const over = doc.status === 'pending' && dayjs(doc.dueDate).endOf('day').isBefore(dayjs());
              return (
                <Tag color={over ? 'error' : 'orange'} style={{ margin: 0, fontSize: 10, lineHeight: '16px', flexShrink: 0 }}>
                  ~{dayjs(doc.dueDate).format('MM.DD')}{over ? ' 초과' : ''}
                </Tag>
              );
            })()}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {doc.template?.formType?.name && `${doc.template.formType.name} / `}{doc.template?.name}
            {' · '}{doc.creator?.displayName} · {dayjs(doc.createdAt).format('MM.DD')}
          </Text>
        </div>

        {/* 결재자 아바타 스택 + 진행 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {shown.map((s, i) => (
              <Tooltip key={s.id} title={`${s.approver?.displayName || ''} (${STATUS_CONFIG[s.status]?.label || s.status})`}>
                <Avatar size={24} style={{ background: stepAvatarBg(doc, s), fontSize: 10, marginLeft: i ? -6 : 0, border: `2px solid ${token.colorBgContainer}` }}>
                  {getInitial(s.approver?.displayName)}
                </Avatar>
              </Tooltip>
            ))}
            {rest > 0 && (
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: token.colorFillQuaternary, color: token.colorTextTertiary, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -6, border: `2px solid ${token.colorBgContainer}` }}>
                +{rest}
              </div>
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block', color: isMyTurn ? token.colorPrimary : undefined, fontWeight: isMyTurn ? 600 : 400 }}>
            {progressText(doc)}
          </Text>
        </div>

        {/* 상태 */}
        <div style={{ textAlign: 'center' }}>
          <Tag color={cfg.color} style={{ margin: 0, borderRadius: 999, fontWeight: 600 }}>{cfg.label}</Tag>
        </div>

        {/* 액션 */}
        <div style={{ textAlign: 'right' }}>
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
        </div>
      </div>
    );
  };

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
        <Space size={8} wrap>
          <Input.Search
            allowClear placeholder="제목·문서번호·기안자"
            style={{ width: 200 }} size="small"
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onSearch={v => { setQ((v || '').trim()); setPage(1); }}
          />
          <Select
            allowClear placeholder="양식종류"
            style={{ width: 130 }} size="small"
            value={formTypeId}
            onChange={v => { setFormTypeId(v); setPage(1); }}
          >
            {formTypes.map(t => (
              <Select.Option key={t.id} value={t.id}>{t.icon} {t.name}</Select.Option>
            ))}
          </Select>
          <Select
            allowClear placeholder="상태 필터"
            style={{ width: 120 }}
            value={statusFilter}
            onChange={v => { setStatusFilter(v); setPage(1); }}
            size="small"
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

      <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG, border: `1px solid ${token.colorBorderSecondary}`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>
        ) : documents.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="문서가 없습니다." style={{ padding: '48px 0' }} />
        ) : (
          documents.map(renderDoc)
        )}
        {total > 20 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px' }}>
            <Pagination current={page} pageSize={20} total={total} onChange={setPage} showSizeChanger={false} size="small" />
          </div>
        )}
      </div>

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
          />
        )}
      </Drawer>
    </div>
  );
}
