import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Breadcrumb, Button, Space, Typography, Tag, Divider,
  Avatar, Modal, Input, message, Spin, Popconfirm, Card, Descriptions,
  theme as antTheme,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined,
  StopOutlined, PaperClipOutlined, SendOutlined, DeleteOutlined,
  RedoOutlined, ClockCircleOutlined, FileDoneOutlined, UserOutlined,
  CopyOutlined, FireOutlined,
} from '@ant-design/icons';
import {
  getApproval, getApprovals, approveApproval, rejectApproval, cancelApproval, resubmitApproval, resumeApproval,
  getApprovalComments, createApprovalComment, deleteApprovalComment,
  deleteApprovalAttachment, downloadApprovalAttachmentUrl,
} from '../../api/approval';
import useAuthStore from '../../store/authStore';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { useToken } = antTheme;

const STATUS_CONFIG = {
  draft:     { color: 'default',    label: '임시저장', icon: <ClockCircleOutlined /> },
  pending:   { color: 'processing', label: '결재중',   icon: <ClockCircleOutlined /> },
  approved:  { color: 'success',    label: '승인완료', icon: <CheckCircleOutlined /> },
  rejected:  { color: 'error',      label: '반려',     icon: <CloseCircleOutlined /> },
  cancelled: { color: 'default',    label: '취소',     icon: <StopOutlined /> },
};

const ROLE_CFG = {
  approval:   { label: '승인', color: 'blue' },
  agreement:  { label: '합의', color: 'gold' },
  delegation: { label: '전결', color: 'purple' },
  reference:  { label: '참조', color: 'default' },
};

function getAvatarBg(color) { return color || '#1677ff'; }
function getInitial(name) { return name ? name[0].toUpperCase() : 'U'; }

// ── 결재란 (도장 그리드) — 종이 결재 문서 상단의 도장 칸을 재현 ──
function StampCell({ roleLabel, title, name, status, actingType, signImagePath, dateStr, isCurrent, badge, token }) {
  const done = status === 'approved';
  const rejected = status === 'rejected';
  const skipped = status === 'skipped';
  const hatch = status === 'pending' && !isCurrent;

  const bodyBg = hatch
    ? `repeating-linear-gradient(45deg, ${token.colorBgContainer}, ${token.colorBgContainer} 8px, ${token.colorBgLayout} 8px, ${token.colorBgLayout} 16px)`
    : token.colorBgContainer;

  return (
    <div style={{
      flex: '1 0 96px', minWidth: 96, borderRight: `1px solid ${token.colorBorderSecondary}`,
      textAlign: 'center', background: token.colorBgContainer,
      boxShadow: isCurrent ? `inset 0 0 0 2px ${token.colorPrimary}` : 'none',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, padding: '5px 2px', color: token.colorTextSecondary, background: token.colorBgLayout, borderBottom: `1px solid ${token.colorBorderSecondary}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {roleLabel}
      </div>
      <div style={{ height: 80, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: bodyBg }}>
        {badge && (
          <span style={{ position: 'absolute', top: 5, right: 5, fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: badge.bg, color: badge.color }}>{badge.label}</span>
        )}
        {title && <span style={{ fontSize: 10.5, color: token.colorTextTertiary }}>{title}</span>}
        <span style={{ fontSize: 12, fontWeight: 700, color: token.colorText }}>{name || '-'}</span>
        {done && (
          signImagePath
            ? <img src={signImagePath} alt="서명" style={{ height: 30, maxWidth: 74, objectFit: 'contain' }} />
            : <span style={{ width: 34, height: 34, border: `2px solid ${token.colorSuccess}`, color: token.colorSuccess, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, transform: 'rotate(-10deg)' }}>{getInitial(name)}</span>
        )}
        {rejected && <span style={{ width: 34, height: 34, border: `2px solid ${token.colorError}`, color: token.colorError, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, transform: 'rotate(-10deg)' }}>반려</span>}
        {skipped && <span style={{ fontSize: 10, color: token.colorTextTertiary }}>전결 생략</span>}
        {status === 'pending' && isCurrent && <span style={{ fontSize: 10.5, color: token.colorPrimary, fontWeight: 700 }}>결재 진행중</span>}
        {status === 'pending' && !isCurrent && <span style={{ fontSize: 10.5, color: token.colorTextTertiary }}>대기</span>}
        {dateStr && <span style={{ position: 'absolute', bottom: 5, fontSize: 9, color: token.colorTextTertiary }}>{dateStr}</span>}
      </div>
    </div>
  );
}

function StampGrid({ doc, flowSteps, token }) {
  const groupCount = {};
  flowSteps.forEach(s => { groupCount[s.stepOrder] = (groupCount[s.stepOrder] || 0) + 1; });

  return (
    <div style={{ display: 'flex', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, overflow: 'hidden', overflowX: 'auto' }}>
      {/* 기안 칸 */}
      <StampCell
        roleLabel="기안"
        title={doc.creator?.position || null}
        name={doc.creator?.displayName}
        status="approved"
        dateStr={dayjs(doc.createdAt).format('MM.DD HH:mm')}
        token={token}
      />
      {flowSteps.map(s => {
        const isCurrent = doc.status === 'pending' && s.stepOrder === doc.currentStep && s.status === 'pending';
        const role = ROLE_CFG[s.type] || ROLE_CFG.approval;
        let badge = null;
        if (s.type === 'delegation') badge = { label: '전결', bg: `${token.colorPurple || '#722ed1'}20`, color: token.colorPurple || '#722ed1' };
        else if (groupCount[s.stepOrder] > 1) badge = { label: '병렬', bg: `${token.colorInfo}20`, color: token.colorInfo };
        return (
          <StampCell
            key={s.id}
            roleLabel={`${role.label} · ${s.stepOrder}차`}
            title={s.approverTitleSnap || s.approver?.position || null}
            name={s.approverNameSnap || s.approver?.displayName}
            status={s.status}
            actingType={s.actingType}
            signImagePath={s.signImagePath}
            dateStr={s.actionAt ? dayjs(s.actionAt).format('MM.DD HH:mm') : null}
            isCurrent={isCurrent}
            badge={badge}
            token={token}
          />
        );
      })}
    </div>
  );
}

// 결재란의 개별 단계 행
function StepRow({ step, isCurrentGroup, docStatus, token }) {
  const role = ROLE_CFG[step.type] || ROLE_CFG.approval;
  const done = step.status === 'approved';
  const rejected = step.status === 'rejected';
  const skipped = step.status === 'skipped';
  const isProcessing = docStatus === 'pending' && isCurrentGroup && step.status === 'pending';
  const name = step.approverNameSnap || step.approver?.displayName;

  const statusColor = done ? token.colorSuccess : rejected ? token.colorError
    : skipped ? token.colorTextTertiary : isProcessing ? token.colorPrimary : token.colorTextTertiary;

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', alignItems: 'flex-start' }}>
      <Tag color={role.color} style={{ fontSize: 10, margin: 0, lineHeight: '18px', flexShrink: 0 }}>{role.label}</Tag>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={6} wrap>
          {step.approverTitleSnap && <Text type="secondary" style={{ fontSize: 11 }}>{step.approverTitleSnap}</Text>}
          <Text style={{ fontSize: 12, color: statusColor, fontWeight: isProcessing ? 600 : 400 }}>{name}</Text>
          {isProcessing && <Text style={{ fontSize: 10, color: token.colorPrimary }}>진행중</Text>}
          {skipped && <Text style={{ fontSize: 10, color: token.colorTextTertiary }}>전결 생략</Text>}
        </Space>
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          {done && (
            step.signImagePath
              ? <img src={step.signImagePath} alt="서명" style={{ height: 34, maxWidth: 88, objectFit: 'contain', marginTop: 2 }} />
              : <Tag color="success" style={{ fontSize: 10, marginTop: 2, lineHeight: '16px' }}>{step.actingType || '승인'}</Tag>
          )}
          {rejected && <Tag color="error" style={{ fontSize: 10, marginTop: 2, lineHeight: '16px' }}>반려</Tag>}
          {step.comment && <div style={{ color: token.colorTextSecondary, marginTop: 2 }}>"{step.comment}"</div>}
          {step.actionAt && <div style={{ color: token.colorTextTertiary }}>{dayjs(step.actionAt).format('MM.DD HH:mm')}</div>}
        </div>
      </div>
    </div>
  );
}

function formatFieldValue(f, val) {
  if (val === undefined || val === null || val === '') return null;
  if (f.type === 'money') return `${Number(val).toLocaleString('ko-KR')} 원`;
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function FormDataView({ template, formData, token }) {
  if (!template?.fieldsJson) return null;
  let fields = [];
  let data = {};
  try { fields = JSON.parse(template.fieldsJson); } catch {}
  try { data = formData ? JSON.parse(formData) : {}; } catch {}

  // 구분선(divider)은 섹션 헤더로, 나머지는 그리드 카드로 렌더
  const blocks = [];
  let bucket = [];
  const flush = (key) => {
    if (bucket.length) {
      blocks.push(
        <div key={`g-${key}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px 16px' }}>
          {bucket}
        </div>
      );
      bucket = [];
    }
  };
  fields.forEach((f, i) => {
    if (f.type === 'divider') {
      flush(i);
      blocks.push(<Divider key={`d-${i}`} orientation="left" style={{ fontSize: 12, color: token.colorTextSecondary, margin: '4px 0' }}>{f.label}</Divider>);
      return;
    }
    const display = formatFieldValue(f, data[f.id]);
    bucket.push(
      <div key={f.id} style={{ padding: '8px 12px', background: token.colorBgLayout, borderRadius: token.borderRadius, borderLeft: `3px solid ${token.colorPrimary}` }}>
        <div style={{ fontSize: 11, color: token.colorTextTertiary, marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          {f.label}{f.required && <span style={{ color: token.colorError }}>*</span>}
        </div>
        <div style={{ fontSize: 13, color: token.colorText, wordBreak: 'break-all' }}>
          {display !== null ? display : <Text type="secondary">-</Text>}
        </div>
      </div>
    );
  });
  flush('last');

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{blocks}</div>;
}

export default function DocumentDetail({ embedded = false, docId = null, onClose, onEdit, onCopy, onNext, onChanged } = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const id = embedded ? docId : params.id;
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const { token } = useToken();

  // 목록으로 돌아가기 / 목록 링크
  const goList = () => { if (embedded) onClose?.(); else navigate('/approvals'); };
  // 수정 화면 열기
  const goEdit = () => { if (embedded) onEdit?.(id); else navigate(`/approvals/${id}/edit`); };
  // 이 문서를 복제해 새 결재 작성
  const goCopy = () => { if (embedded) onCopy?.(id); else navigate(`/approvals/new?copyFrom=${id}`); };
  // 다음 대기 문서로 이동 (연속 결재)
  const goNext = (nid) => {
    const target = nid || nextPendingId;
    if (!target) return;
    if (embedded) onNext?.(target); else navigate(`/approvals/${target}`);
  };
  // 결재/취소 등 변경 후 목록 갱신 알림
  const notifyChanged = () => onChanged?.();

  const [doc, setDoc] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextPendingId, setNextPendingId] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [actionComment, setActionComment] = useState('');
  const [actioning, setActioning] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const load = async () => {
    try { const data = await getApproval(id); setDoc(data); }
    catch (e) { message.error(e.response?.data?.error || '문서를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  };

  const loadComments = async () => {
    try { const data = await getApprovalComments(id); setComments(data); }
    catch {}
  };

  useEffect(() => { load(); loadComments(); }, [id]);

  // 내 결재 대기 큐 — 현재 문서 외 다음 대기 문서 id
  useEffect(() => {
    getApprovals({ tab: 'pending', limit: 100 })
      .then(r => {
        const ids = (r.documents || []).map(d => d.id).filter(x => x !== Number(id));
        setNextPendingId(ids[0] || null);
      }).catch(() => {});
  }, [id]);

  const handleAction = async () => {
    setActioning(true);
    try {
      if (actionModal === 'approve') {
        await approveApproval(id, actionComment);
        message.success('승인되었습니다.');
      } else {
        if (!actionComment.trim()) { message.warning('반려 사유를 입력하세요.'); setActioning(false); return; }
        await rejectApproval(id, actionComment);
        message.success('반려되었습니다.');
      }
      setActionModal(null); setActionComment(''); notifyChanged();
      // 연속 결재: 다음 대기 문서가 있으면 이어서 처리
      if (nextPendingId) { message.info('다음 결재 문서로 이동합니다.'); goNext(); }
      else load();
    } catch (e) { message.error(e.response?.data?.error || '처리 실패'); }
    finally { setActioning(false); }
  };

  const handleCancel = async () => {
    try { await cancelApproval(id); message.success('취소되었습니다.'); load(); notifyChanged(); }
    catch (e) { message.error(e.response?.data?.error || '취소 실패'); }
  };

  const handleResubmit = async () => {
    try { await resubmitApproval(id); message.success('재기안되었습니다. 내용을 수정 후 다시 상신하세요.'); load(); notifyChanged(); }
    catch (e) { message.error(e.response?.data?.error || '재기안 실패'); }
  };

  const handleResume = async () => {
    try { const r = await resumeApproval(id); message.success(r.message || '재상신되었습니다.'); load(); notifyChanged(); }
    catch (e) { message.error(e.response?.data?.error || '재상신 실패'); }
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try { await createApprovalComment(id, newComment); setNewComment(''); loadComments(); }
    catch { message.error('의견 등록 실패'); }
    finally { setSubmittingComment(false); }
  };

  const handleDeleteComment = async (cid) => {
    try { await deleteApprovalComment(id, cid); loadComments(); }
    catch { message.error('삭제 실패'); }
  };

  const handleDeleteAttachment = async (aid) => {
    try { await deleteApprovalAttachment(id, aid); load(); }
    catch { message.error('첨부파일 삭제 실패'); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!doc) return <div style={{ padding: 40, textAlign: 'center', color: token.colorTextTertiary }}>문서를 찾을 수 없습니다.</div>;

  const statusCfg = STATUS_CONFIG[doc.status] || { color: 'default', label: doc.status, icon: null };
  const isOwner = doc.createdBy === user?.id || isAdmin;
  const flowSteps = (doc.steps || []).filter(s => s.type !== 'reference');
  const refSteps = (doc.steps || []).filter(s => s.type === 'reference');
  const isCurrentApprover = doc.status === 'pending' && flowSteps.some(
    s => s.stepOrder === doc.currentStep && s.approverId === user?.id && s.status === 'pending'
  );
  // 차수(그룹)별로 묶기 — 같은 stepOrder는 병렬
  const groupOrders = [...new Set(flowSteps.map(s => s.stepOrder))].sort((a, b) => a - b);

  return (
    <div style={{ maxWidth: embedded ? '100%' : 920, margin: '0 auto', padding: embedded ? 0 : '20px 20px' }}>
      {!embedded && (
        <Breadcrumb
          style={{ marginBottom: 14 }}
          items={[
            { title: <a onClick={goList} style={{ color: token.colorTextSecondary }}>전자결재</a> },
            { title: doc.template?.formType?.name },
            { title: doc.title },
          ]}
        />
      )}

      {/* 문서 헤더 카드 */}
      <Card
        bordered={false}
        style={{ marginBottom: 14, boxShadow: `0 1px 4px ${token.colorBorderSecondary}` }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={8} style={{ marginBottom: 8 }} wrap>
              <Tag color={statusCfg.color} icon={statusCfg.icon}>{statusCfg.label}</Tag>
              {doc.docNo && (
                <Tag style={{ fontFamily: 'monospace', fontSize: 12 }} color="blue">{doc.docNo}</Tag>
              )}
              {doc.isUrgent && <Tag color="red" icon={<FireOutlined />}>긴급</Tag>}
              {doc.dueDate && (() => {
                const over = doc.status === 'pending' && dayjs(doc.dueDate).endOf('day').isBefore(dayjs());
                return (
                  <Tag color={over ? 'error' : 'orange'} icon={<ClockCircleOutlined />}>
                    마감 {dayjs(doc.dueDate).format('YYYY.MM.DD')}{over ? ' · 초과' : ''}
                  </Tag>
                );
              })()}
              <Text type="secondary" style={{ fontSize: 12 }}>
                {doc.template?.formType?.name} / {doc.template?.name}
              </Text>
            </Space>
            <Title level={4} style={{ margin: '0 0 10px', wordBreak: 'break-word' }}>{doc.title}</Title>
            <Space size={16}>
              <Space size={6}>
                <Avatar size={22} style={{ background: getAvatarBg(doc.creator?.avatarColor), fontSize: 10 }}>
                  {getInitial(doc.creator?.displayName)}
                </Avatar>
                <Text style={{ fontSize: 12 }}>{doc.creator?.displayName}</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                {dayjs(doc.createdAt).format('YYYY.MM.DD HH:mm')}
              </Text>
            </Space>
          </div>
          <Space wrap style={{ flexShrink: 0 }}>
            {isOwner && doc.status === 'draft' && (
              <Button size="small" icon={<EditOutlined />} onClick={goEdit}>수정</Button>
            )}
            {isOwner && ['draft', 'pending'].includes(doc.status) && (
              <Popconfirm title="취소하시겠습니까?" onConfirm={handleCancel} okText="취소" cancelText="아니요">
                <Button size="small" icon={<StopOutlined />}>취소</Button>
              </Popconfirm>
            )}
            {isOwner && doc.status === 'rejected' && doc.rejectedStep > 1 && (
              <Popconfirm
                title={`${doc.rejectedStep}차부터 재상신하시겠습니까? 이전 승인은 유지됩니다.`}
                onConfirm={handleResume} okText="재상신" cancelText="아니요"
              >
                <Button size="small" icon={<RedoOutlined />} type="primary" ghost>반려지점부터 재상신</Button>
              </Popconfirm>
            )}
            {isOwner && ['rejected', 'cancelled'].includes(doc.status) && (
              <Popconfirm title="처음부터 재기안하시겠습니까? 문서가 임시저장 상태로 돌아갑니다." onConfirm={handleResubmit} okText="재기안" cancelText="아니요">
                <Button size="small" icon={<RedoOutlined />} type="dashed">처음부터 재기안</Button>
              </Popconfirm>
            )}
            {isCurrentApprover && (
              <>
                <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                  onClick={() => { setActionModal('approve'); setActionComment(''); }}>승인</Button>
                <Button size="small" danger icon={<CloseCircleOutlined />}
                  onClick={() => { setActionModal('reject'); setActionComment(''); }}>반려</Button>
              </>
            )}
            {isCurrentApprover && nextPendingId && (
              <Tooltip title="이 문서를 건너뛰고 다음 대기 문서로">
                <Button size="small" onClick={() => goNext()}>다음 결재 →</Button>
              </Tooltip>
            )}
            <Button size="small" icon={<CopyOutlined />} onClick={goCopy}>복제</Button>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={goList}>{embedded ? '닫기' : '목록'}</Button>
          </Space>
        </div>
      </Card>

      {/* 결재란 (도장 그리드) */}
      {flowSteps.length > 0 && (
        <Card
          bordered={false}
          style={{ marginBottom: 14, boxShadow: `0 1px 4px ${token.colorBorderSecondary}` }}
          bodyStyle={{ padding: '14px 16px' }}
          size="small"
        >
          <StampGrid doc={doc} flowSteps={flowSteps} token={token} />
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignItems: 'start' }}>
        {/* 좌: 결재 내용 + 첨부 + 의견 */}
        <div>
          {/* 결재 내용 */}
          <Card
            bordered={false}
            title={<Text strong style={{ fontSize: 13 }}>결재 내용</Text>}
            style={{ marginBottom: 14, boxShadow: `0 1px 4px ${token.colorBorderSecondary}` }}
            bodyStyle={{ padding: '12px 20px' }}
            size="small"
          >
            <FormDataView template={doc.template} formData={doc.formData} token={token} />
          </Card>

          {/* 첨부파일 */}
          {doc.attachments?.length > 0 && (
            <Card
              bordered={false}
              title={<Text strong style={{ fontSize: 13 }}>첨부파일 {doc.attachments.length}개</Text>}
              style={{ marginBottom: 14, boxShadow: `0 1px 4px ${token.colorBorderSecondary}` }}
              bodyStyle={{ padding: '10px 20px' }}
              size="small"
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {doc.attachments.map(att => (
                  <div key={att.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgLayout, fontSize: 12,
                  }}>
                    <PaperClipOutlined style={{ color: token.colorTextTertiary }} />
                    <a href={downloadApprovalAttachmentUrl(id, att.id)} download={att.originalName} style={{ color: token.colorText }}>
                      {att.originalName}
                    </a>
                    <Text type="secondary" style={{ fontSize: 11 }}>({(att.size / 1024).toFixed(0)}KB)</Text>
                    {(isAdmin || att.uploadedBy === user?.id) && (
                      <Popconfirm title="삭제?" onConfirm={() => handleDeleteAttachment(att.id)} okText="삭제" cancelText="취소">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ width: 18, height: 18, padding: 0 }} />
                      </Popconfirm>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 의견 */}
          <Card
            bordered={false}
            title={<Text strong style={{ fontSize: 13 }}>의견 <Text style={{ color: token.colorPrimary }}>{comments.length}</Text></Text>}
            style={{ boxShadow: `0 1px 4px ${token.colorBorderSecondary}` }}
            bodyStyle={{ padding: '12px 20px' }}
            size="small"
          >
            {comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '14px 0', color: token.colorTextTertiary, fontSize: 12 }}>
                의견을 남겨보세요.
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {comments.map((c, idx) => (
                  <div key={c.id}>
                    {idx > 0 && <Divider style={{ margin: '10px 0' }} />}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Avatar size={30} style={{ background: getAvatarBg(c.user?.avatarColor), flexShrink: 0, fontSize: 11 }}>
                        {getInitial(c.user?.displayName)}
                      </Avatar>
                      <div style={{ flex: 1 }}>
                        <Space size={8} style={{ marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 13 }}>{c.user?.displayName}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(c.createdAt).format('MM.DD HH:mm')}</Text>
                        </Space>
                        <div style={{ background: token.colorBgLayout, borderRadius: token.borderRadius, padding: '6px 10px', fontSize: 13, whiteSpace: 'pre-wrap', color: token.colorText }}>
                          {c.content}
                        </div>
                        {(isAdmin || c.userId === user?.id) && (
                          <Popconfirm title="삭제?" onConfirm={() => handleDeleteComment(c.id)} okText="삭제" cancelText="취소">
                            <Button type="link" size="small" danger style={{ padding: 0, fontSize: 12, height: 'auto', marginTop: 4 }}>삭제</Button>
                          </Popconfirm>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Divider style={{ margin: '10px 0 12px' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Avatar size={30} style={{ background: getAvatarBg(user?.avatarColor), flexShrink: 0, fontSize: 11 }}>
                {getInitial(user?.displayName)}
              </Avatar>
              <div style={{ flex: 1 }}>
                <TextArea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="의견을 입력하세요"
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  style={{ marginBottom: 6 }}
                />
                <div style={{ textAlign: 'right' }}>
                  <Button type="primary" size="small" icon={<SendOutlined />}
                    loading={submittingComment} onClick={handleComment} disabled={!newComment.trim()}>
                    등록
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 우: 결재 라인 */}
        <Card
          bordered={false}
          title={<Text strong style={{ fontSize: 13 }}>결재 라인</Text>}
          style={{ boxShadow: `0 1px 4px ${token.colorBorderSecondary}`, position: 'sticky', top: 16 }}
          bodyStyle={{ padding: '12px 16px' }}
          size="small"
        >
          {groupOrders.map((order) => {
            const groupSteps = flowSteps.filter(s => s.stepOrder === order);
            const isCurrentGroup = doc.status === 'pending' && order === doc.currentStep;
            const parallel = groupSteps.length > 1;
            return (
              <div key={order} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: 600, color: isCurrentGroup ? token.colorPrimary : token.colorTextSecondary }}>
                    {order}차
                  </Text>
                  {parallel && <Tag color="cyan" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>병렬</Tag>}
                </div>
                <div style={{ borderLeft: `2px solid ${isCurrentGroup ? token.colorPrimary : token.colorBorderSecondary}`, paddingLeft: 8 }}>
                  {groupSteps.map(step => (
                    <StepRow key={step.id} step={step} isCurrentGroup={isCurrentGroup} docStatus={doc.status} token={token} />
                  ))}
                </div>
              </div>
            );
          })}

          {refSteps.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${token.colorBorderSecondary}` }}>
              <Text style={{ fontSize: 11, fontWeight: 600, color: token.colorTextSecondary }}>참조</Text>
              <div style={{ marginTop: 2 }}>
                {refSteps.map(step => (
                  <StepRow key={step.id} step={step} isCurrentGroup={false} docStatus={doc.status} token={token} />
                ))}
              </div>
            </div>
          )}

          {doc.status === 'approved' && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: `${token.colorSuccess}15`, borderRadius: token.borderRadius, textAlign: 'center' }}>
              <CheckCircleOutlined style={{ color: token.colorSuccess, marginRight: 6 }} />
              <Text style={{ color: token.colorSuccess, fontSize: 12, fontWeight: 600 }}>최종 승인 완료</Text>
            </div>
          )}
          {doc.status === 'rejected' && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: `${token.colorError}12`, borderRadius: token.borderRadius, textAlign: 'center' }}>
              <CloseCircleOutlined style={{ color: token.colorError, marginRight: 6 }} />
              <Text style={{ color: token.colorError, fontSize: 12, fontWeight: 600 }}>반려됨</Text>
            </div>
          )}
        </Card>
      </div>

      {/* 승인/반려 모달 */}
      <Modal
        title={
          <Space>
            {actionModal === 'approve'
              ? <CheckCircleOutlined style={{ color: token.colorSuccess }} />
              : <CloseCircleOutlined style={{ color: token.colorError }} />}
            {actionModal === 'approve' ? '승인 확인' : '반려'}
          </Space>
        }
        open={!!actionModal}
        onOk={handleAction}
        onCancel={() => setActionModal(null)}
        confirmLoading={actioning}
        okText={actionModal === 'approve' ? '승인' : '반려'}
        okButtonProps={{ danger: actionModal === 'reject', type: actionModal === 'approve' ? 'primary' : 'primary' }}
        cancelText="취소"
      >
        <div style={{ marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {actionModal === 'approve' ? '승인 의견을 입력하세요 (선택).' : '반려 사유를 입력하세요 (필수).'}
          </Text>
        </div>
        <TextArea
          value={actionComment}
          onChange={e => setActionComment(e.target.value)}
          rows={3}
          placeholder={actionModal === 'reject' ? '반려 사유를 반드시 입력하세요.' : '의견 (선택)'}
        />
      </Modal>
    </div>
  );
}
