import { useEffect, useState, useRef } from 'react';
import {
  Button, Space, Typography, Divider, Avatar,
  Upload, message, Popconfirm, Input, Spin, Tag, theme as antTheme, Card,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, PaperClipOutlined,
  SendOutlined, DownloadOutlined, PushpinOutlined, EyeOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import {
  getBbsPost, deleteBbsPost,
  getBbsComments, createBbsComment, updateBbsComment, deleteBbsComment,
  uploadBbsAttachment, deleteBbsAttachment, downloadBbsAttachmentUrl,
} from '../../api/bbs';
import PostFormDrawer from './PostFormDrawer';
import useAuthStore from '../../store/authStore';
import SensitivityTag from '../../components/common/SensitivityTag';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { useToken } = antTheme;

function getAvatarBg(color) { return color || '#1677ff'; }
function getInitial(name) { return name ? name[0].toUpperCase() : 'U'; }

function CommentItem({ comment, postId, isAdmin, userId, onReload, token }) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replyFile, setReplyFile] = useState(null);

  const handleUpdate = async () => {
    if (!editContent.trim()) return;
    try { await updateBbsComment(postId, comment.id, { content: editContent }); setEditing(false); onReload(); }
    catch { message.error('수정 실패'); }
  };

  const handleDelete = async () => {
    try { await deleteBbsComment(postId, comment.id); onReload(); }
    catch { message.error('삭제 실패'); }
  };

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    try {
      const created = await createBbsComment(postId, { content: replyContent, parentId: comment.id });
      if (replyFile) await uploadBbsAttachment(postId, replyFile, created.id);
      setReplyContent(''); setReplyFile(null); setReplyOpen(false); onReload();
    } catch { message.error('답글 작성 실패'); }
  };

  const canModify = isAdmin || comment.userId === userId;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Avatar size={34} style={{ background: getAvatarBg(comment.user?.avatarColor), flexShrink: 0, fontSize: 13 }}>
          {getInitial(comment.user?.displayName)}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={6} style={{ marginBottom: 4 }}>
            <Text strong style={{ fontSize: 13 }}>{comment.user?.displayName}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ClockCircleOutlined style={{ marginRight: 3 }} />
              {dayjs(comment.createdAt).format('MM.DD HH:mm')}
            </Text>
          </Space>

          {editing ? (
            <div>
              <TextArea value={editContent} onChange={e => setEditContent(e.target.value)} autoSize={{ minRows: 2 }} style={{ marginBottom: 6 }} />
              <Space size={6}>
                <Button size="small" type="primary" onClick={handleUpdate}>저장</Button>
                <Button size="small" onClick={() => setEditing(false)}>취소</Button>
              </Space>
            </div>
          ) : (
            <div style={{
              background: token.colorBgLayout,
              borderRadius: token.borderRadius,
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              color: token.colorText,
            }}>
              {comment.content}
            </div>
          )}

          {comment.attachments?.map(att => (
            <div key={att.id} style={{ marginTop: 4 }}>
              <a href={downloadBbsAttachmentUrl(postId, att.id)} download={att.originalName} style={{ fontSize: 12, color: token.colorPrimary }}>
                <PaperClipOutlined style={{ marginRight: 4 }} />{att.originalName}
              </a>
            </div>
          ))}

          <Space size={10} style={{ marginTop: 6 }}>
            <Button type="link" size="small" style={{ padding: 0, fontSize: 12, height: 'auto' }} onClick={() => setReplyOpen(v => !v)}>
              답글
            </Button>
            {canModify && !editing && (
              <>
                <Button type="link" size="small" style={{ padding: 0, fontSize: 12, height: 'auto' }} onClick={() => setEditing(true)}>수정</Button>
                <Popconfirm title="삭제하시겠습니까?" onConfirm={handleDelete} okText="삭제" cancelText="취소">
                  <Button type="link" size="small" danger style={{ padding: 0, fontSize: 12, height: 'auto' }}>삭제</Button>
                </Popconfirm>
              </>
            )}
          </Space>

          {replyOpen && (
            <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: `3px solid ${token.colorBorderSecondary}` }}>
              <TextArea value={replyContent} onChange={e => setReplyContent(e.target.value)} placeholder="답글을 입력하세요" autoSize={{ minRows: 2 }} style={{ marginBottom: 6 }} />
              <Space size={6}>
                <Upload beforeUpload={f => { setReplyFile(f); return false; }} showUploadList={false}>
                  <Button size="small" icon={<PaperClipOutlined />}>파일</Button>
                </Upload>
                {replyFile && <Text style={{ fontSize: 12 }}>{replyFile.name} <Button type="link" size="small" danger onClick={() => setReplyFile(null)} style={{ padding: 0 }}>✕</Button></Text>}
                <Button size="small" type="primary" icon={<SendOutlined />} onClick={handleReply}>등록</Button>
                <Button size="small" onClick={() => { setReplyOpen(false); setReplyFile(null); }}>취소</Button>
              </Space>
            </div>
          )}
        </div>
      </div>

      {/* 대댓글 */}
      {comment.replies?.map(reply => (
        <div key={reply.id} style={{ marginLeft: 44, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Avatar size={28} style={{ background: getAvatarBg(reply.user?.avatarColor), flexShrink: 0, fontSize: 12 }}>
              {getInitial(reply.user?.displayName)}
            </Avatar>
            <div style={{ flex: 1 }}>
              <Space size={6} style={{ marginBottom: 4 }}>
                <Text strong style={{ fontSize: 12 }}>{reply.user?.displayName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(reply.createdAt).format('MM.DD HH:mm')}</Text>
              </Space>
              <div style={{ background: token.colorBgLayout, borderRadius: token.borderRadius, padding: '6px 10px', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: token.colorText }}>
                {reply.content}
              </div>
              {reply.attachments?.map(att => (
                <div key={att.id} style={{ marginTop: 2 }}>
                  <a href={downloadBbsAttachmentUrl(postId, att.id)} download={att.originalName} style={{ fontSize: 12, color: token.colorPrimary }}>
                    <PaperClipOutlined style={{ marginRight: 4 }} />{att.originalName}
                  </a>
                </div>
              ))}
              {(isAdmin || reply.userId === userId) && (
                <Popconfirm title="삭제하시겠습니까?" onConfirm={async () => { await deleteBbsComment(postId, reply.id); onReload(); }} okText="삭제" cancelText="취소">
                  <Button type="link" size="small" danger style={{ padding: 0, fontSize: 12, height: 'auto', marginTop: 4 }}>삭제</Button>
                </Popconfirm>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PostDetail({ postId, onBack, onChanged }) {
  const id = postId;
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const { token } = useToken();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [commentFile, setCommentFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  const loadPost = async () => {
    try { const data = await getBbsPost(id); setPost(data); }
    catch { message.error('게시글을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  };

  const loadComments = async () => {
    try { const data = await getBbsComments(id); setComments(data); }
    catch {}
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setPost(null);
    loadPost();
    loadComments();
  }, [id]);

  const handleDelete = async () => {
    try {
      await deleteBbsPost(id);
      message.success('삭제되었습니다.');
      onChanged?.();
      onBack?.();
    }
    catch { message.error('삭제 실패'); }
  };

  const handleDeleteAttachment = async (aid) => {
    try { await deleteBbsAttachment(id, aid); loadPost(); }
    catch { message.error('첨부파일 삭제 실패'); }
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const created = await createBbsComment(id, { content: newComment });
      if (commentFile) await uploadBbsAttachment(id, commentFile, created.id);
      setNewComment(''); setCommentFile(null); loadComments();
    } catch { message.error('댓글 작성 실패'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!post) return <div style={{ padding: 40, textAlign: 'center', color: token.colorTextTertiary }}>게시글을 찾을 수 없습니다.</div>;

  const canModify = isAdmin || post.createdBy === user?.id;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 28px 24px' }}>
      <style>{`
        .bbs-post-content img { max-width: 100%; height: auto; border-radius: 4px; }
        .bbs-post-content table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .bbs-post-content table td, .bbs-post-content table th { border: 1px solid ${token.colorBorderSecondary}; padding: 6px 10px; }
        .bbs-post-content table th { background: ${token.colorFillAlter}; font-weight: 600; }
        .bbs-post-content a { color: ${token.colorPrimary}; text-decoration: underline; }
        .bbs-post-content ul, .bbs-post-content ol { padding-left: 22px; margin: 6px 0; }
        .bbs-post-content blockquote { border-left: 3px solid ${token.colorBorder}; padding-left: 12px; color: ${token.colorTextSecondary}; margin: 8px 0; }
        .bbs-post-content p { margin: 0 0 8px; }
      `}</style>
      {/* 툴바 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>목록</Button>
        {canModify && (
          <Space size={6}>
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditDrawerOpen(true)}>수정</Button>
            <Popconfirm title="삭제하시겠습니까?" onConfirm={handleDelete} okText="삭제" cancelText="취소">
              <Button size="small" danger icon={<DeleteOutlined />}>삭제</Button>
            </Popconfirm>
          </Space>
        )}
      </div>

      {/* 본문 카드 */}
      <Card
        bordered={false}
        style={{ marginBottom: 16, boxShadow: `0 1px 4px ${token.colorBorderSecondary}` }}
        bodyStyle={{ padding: '24px 28px' }}
      >
        {/* 제목 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {post.isPinned && <Tag icon={<PushpinOutlined />} color="warning" style={{ margin: 0 }}>공지</Tag>}
          <SensitivityTag value={post.sensitivity} style={{ margin: 0 }} />
          {post.category?.name && (
            <Tag style={{ margin: 0, color: token.colorTextSecondary }}>{post.category.name}</Tag>
          )}
          <Title level={3} style={{ margin: 0, wordBreak: 'break-word', flex: '1 1 100%' }}>{post.title}</Title>
        </div>

        {/* 작성자 정보 (메일 열람 스타일) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 16,
          marginBottom: 16,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}>
          <Avatar size={40} style={{ background: getAvatarBg(post.creator?.avatarColor), flexShrink: 0 }}>
            {getInitial(post.creator?.displayName)}
          </Avatar>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text strong style={{ fontSize: 13 }}>{post.creator?.displayName || '-'}</Text>
            <div style={{ marginTop: 2 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <EyeOutlined style={{ marginRight: 4 }} />조회 {post.viewCount}
              </Text>
            </div>
          </div>
          <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {dayjs(post.createdAt).format('YYYY.MM.DD HH:mm')}
          </Text>
        </div>

        {/* 공문 메타정보 (발신처 / 처리기한 / 수신부서) */}
        {(post.senderOrg || post.officialDueDate || post.recipientDepts?.length > 0) && (
          <div style={{
            paddingBottom: 16,
            marginBottom: 20,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            rowGap: 10,
            columnGap: 20,
            alignItems: 'center',
            fontSize: 13,
          }}>
            {post.senderOrg && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>발신처</Text>
                <Text>{post.senderOrg}</Text>
              </>
            )}
            {post.officialDueDate && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>공문 처리기한</Text>
                <Text>{dayjs(post.officialDueDate).format('YYYY.MM.DD')}</Text>
              </>
            )}
            {post.recipientDepts?.length > 0 && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>수신부서</Text>
                <Space size={[4, 4]} wrap>
                  {post.recipientDepts.map(d => <Tag key={d} style={{ margin: 0 }}>{d}</Tag>)}
                </Space>
              </>
            )}
          </div>
        )}

        {/* 첨부파일 (메일 열람 스타일) */}
        {post.attachments?.length > 0 && (
          <div style={{
            marginBottom: 24,
            padding: '10px 16px',
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 8,
          }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              <PaperClipOutlined /> 첨부파일 ({post.attachments.length})
            </Text>
            <Space wrap>
              {post.attachments.map(att => (
                <div key={att.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 6,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  fontSize: 12,
                }}>
                  <PaperClipOutlined style={{ color: token.colorTextTertiary }} />
                  <a href={downloadBbsAttachmentUrl(id, att.id)} download={att.originalName} style={{ color: token.colorText }}>
                    {att.originalName}
                  </a>
                  <Text type="secondary" style={{ fontSize: 12 }}>({(att.size / 1024).toFixed(0)}KB)</Text>
                  {(isAdmin || att.uploadedBy === user?.id) && (
                    <Popconfirm title="삭제?" onConfirm={() => handleDeleteAttachment(att.id)} okText="삭제" cancelText="취소">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ width: 18, height: 18, padding: 0 }} />
                    </Popconfirm>
                  )}
                </div>
              ))}
            </Space>
          </div>
        )}

        {/* 본문 */}
        <div
          className="bbs-post-content"
          style={{ minHeight: 240, fontSize: 13, lineHeight: 1.9, color: token.colorText }}
          dangerouslySetInnerHTML={{ __html: post.content || '<span style="color:#aaa;font-style:italic">(내용 없음)</span>' }}
        />
      </Card>

      {/* 댓글 섹션 */}
      <Card
        bordered={false}
        style={{ boxShadow: `0 1px 4px ${token.colorBorderSecondary}` }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Text strong style={{ fontSize: 13 }}>
          댓글 <Text style={{ color: token.colorPrimary }}>{comments.length}</Text>
        </Text>

        <div style={{ marginTop: 16 }}>
          {comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: token.colorTextTertiary, fontSize: 13 }}>
              첫 번째 댓글을 남겨보세요.
            </div>
          ) : (
            comments.map((c, idx) => (
              <div key={c.id}>
                {idx > 0 && <Divider style={{ margin: '10px 0' }} />}
                <CommentItem comment={c} postId={id} isAdmin={isAdmin} userId={user?.id} onReload={loadComments} token={token} />
              </div>
            ))
          )}
        </div>

        <Divider style={{ margin: '16px 0' }} />

        {/* 댓글 작성 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Avatar size={34} style={{ background: getAvatarBg(user?.avatarColor), flexShrink: 0, fontSize: 13 }}>
            {getInitial(user?.displayName)}
          </Avatar>
          <div style={{ flex: 1 }}>
            <TextArea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요 (Shift+Enter로 줄 바꿈)"
              autoSize={{ minRows: 2, maxRows: 6 }}
              style={{ marginBottom: 8 }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={6}>
                <Upload beforeUpload={f => { setCommentFile(f); return false; }} showUploadList={false}>
                  <Button size="small" icon={<PaperClipOutlined />}>파일 첨부</Button>
                </Upload>
                {commentFile && (
                  <Text style={{ fontSize: 12 }}>
                    {commentFile.name}
                    <Button type="link" size="small" danger onClick={() => setCommentFile(null)} style={{ padding: '0 4px' }}>✕</Button>
                  </Text>
                )}
              </Space>
              <Button
                type="primary" size="small"
                icon={<SendOutlined />}
                loading={submitting}
                onClick={handleComment}
                disabled={!newComment.trim()}
              >
                등록
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 게시글 수정 드로어 */}
      <PostFormDrawer
        open={editDrawerOpen}
        postId={Number(id)}
        onClose={() => setEditDrawerOpen(false)}
        onSaved={() => { setEditDrawerOpen(false); loadPost(); onChanged?.(); }}
      />
    </div>
  );
}
