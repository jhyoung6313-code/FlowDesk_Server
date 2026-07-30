import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button, Input, Tree, Modal, Dropdown, Empty, Spin, message, Popconfirm, Drawer,
  List, Avatar, Typography, Tooltip, Space, Select, Tag,
} from 'antd';
import {
  PlusOutlined, FileTextOutlined, MoreOutlined, EditOutlined, DeleteOutlined,
  HistoryOutlined, SaveOutlined, CloseOutlined, BookOutlined, CommentOutlined, SendOutlined, TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import RichEditor from '../../components/RichEditor';
import CollaborativeEditor from '../../components/CollaborativeEditor';
import SensitivityTag, { SENSITIVITY_OPTIONS } from '../../components/common/SensitivityTag';
import useAuthStore from '../../store/authStore';
import {
  getSpaces, createSpace, updateSpace, deleteSpace,
  getDoc, createDoc, updateDoc, deleteDoc,
  getVersions, restoreVersion,
  getComments, createComment, deleteComment,
} from '../../api/wiki';

// 플랫 문서 목록 → Ant Tree 데이터
function buildTree(docs) {
  const byParent = {};
  docs.forEach((d) => {
    const key = d.parentId ?? 'root';
    (byParent[key] = byParent[key] || []).push(d);
  });
  const make = (parent) =>
    (byParent[parent ?? 'root'] || []).map((d) => ({
      key: String(d.id),
      title: d.title || '제목 없음',
      icon: <FileTextOutlined />,
      children: make(d.id),
    }));
  return make(null);
}

export default function WikiPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('doc');
  const user = useAuthStore((s) => s.user);

  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftSensitivity, setDraftSensitivity] = useState('public');
  const [collab, setCollab] = useState(false); // 실시간 공동편집 모드(F-69)
  const [saving, setSaving] = useState(false);

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    try { setSpaces(await getSpaces()); }
    catch { message.error('위키를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSpaces(); }, [loadSpaces]);

  const loadDoc = useCallback(async (id) => {
    if (!id) { setDoc(null); return; }
    setDocLoading(true);
    setEditing(false);
    try {
      const [d, c] = await Promise.all([getDoc(id), getComments(id)]);
      setDoc(d); setComments(c);
    } catch (err) {
      message.error(err.response?.data?.error || '문서를 불러오지 못했습니다.');
      setDoc(null);
    } finally { setDocLoading(false); }
  }, []);

  useEffect(() => { loadDoc(selectedId); }, [selectedId, loadDoc]);

  const openDoc = (id) => setSearchParams({ doc: String(id) }, { replace: false });

  // ── 스페이스/문서 생성 ──
  const handleAddSpace = () => {
    let name = '';
    Modal.confirm({
      title: '새 스페이스',
      icon: <BookOutlined />,
      content: <Input placeholder="스페이스 이름" onChange={(e) => { name = e.target.value; }} />,
      onOk: async () => {
        if (!name.trim()) { message.warning('이름을 입력하세요.'); throw new Error(); }
        const s = await createSpace({ name: name.trim() });
        await loadSpaces();
        message.success('스페이스를 생성했습니다.');
        return s;
      },
    });
  };

  const handleAddDoc = async (spaceId, parentId = null) => {
    try {
      const d = await createDoc({ spaceId, parentId, title: '제목 없음' });
      await loadSpaces();
      openDoc(d.id);
      setEditing(true);
      setDraftTitle(d.title); setDraftContent('');
    } catch (err) { message.error(err.response?.data?.error || '문서 생성 실패'); }
  };

  const handleDeleteSpace = async (id) => {
    try { await deleteSpace(id); await loadSpaces(); message.success('삭제되었습니다.'); }
    catch (err) { message.error(err.response?.data?.error || '삭제 실패'); }
  };

  // ── 문서 편집 ──
  const startEdit = () => {
    setDraftTitle(doc.title);
    setDraftContent(doc.content || '');
    setDraftSensitivity(doc.sensitivity || 'public');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateDoc(doc.id, { title: draftTitle, content: draftContent, sensitivity: draftSensitivity });
      setDoc(updated); setEditing(false);
      await loadSpaces();
      message.success('저장되었습니다.');
    } catch (err) { message.error(err.response?.data?.error || '저장 실패'); }
    finally { setSaving(false); }
  };

  const handleDeleteDoc = async () => {
    try {
      await deleteDoc(doc.id);
      setSearchParams({}, { replace: true });
      setDoc(null);
      await loadSpaces();
      message.success('문서를 삭제했습니다.');
    } catch (err) { message.error(err.response?.data?.error || '삭제 실패'); }
  };

  // ── 버전 ──
  const openVersions = async () => {
    setVersionsOpen(true);
    try { setVersions(await getVersions(doc.id)); }
    catch { message.error('버전을 불러오지 못했습니다.'); }
  };
  const handleRestore = async (vid) => {
    try {
      const updated = await restoreVersion(doc.id, vid);
      setDoc(updated); setVersionsOpen(false);
      await loadSpaces();
      message.success('해당 버전으로 복원했습니다.');
    } catch (err) { message.error(err.response?.data?.error || '복원 실패'); }
  };

  // ── 댓글 ──
  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      const c = await createComment(doc.id, commentText.trim());
      setComments((cs) => [...cs, c]); setCommentText('');
    } catch (err) { message.error(err.response?.data?.error || '댓글 작성 실패'); }
  };
  const handleDeleteComment = async (cid) => {
    try { await deleteComment(cid); setComments((cs) => cs.filter((c) => c.id !== cid)); }
    catch (err) { message.error(err.response?.data?.error || '삭제 실패'); }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 96px)', gap: 0, border: '1px solid var(--fd-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--fd-surface)' }}>
      {/* ── 좌: 스페이스·문서 트리 ── */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--fd-border)', display: 'flex', flexDirection: 'column', background: 'var(--fd-surface-sunken)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--fd-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}><BookOutlined style={{ marginRight: 6 }} />위키</span>
          <Tooltip title="새 스페이스"><Button size="small" type="text" icon={<PlusOutlined />} onClick={handleAddSpace} /></Tooltip>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : spaces.length === 0 ? (
            <Empty description="스페이스가 없습니다" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 24 }}>
              <Button size="small" icon={<PlusOutlined />} onClick={handleAddSpace}>스페이스 만들기</Button>
            </Empty>
          ) : spaces.map((space) => (
            <div key={space.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px', fontWeight: 600, fontSize: 12, color: 'var(--fd-text-secondary)' }}>
                <span>{space.icon || '📁'} {space.name} {space.visibility === 'private' && <span style={{ fontSize: 12 }}>🔒</span>}</span>
                <Dropdown
                  trigger={['click']}
                  menu={{ items: [
                    { key: 'add', icon: <PlusOutlined />, label: '문서 추가', onClick: () => handleAddDoc(space.id) },
                    { key: 'del', icon: <DeleteOutlined />, danger: true, label: '스페이스 삭제',
                      onClick: () => Modal.confirm({ title: `"${space.name}" 삭제`, content: '스페이스와 하위 문서가 모두 삭제됩니다.', okType: 'danger', onOk: () => handleDeleteSpace(space.id) }) },
                  ] }}
                >
                  <Button size="small" type="text" icon={<MoreOutlined />} />
                </Dropdown>
              </div>
              {space.docs.length === 0 ? (
                <div style={{ padding: '2px 10px' }}>
                  <Button size="small" type="text" icon={<PlusOutlined />} style={{ fontSize: 12, color: 'var(--fd-text-secondary)' }} onClick={() => handleAddDoc(space.id)}>문서 추가</Button>
                </div>
              ) : (
                <Tree
                  showIcon
                  blockNode
                  selectedKeys={selectedId ? [selectedId] : []}
                  treeData={buildTree(space.docs)}
                  onSelect={(keys) => keys[0] && openDoc(keys[0])}
                  style={{ background: 'transparent', fontSize: 13 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 우: 문서 뷰/편집 ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="왼쪽에서 문서를 선택하거나 새로 만드세요" />
          </div>
        ) : docLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
        ) : !doc ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="문서를 찾을 수 없습니다" /></div>
        ) : (
          <>
            {/* 헤더 */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--fd-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              {editing ? (
                <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="문서 제목" style={{ fontSize: 18, fontWeight: 700, border: 'none', boxShadow: 'none', padding: 0 }} maxLength={200} />
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {doc.title}
                    <SensitivityTag value={doc.sensitivity} style={{ marginLeft: 8 }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fd-text-secondary)' }}>
                    {doc.creator?.displayName} · {dayjs(doc.updatedAt).format('YYYY-MM-DD HH:mm')} 수정
                  </div>
                </div>
              )}
              <Space>
                {editing ? (
                  <>
                    <Select value={draftSensitivity} onChange={setDraftSensitivity} style={{ width: 150 }} options={SENSITIVITY_OPTIONS} />
                    <Tooltip title="여러 명이 동시에 편집합니다(실시간 동기화)">
                      <Button type={collab ? 'primary' : 'default'} icon={<TeamOutlined />} onClick={() => setCollab((v) => !v)}>공동편집</Button>
                    </Tooltip>
                    <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>취소</Button>
                    <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>저장</Button>
                  </>
                ) : (
                  <>
                    <Tooltip title="변경 이력"><Button icon={<HistoryOutlined />} onClick={openVersions} /></Tooltip>
                    <Button icon={<EditOutlined />} onClick={startEdit}>편집</Button>
                    <Popconfirm title="문서를 삭제할까요?" description="하위 문서도 함께 삭제됩니다." okType="danger" onConfirm={handleDeleteDoc}>
                      <Button danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </>
                )}
              </Space>
            </div>

            {/* 본문 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {editing ? (
                collab ? (
                  <CollaborativeEditor
                    room={`wiki-doc-${doc.id}`}
                    initialHTML={doc.content || ''}
                    user={{ name: user?.displayName || '사용자' }}
                    onChange={setDraftContent}
                    minHeight={360}
                  />
                ) : (
                  <RichEditor defaultValue={draftContent} onChange={setDraftContent} minHeight={360} placeholder="문서 내용을 입력하세요…" />
                )
              ) : (
                <>
                  {(doc.content || '').trim() ? (
                    <div className="wiki-content" dangerouslySetInnerHTML={{ __html: doc.content }} />
                  ) : (
                    <Typography.Text type="secondary">내용이 없습니다. 편집을 눌러 작성하세요.</Typography.Text>
                  )}

                  {/* 댓글 */}
                  <div style={{ marginTop: 32, borderTop: '1px solid var(--fd-border)', paddingTop: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 10 }}><CommentOutlined /> 댓글 {comments.length > 0 && `(${comments.length})`}</div>
                    <List
                      dataSource={comments}
                      locale={{ emptyText: '첫 댓글을 남겨보세요.' }}
                      renderItem={(c) => (
                        <List.Item
                          actions={(user?.role === 'admin' || c.createdBy === user?.id)
                            ? [<a key="del" onClick={() => handleDeleteComment(c.id)}>삭제</a>] : []}
                        >
                          <List.Item.Meta
                            avatar={<Avatar style={{ background: c.author?.avatarColor || '#1677ff' }}>{c.author?.displayName?.[0]}</Avatar>}
                            title={<span>{c.author?.displayName} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--fd-text-secondary)' }}>{dayjs(c.createdAt).format('MM-DD HH:mm')}</span></span>}
                            description={<span style={{ whiteSpace: 'pre-wrap' }}>{c.content}</span>}
                          />
                        </List.Item>
                      )}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <Input.TextArea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        placeholder="댓글 입력…"
                        onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                      />
                      <Button type="primary" icon={<SendOutlined />} onClick={handleAddComment} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* 버전 이력 드로어 */}
      <Drawer title="변경 이력" open={versionsOpen} onClose={() => setVersionsOpen(false)} width={420}>
        <List
          dataSource={versions}
          locale={{ emptyText: '저장된 이전 버전이 없습니다.' }}
          renderItem={(v) => (
            <List.Item actions={[<Popconfirm key="r" title="이 버전으로 복원할까요?" onConfirm={() => handleRestore(v.id)}><a>복원</a></Popconfirm>]}>
              <List.Item.Meta
                title={v.title}
                description={<span>{v.editorName} · {dayjs(v.createdAt).format('YYYY-MM-DD HH:mm')}</span>}
              />
            </List.Item>
          )}
        />
      </Drawer>

      <style>{`
        .wiki-content { font-size: 14px; line-height: 1.8; color: var(--fd-text-primary); word-break: break-word; }
        .wiki-content h1 { font-size: 24px; font-weight: 700; margin: 18px 0 10px; }
        .wiki-content h2 { font-size: 20px; font-weight: 700; margin: 16px 0 8px; }
        .wiki-content h3 { font-size: 17px; font-weight: 600; margin: 14px 0 6px; }
        .wiki-content p { margin: 0 0 8px; }
        .wiki-content ul, .wiki-content ol { padding-left: 22px; margin: 6px 0; }
        .wiki-content a { color: #1677ff; text-decoration: underline; }
        .wiki-content img { max-width: 100%; height: auto; border-radius: 4px; }
        .wiki-content table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        .wiki-content table td, .wiki-content table th { border: 1px solid #d1d5db; padding: 6px 10px; }
        .wiki-content table th { background: #f8fafc; font-weight: 600; }
        .wiki-content blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; color: #6b7280; margin: 8px 0; }
      `}</style>
    </div>
  );
}
