import { useState, useEffect } from 'react';
import {
  Button, Space, Typography, Tag, Tooltip, Avatar, Spin, message, Empty,
  theme as antTheme, Divider, Input, Popconfirm, Popover, Badge, Dropdown,
} from 'antd';
import {
  ArrowLeftOutlined, RollbackOutlined, TeamOutlined, ShareAltOutlined,
  StarOutlined, StarFilled, PaperClipOutlined, DownloadOutlined, DeleteOutlined,
  CheckCircleFilled, ClockCircleOutlined, EyeOutlined, MessageOutlined, SendOutlined,
  TagsOutlined, ThunderboltFilled, CheckOutlined, CommentOutlined,
} from '@ant-design/icons';
import {
  getMail, toggleStar, trashMail, downloadMailAttachment,
  getMailComments, createMailComment, deleteMailComment, setMailLabels,
} from '../../api/mail';
import useAuthStore from '../../store/authStore';
import ComposeModal from './ComposeModal';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { useToken } = antTheme;

export default function MailDetail({ mailId, folder, labels = [], onBack, onRefresh, onLabelsChanged }) {
  const { token } = useToken();
  const user = useAuthStore(s => s.user);
  const [mail, setMail] = useState(null);
  const [loading, setLoading] = useState(true);
  // mode: null | 'reply' | 'replyAll' | 'forward'
  const [composeMode, setComposeMode] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [activeMailId, setActiveMailId] = useState(mailId);  // 스레드에서 다른 메일 선택 시

  useEffect(() => { setActiveMailId(mailId); }, [mailId]);

  useEffect(() => {
    if (!activeMailId) return;
    setLoading(true);
    setComments([]);
    setCommentInput('');
    getMail(activeMailId)
      .then(m => { setMail(m); setComments(m.comments || []); })
      .catch(() => message.error('메일을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [activeMailId]);

  const reloadMail = () => {
    getMail(activeMailId).then(m => { setMail(m); setComments(m.comments || []); }).catch(() => {});
  };

  const handleSetLabel = async (labelId) => {
    const cur = (mail.labels || []).map(l => l.id);
    const next = cur.includes(labelId) ? cur.filter(x => x !== labelId) : [...cur, labelId];
    try {
      await setMailLabels(mail.id, next);
      reloadMail();
      onRefresh?.();
    } catch { message.error('라벨 지정 실패'); }
  };

  const reloadComments = async () => {
    try { setComments(await getMailComments(activeMailId)); } catch {}
  };

  const handleAddComment = async () => {
    if (!commentInput.trim()) return;
    setCommentSubmitting(true);
    try {
      await createMailComment(activeMailId, commentInput.trim());
      setCommentInput('');
      await reloadComments();
    } catch (e) { message.error(e.response?.data?.error || '댓글 등록 실패'); }
    finally { setCommentSubmitting(false); }
  };

  const handleDeleteComment = async (cid) => {
    try { await deleteMailComment(activeMailId, cid); await reloadComments(); }
    catch (e) { message.error(e.response?.data?.error || '삭제 실패'); }
  };

  const handleStar = async () => {
    await toggleStar(activeMailId);
    setMail(prev => ({ ...prev, isStarred: !prev.isStarred }));
  };

  const handleTrash = async () => {
    await trashMail(activeMailId);
    message.success(folder === 'trash' ? '영구 삭제되었습니다.' : '휴지통으로 이동했습니다.');
    onRefresh?.();
    onBack?.();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <Spin />
    </div>
  );

  if (!mail) return (
    <Empty description="메일을 선택하세요." style={{ marginTop: 60 }} />
  );

  const toRecipients = mail.recipients?.filter(r => r.type === 'to') || [];
  const ccRecipients = mail.recipients?.filter(r => r.type === 'cc') || [];
  const allRecipients = mail.recipients || [];
  const readCount = allRecipients.filter(r => r.isRead).length;
  const isMine = mail.fromUserId === user?.id;
  const canStar = folder !== 'sent' && folder !== 'drafts';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: token.colorBgContainer }}>
      {/* 툴바 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>목록</Button>
        <Space>
          {canStar && (
            <Tooltip title={mail.isStarred ? '별표 해제' : '별표'}>
              <Button
                size="small" type="text"
                icon={mail.isStarred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                onClick={handleStar}
              />
            </Tooltip>
          )}
          {/* 답장 버튼 그룹 — 임시저장 외 모든 폴더에서 표시 */}
          {folder !== 'drafts' && (
            <>
              <Tooltip title="보낸 사람에게만 답장">
                <Button size="small" icon={<RollbackOutlined />} onClick={() => setComposeMode('reply')}>
                  답장
                </Button>
              </Tooltip>
              {(toRecipients.length + ccRecipients.length) > 1 && (
                <Tooltip title="보낸 사람 + 모든 수신자에게 답장">
                  <Button size="small" icon={<TeamOutlined />} onClick={() => setComposeMode('replyAll')}>
                    전체 답장
                  </Button>
                </Tooltip>
              )}
            </>
          )}
          <Tooltip title="다른 사용자에게 전달">
            <Button size="small" icon={<ShareAltOutlined />} onClick={() => setComposeMode('forward')}>
              전달
            </Button>
          </Tooltip>
          {/* 라벨 지정 */}
          <Dropdown
            trigger={['click']}
            menu={{
              items: labels.length
                ? labels.map(lb => {
                    const checked = (mail.labels || []).some(l => l.id === lb.id);
                    return {
                      key: lb.id,
                      label: (
                        <Space size={6}>
                          {checked ? <CheckOutlined style={{ color: token.colorPrimary, fontSize: 11 }} /> : <span style={{ width: 11 }} />}
                          <span style={{ width: 12, height: 12, borderRadius: 3, background: lb.color, display: 'inline-block' }} />
                          {lb.name}
                        </Space>
                      ),
                      onClick: () => handleSetLabel(lb.id),
                    };
                  })
                : [{ key: 'none', label: '라벨이 없습니다', disabled: true }],
            }}
          >
            <Tooltip title="라벨 지정">
              <Button size="small" icon={<TagsOutlined />} />
            </Tooltip>
          </Dropdown>
          <Tooltip title={folder === 'trash' ? '영구 삭제' : '휴지통'}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={handleTrash} />
          </Tooltip>
        </Space>
      </div>

      {/* 메일 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {mail.priority === 'urgent' && (
            <Tag color="red" icon={<ThunderboltFilled />} style={{ fontSize: 12, margin: 0 }}>긴급</Tag>
          )}
          <Title level={4} style={{ margin: 0 }}>{mail.subject}</Title>
          {(mail.labels || []).map(lb => (
            <Tag key={lb.id} color={lb.color} closable onClose={(e) => { e.preventDefault(); handleSetLabel(lb.id); }} style={{ fontSize: 11, border: 'none' }}>
              {lb.name}
            </Tag>
          ))}
        </div>

        {/* 스레드 (대화) 네비게이션 — 2건 이상일 때 */}
        {mail.thread?.length > 1 && (
          <div style={{
            marginBottom: 20, padding: '10px 14px', borderRadius: 10,
            border: `1px solid ${token.colorBorderSecondary}`, background: token.colorFillAlter,
          }}>
            <Space size={6} style={{ marginBottom: 8 }}>
              <CommentOutlined style={{ color: token.colorPrimary }} />
              <Text strong style={{ fontSize: 12 }}>대화 ({mail.thread.length})</Text>
            </Space>
            <Space direction="vertical" style={{ width: '100%' }} size={2}>
              {mail.thread.map(t => {
                const active = t.id === mail.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => !active && setActiveMailId(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 6, cursor: active ? 'default' : 'pointer',
                      background: active ? token.colorPrimaryBg : 'transparent',
                      border: active ? `1px solid ${token.colorPrimaryBorder}` : '1px solid transparent',
                    }}
                  >
                    {active
                      ? <CheckOutlined style={{ color: token.colorPrimary, fontSize: 11 }} />
                      : <span style={{ width: 11 }} />}
                    <Text style={{ fontSize: 12, fontWeight: active ? 600 : 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.from?.displayName} · {t.subject}
                    </Text>
                    {t.attachmentCount > 0 && <PaperClipOutlined style={{ fontSize: 10, color: token.colorTextSecondary }} />}
                    <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>{dayjs(t.createdAt).format('MM.DD HH:mm')}</Text>
                  </div>
                );
              })}
            </Space>
          </div>
        )}

        {/* 발신자 정보 */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 20,
          padding: '12px 16px',
          background: token.colorFillAlter,
          borderRadius: 10,
        }}>
          <Avatar size={40} style={{ background: token.colorPrimary, flexShrink: 0 }}>
            {(mail.from?.displayName || '?').charAt(0)}
          </Avatar>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={8} wrap>
              <Text strong style={{ fontSize: 14 }}>{mail.from?.displayName || '-'}</Text>
              {isMine && <Tag color="blue" style={{ fontSize: 11 }}>내가 보냄</Tag>}
            </Space>
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                받는 사람: {toRecipients.map(r => r.user?.displayName).join(', ') || '-'}
              </Text>
              {ccRecipients.length > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  참조: {ccRecipients.map(r => r.user?.displayName).join(', ')}
                </Text>
              )}
            </div>
          </div>
          <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
            {dayjs(mail.createdAt).format('YYYY.MM.DD HH:mm')}
          </Text>
        </div>

        {/* 수신인 열람 현황 — 발신자에게만 표시 */}
        {isMine && allRecipients.length > 0 && (
          <Popover
            placement="bottomLeft"
            trigger="click"
            title={<span style={{ fontSize: 13 }}>수신인 열람 현황 ({readCount}/{allRecipients.length})</span>}
            content={
              <div style={{ width: 240, maxHeight: 280, overflowY: 'auto' }}>
                {allRecipients.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 4px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}>
                    <Space size={6}>
                      {r.isRead
                        ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 13 }} />
                        : <ClockCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 13 }} />}
                      <Text style={{ fontSize: 12 }}>{r.user?.displayName}</Text>
                      <Tag style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                        {r.type === 'to' ? '받는사람' : r.type === 'cc' ? '참조' : '숨은참조'}
                      </Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {r.isRead ? (r.readAt ? dayjs(r.readAt).format('MM.DD HH:mm') : '읽음') : '대기'}
                    </Text>
                  </div>
                ))}
              </div>
            }
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              marginBottom: 20, padding: '6px 12px', borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer,
            }}>
              <EyeOutlined style={{ color: token.colorPrimary, fontSize: 13 }} />
              <Text style={{ fontSize: 12 }}>
                열람 <Text strong style={{ color: readCount === allRecipients.length ? '#52c41a' : token.colorPrimary }}>{readCount}</Text>
                {' / '}{allRecipients.length}
              </Text>
              {readCount < allRecipients.length && (
                <Text type="secondary" style={{ fontSize: 11 }}>· 미열람 {allRecipients.length - readCount}명</Text>
              )}
            </div>
          </Popover>
        )}

        {/* 첨부파일 */}
        {mail.attachments?.length > 0 && (
          <div style={{
            marginBottom: 20,
            padding: '10px 16px',
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 8,
          }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              <PaperClipOutlined /> 첨부파일 ({mail.attachments.length})
            </Text>
            <Space wrap>
              {mail.attachments.map(att => (
                <a
                  key={att.id}
                  href={downloadMailAttachment(mail.id, att.id)}
                  download={att.originalName}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 6,
                    fontSize: 12,
                    color: token.colorText,
                    textDecoration: 'none',
                  }}
                >
                  <PaperClipOutlined />
                  {att.originalName}
                  <Text type="secondary" style={{ fontSize: 11 }}>({formatSize(att.size)})</Text>
                  <DownloadOutlined style={{ fontSize: 11 }} />
                </a>
              ))}
            </Space>
          </div>
        )}

        {/* 본문 */}
        <div
          style={{ minHeight: 160, lineHeight: 1.8, fontSize: 14, color: token.colorText }}
          dangerouslySetInnerHTML={{ __html: mail.body || '<span style="color:#aaa;font-style:italic">(내용 없음)</span>' }}
        />

        {/* 댓글 섹션 */}
        <Divider style={{ margin: '24px 0 16px' }} />
        <div>
          <Space align="center" size={6} style={{ marginBottom: 12 }}>
            <MessageOutlined style={{ color: token.colorPrimary }} />
            <Text strong style={{ fontSize: 14 }}>댓글</Text>
            <Badge count={comments.length} showZero style={{ backgroundColor: token.colorPrimary }} />
          </Space>

          {/* 댓글 목록 */}
          {comments.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>아직 댓글이 없습니다. 메일 참여자끼리 의견을 남겨보세요.</Text>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              {comments.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                  <Avatar size={32} style={{ background: token.colorPrimary, flexShrink: 0, fontSize: 13 }}>
                    {(c.user?.displayName || '?').charAt(0)}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space size={6}>
                        <Text strong style={{ fontSize: 12 }}>{c.user?.displayName}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(c.createdAt).format('MM.DD HH:mm')}</Text>
                      </Space>
                      {(c.userId === user?.id || user?.role === 'admin') && (
                        <Popconfirm title="댓글을 삭제하시겠습니까?" onConfirm={() => handleDeleteComment(c.id)} okText="삭제" cancelText="취소">
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ height: 20, width: 20, minWidth: 20 }} />
                        </Popconfirm>
                      )}
                    </div>
                    <div style={{
                      marginTop: 4, padding: '8px 12px', borderRadius: 8,
                      background: token.colorFillAlter, fontSize: 13, lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: token.colorText,
                    }}>
                      {c.content}
                    </div>
                  </div>
                </div>
              ))}
            </Space>
          )}

          {/* 댓글 입력 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Input.TextArea
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              placeholder="댓글을 입력하세요 (Enter 등록 / Shift+Enter 줄바꿈)"
              autoSize={{ minRows: 1, maxRows: 4 }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); }
              }}
            />
            <Button
              type="primary" icon={<SendOutlined />}
              onClick={handleAddComment}
              loading={commentSubmitting}
              disabled={!commentInput.trim()}
            >
              등록
            </Button>
          </div>
        </div>
      </div>

      {/* 답장/전체답장/전달 모달 */}
      <ComposeModal
        open={!!composeMode}
        mode={composeMode}
        sourceMail={mail}
        onClose={() => setComposeMode(null)}
        onSent={() => { onRefresh?.(); setComposeMode(null); }}
      />
    </div>
  );
}
