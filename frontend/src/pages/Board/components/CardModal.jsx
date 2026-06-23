import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Drawer, Form, Input, Select, DatePicker, Checkbox, Button, Tag, Space,
  Typography, Divider, message, Upload, Avatar, Tooltip, Progress,
  Slider, Popconfirm, Tabs,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PaperClipOutlined, LinkOutlined,
  CheckSquareOutlined, CommentOutlined, UserOutlined, DownloadOutlined,
  CloseOutlined, PictureOutlined, BgColorsOutlined,
} from '@ant-design/icons';
import RichEditor from '../../../components/RichEditor';
import dayjs from 'dayjs';
import {
  createCard, updateCard, updateCardProperties,
  createCardComment, updateCardComment, deleteCardComment,
  uploadCardAttachment, uploadCommentAttachment, downloadCardAttachmentUrl, deleteCardAttachment,
  createChecklistItem, updateChecklistItem, deleteChecklistItem,
  uploadCoverImage, deleteCoverImage,
  duplicateCard, addDependency, removeDependency, getDependencies, linkTask,
} from '../../../api/boards';
import { getTasks } from '../../../api/tasks';
import useAuthStore from '../../../store/authStore';
import { getAvatarColor } from '../../../utils/colors';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../../utils/userOptions';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const BACKEND = import.meta.env.DEV ? 'http://localhost:4000' : '';

const LABEL_STYLE = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fd-text-secondary)',
  display: 'block',
  marginBottom: 4,
};

const COVER_COLORS = [
  '#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1',
  '#13c2c2', '#fa8c16', '#eb2f96', '#595959', '#f0f0f0',
];

const STATUS_OPTIONS = [
  { value: 'todo',        label: '예정',   color: '#8c8c8c' },
  { value: 'in_progress', label: '진행중', color: '#1677ff' },
  { value: 'review',      label: '검토중', color: '#722ed1' },
  { value: 'done',        label: '완료',   color: '#52c41a' },
  { value: 'hold',        label: '보류',   color: '#fa8c16' },
  { value: 'cancelled',   label: '취소',   color: '#ff4d4f' },
];

const PRIORITY_OPTIONS = [
  { value: 'high',   label: '높음', color: '#ff4d4f' },
  { value: 'normal', label: '보통', color: '#1677ff' },
  { value: 'low',    label: '낮음', color: '#8c8c8c' },
];

const AUTO_PROP_TYPES = ['created_time', 'created_by'];

function SectionTitle({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <span style={{ color: 'var(--fd-text-muted)' }}>{icon}</span>
      <Text strong style={{ fontSize: 14, color: 'var(--fd-text-primary)' }}>{text}</Text>
    </div>
  );
}

function PropertyInput({ property, value, onChange, users, card }) {
  const parsed = (() => {
    if (value === null || value === undefined || value === '') return null;
    try { return JSON.parse(value); } catch { return value; }
  })();

  const emit = (v) => {
    if (v === null || v === undefined) onChange('');
    else if (typeof v === 'object') onChange(JSON.stringify(v));
    else onChange(String(v));
  };

  // 자동 속성 - 읽기 전용
  if (property.type === 'created_time') {
    const date = card?.createdAt;
    return <Text style={{ fontSize: 13, color: 'var(--fd-text-muted)' }}>{date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '카드 저장 후 표시'}</Text>;
  }
  if (property.type === 'created_by') {
    const creator = card?.creator;
    if (!creator) return <Text style={{ fontSize: 13, color: 'var(--fd-text-muted)' }}>카드 저장 후 표시</Text>;
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Avatar size={20} style={{ backgroundColor: creator.avatarColor || '#1677ff', fontSize: 11 }}>
          {creator.displayName?.[0]}
        </Avatar>
        <Text style={{ fontSize: 13 }}>{creator.displayName}</Text>
      </span>
    );
  }

  if (property.type === 'text') return <Input value={parsed ?? ''} onChange={e => emit(e.target.value)} />;
  if (property.type === 'number') return <Input type="number" value={parsed ?? ''} onChange={e => emit(e.target.value)} style={{ width: '100%' }} />;
  if (property.type === 'checkbox') return <Checkbox checked={parsed === true || parsed === 'true'} onChange={e => emit(e.target.checked)} />;
  if (property.type === 'url') return <Input value={parsed ?? ''} onChange={e => emit(e.target.value)} placeholder="https://" />;
  if (property.type === 'email') return <Input type="email" value={parsed ?? ''} onChange={e => emit(e.target.value)} placeholder="user@example.com" />;
  if (property.type === 'phone') return <Input type="tel" value={parsed ?? ''} onChange={e => emit(e.target.value)} placeholder="010-0000-0000" />;
  if (property.type === 'date') {
    return (
      <DatePicker
        style={{ width: '100%' }}
        value={parsed ? dayjs(parsed) : null}
        onChange={v => emit(v ? v.format('YYYY-MM-DD') : '')}
      />
    );
  }
  if (property.type === 'select') {
    const opts = property.options ?? [];
    return (
      <Select style={{ width: '100%' }} value={parsed ?? undefined} allowClear onChange={v => emit(v ?? '')}>
        {opts.map(o => <Select.Option key={o.id} value={o.value}><Tag color={o.color}>{o.value}</Tag></Select.Option>)}
      </Select>
    );
  }
  if (property.type === 'multiselect') {
    const opts = property.options ?? [];
    const vals = Array.isArray(parsed) ? parsed : [];
    return (
      <Select mode="multiple" style={{ width: '100%' }} value={vals} onChange={v => emit(v)}>
        {opts.map(o => <Select.Option key={o.id} value={o.value}><Tag color={o.color}>{o.value}</Tag></Select.Option>)}
      </Select>
    );
  }
  if (property.type === 'user') {
    const vals = Array.isArray(parsed) ? parsed.map(u => (typeof u === 'object' ? u.id : u)) : [];
    return (
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        value={vals}
        showSearch
        filterOption={filterUserOption}
        placeholder="이름·부서로 검색"
        onChange={ids => {
          const selected = ids.map(id => {
            const u = users.find(u => u.id === id);
            return u ? { id: u.id, displayName: u.displayName, avatarColor: u.avatarColor } : { id };
          });
          emit(selected);
        }}
        options={buildUserOptions(users, getMyDepartment())}
      />
    );
  }
  return <Input value={parsed ?? ''} onChange={e => emit(e.target.value)} />;
}

// @멘션 파싱: "@이름" 패턴에서 userId 추출
function parseMentions(text, users) {
  const mentions = [];
  const regex = /@(\S+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const user = users.find(u =>
      u.displayName === name ||
      u.displayName?.replace(/\s/g, '') === name ||
      u.username === name
    );
    if (user) mentions.push(user.id);
  }
  return [...new Set(mentions)];
}

export default function CardModal({ open, onClose, onSave, boardId, properties, card, users }) {
  const { user: currentUser } = useAuthStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverColor, setCoverColor] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [coverTab, setCoverTab] = useState('color'); // 'color' | 'image'
  const [startDate, setStartDate] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('normal');
  const [progress, setProgress] = useState(0);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [relatedAssigneeIds, setRelatedAssigneeIds] = useState([]);
  const [propValues, setPropValues] = useState({});

  const [links, setLinks] = useState([]);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const [checklists, setChecklists] = useState([]);
  const [newCheckContent, setNewCheckContent] = useState('');

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');

  const [attachments, setAttachments] = useState([]);
  const [commentFile, setCommentFile] = useState(null);
  const [commentUploading, setCommentUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const commentFileInputRef = useRef(null);

  // 의존성
  const [dependencies, setDependencies] = useState({ dependsOn: [], blocks: [] });
  const [depSearch, setDepSearch] = useState('');
  const [allCards, setAllCards] = useState([]);

  // 업무 연결
  const [allTasks, setAllTasks] = useState([]);
  const [taskSearch, setTaskSearch] = useState('');
  const [linkedTask, setLinkedTask] = useState(null);
  const [taskLinking, setTaskLinking] = useState(false);

  const isEdit = !!card?.id;

  useEffect(() => {
    if (!open) return;
    if (card) {
      setTitle(card.title ?? '');
      setDescription(card.description ?? '');
      setCoverColor(card.coverColor ?? null);
      setCoverImageUrl(card.coverImageUrl ?? null);
      setStartDate(card.startDate ? dayjs(card.startDate) : null);
      setDueDate(card.dueDate ? dayjs(card.dueDate) : null);
      setStatus(card.status ?? 'todo');
      setPriority(card.priority ?? 'normal');
      setProgress(card.progress ?? 0);

      const assignees = (card.assignees ?? []).filter(a => a.type === 'assignee').map(a => a.userId ?? a.user?.id);
      const related = (card.assignees ?? []).filter(a => a.type === 'related').map(a => a.userId ?? a.user?.id);
      setAssigneeIds(assignees);
      setRelatedAssigneeIds(related);

      const vals = {};
      (card.properties ?? []).forEach(pv => { vals[pv.propertyId] = pv.value ?? ''; });
      setPropValues(vals);

      setLinks((card.links ?? []).map(l => ({ ...l })));
      setChecklists((card.checklists ?? []).map(c => ({ ...c })));
      setComments((card.comments ?? []).map(c => ({ ...c })));
      setAttachments((card.attachments ?? []).map(a => ({ ...a })));
      setLinkedTask(card.linkedTask ?? null);
      // 의존성 로드
      if (card.id) {
        getDependencies(boardId, card.id).then(setDependencies).catch(() => {});
        // 보드 전체 카드 (의존성 검색용)
        import('../../../api/boards').then(({ getCards }) =>
          getCards(boardId).then(cs => setAllCards(cs.filter(c => c.id !== card.id)))
        );
      }
    } else {
      setTitle(''); setDescription(''); setCoverColor(null); setCoverImageUrl(null);
      setStartDate(null); setDueDate(null); setStatus('todo'); setPriority('normal'); setProgress(0);
      setAssigneeIds([]); setRelatedAssigneeIds([]); setPropValues({});
      setLinks([]); setChecklists([]); setComments([]); setAttachments([]);
      setDependencies({ dependsOn: [], blocks: [] });
      setLinkedTask(null);
    }
    setNewLinkTitle(''); setNewLinkUrl(''); setNewCheckContent('');
    setNewComment(''); setEditingCommentId(null); setCommentFile(null);
    setDepSearch(''); setTaskSearch('');
  }, [open, card]);

  const handleSave = async () => {
    if (!title.trim()) { message.warning('카드 제목을 입력하세요.'); return; }
    setSaving(true);
    try {
      const payload = {
        title, description, coverColor, coverImageUrl,
        startDate: startDate ? startDate.format('YYYY-MM-DD') : null,
        dueDate: dueDate ? dueDate.format('YYYY-MM-DD') : null,
        status, priority, progress, assigneeIds, relatedAssigneeIds,
        links: links.map(({ title: lt, url }) => ({ title: lt, url })),
      };

      let saved;
      if (isEdit) {
        saved = await updateCard(boardId, card.id, payload);
        await updateCardProperties(boardId, card.id, propValues);
        saved = await refetchCard(card.id);
      } else {
        payload.propertyValues = propValues;
        payload.checklists = checklists.map(({ content, checked }) => ({ content, checked }));
        saved = await createCard(boardId, payload);
      }
      onSave(saved);
      onClose();
    } catch (err) {
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const refetchCard = async (cardId) => {
    const { getCards } = await import('../../../api/boards');
    const cards = await getCards(boardId);
    return cards.find(c => c.id === cardId) ?? card;
  };

  // ─── 커버 이미지 ──────────────────────────────────────────────────────────────
  const handleCoverImageUpload = async ({ file }) => {
    if (!isEdit) {
      message.info('카드를 먼저 저장한 뒤 이미지를 업로드하세요.');
      return false;
    }
    setCoverUploading(true);
    try {
      const result = await uploadCoverImage(boardId, card.id, file);
      setCoverImageUrl(result.coverImageUrl);
      message.success('커버 이미지가 업로드되었습니다.');
    } catch {
      message.error('이미지 업로드에 실패했습니다.');
    } finally {
      setCoverUploading(false);
    }
    return false;
  };

  const handleCoverImageDelete = async () => {
    if (!isEdit) { setCoverImageUrl(null); return; }
    try {
      await deleteCoverImage(boardId, card.id);
      setCoverImageUrl(null);
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  // ─── 링크 ────────────────────────────────────────────────────────────────────
  const addLink = () => {
    if (!newLinkUrl.trim()) { message.warning('URL을 입력하세요.'); return; }
    setLinks(prev => [...prev, { id: Date.now(), title: newLinkTitle, url: newLinkUrl }]);
    setNewLinkTitle(''); setNewLinkUrl('');
  };
  const removeLink = (id) => setLinks(prev => prev.filter(l => l.id !== id));

  // ─── 체크리스트 ───────────────────────────────────────────────────────────────
  const addChecklistLocal = () => {
    if (!newCheckContent.trim()) return;
    setChecklists(prev => [...prev, { id: Date.now(), content: newCheckContent, checked: false }]);
    setNewCheckContent('');
  };
  const toggleChecklistLocal = (id) =>
    setChecklists(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  const removeChecklistLocal = (id) => setChecklists(prev => prev.filter(item => item.id !== id));

  const addChecklistRemote = async () => {
    if (!newCheckContent.trim()) return;
    try {
      const item = await createChecklistItem(boardId, card.id, newCheckContent);
      setChecklists(prev => [...prev, item]);
      setNewCheckContent('');
    } catch { message.error('추가에 실패했습니다.'); }
  };
  const toggleChecklistRemote = async (item) => {
    try {
      const updated = await updateChecklistItem(boardId, card.id, item.id, { checked: !item.checked });
      setChecklists(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch { message.error('변경에 실패했습니다.'); }
  };
  const removeChecklistRemote = async (itemId) => {
    try {
      await deleteChecklistItem(boardId, card.id, itemId);
      setChecklists(prev => prev.filter(c => c.id !== itemId));
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  // ─── 댓글 (@멘션 포함) ────────────────────────────────────────────────────────
  const submitComment = async () => {
    if (!newComment.trim() && !commentFile) return;
    setCommentUploading(true);
    try {
      const content = newComment.trim() || '📎';
      const mentions = parseMentions(content, users);
      let comment = await createCardComment(boardId, card.id, content, mentions);

      if (commentFile) {
        try {
          const att = await uploadCommentAttachment(boardId, card.id, comment.id, commentFile.file);
          comment = { ...comment, attachments: [att] };
        } catch {
          message.error('파일 업로드에 실패했습니다.');
        }
      }

      setComments(prev => [...prev, comment]);
      setNewComment('');
      setCommentFile(null);
    } catch { message.error('댓글 등록에 실패했습니다.'); }
    finally { setCommentUploading(false); }
  };

  const saveEditComment = async (commentId) => {
    if (!editingCommentContent.trim()) return;
    try {
      const updated = await updateCardComment(boardId, card.id, commentId, editingCommentContent);
      setComments(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditingCommentId(null);
    } catch { message.error('수정에 실패했습니다.'); }
  };

  const removeComment = async (commentId) => {
    try {
      await deleteCardComment(boardId, card.id, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  // ─── 첨부파일 ─────────────────────────────────────────────────────────────────
  const handleUpload = async ({ file }) => {
    try {
      const att = await uploadCardAttachment(boardId, card.id, file);
      setAttachments(prev => [...prev, att]);
      message.success('파일이 업로드되었습니다.');
    } catch { message.error('업로드에 실패했습니다.'); }
    return false;
  };

  const removeAttachment = async (attId) => {
    try {
      await deleteCardAttachment(boardId, card.id, attId);
      setAttachments(prev => prev.filter(a => a.id !== attId));
      message.success('파일이 삭제되었습니다.');
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  // ─── 카드 복제 ────────────────────────────────────────────────────────────────
  const handleDuplicate = async () => {
    if (!isEdit) return;
    setDuplicating(true);
    try {
      const dup = await duplicateCard(boardId, card.id);
      message.success(`"${dup.title}" 카드가 복제되었습니다.`);
      onClose();
    } catch { message.error('복제에 실패했습니다.'); }
    finally { setDuplicating(false); }
  };

  // ─── 의존성 ───────────────────────────────────────────────────────────────────
  const handleAddDependency = async (blockingId) => {
    try {
      const dep = await addDependency(boardId, card.id, blockingId);
      setDependencies(prev => ({ ...prev, dependsOn: [...prev.dependsOn, dep] }));
      setDepSearch('');
      message.success('의존성이 추가되었습니다.');
    } catch (err) {
      message.error(err?.response?.data?.error || '추가에 실패했습니다.');
    }
  };

  const handleRemoveDependency = async (depId) => {
    try {
      await removeDependency(boardId, card.id, depId);
      setDependencies(prev => ({ ...prev, dependsOn: prev.dependsOn.filter(d => d.id !== depId) }));
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  // ─── 업무 연결 ────────────────────────────────────────────────────────────────
  const loadTasks = async () => {
    if (allTasks.length > 0) return;
    try { setAllTasks(await getTasks()); } catch {}
  };

  const handleLinkTask = async (taskId) => {
    setTaskLinking(true);
    try {
      await linkTask(boardId, card.id, taskId);
      const task = allTasks.find(t => t.id === taskId);
      setLinkedTask(task ? { id: task.id, title: task.title, status: task.status } : null);
      message.success('업무가 연결되었습니다.');
      setTaskSearch('');
    } catch { message.error('연결에 실패했습니다.'); }
    finally { setTaskLinking(false); }
  };

  const handleUnlinkTask = async () => {
    setTaskLinking(true);
    try {
      await linkTask(boardId, card.id, null);
      setLinkedTask(null);
      message.success('업무 연결이 해제되었습니다.');
    } catch { message.error('해제에 실패했습니다.'); }
    finally { setTaskLinking(false); }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const checkedCount = checklists.filter(c => c.checked).length;
  const visibleProperties = properties.filter(p => !AUTO_PROP_TYPES.includes(p.type));
  const autoProperties = properties.filter(p => AUTO_PROP_TYPES.includes(p.type));

  const hasCover = coverColor || coverImageUrl;

  return (
    <Drawer
      title={null}
      open={open}
      onClose={onClose}
      width={720}
      styles={{ body: { padding: 0 }, header: { display: 'none' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            {isEdit && (
              <Button onClick={handleDuplicate} loading={duplicating}>
                복제
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onClose}>취소</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              {isEdit ? '수정 저장' : '카드 생성'}
            </Button>
          </div>
        </div>
      }
    >
      {/* 커버 영역 */}
      {hasCover && (
        <div style={{ height: 100, position: 'relative', overflow: 'hidden' }}>
          {coverImageUrl
            ? <img src={`${BACKEND}${coverImageUrl}`} alt="커버" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ height: '100%', background: coverColor }} />
          }
        </div>
      )}

      <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
        {/* 커버 설정 */}
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL_STYLE}>커버</label>
          <Tabs
            size="small"
            activeKey={coverTab}
            onChange={setCoverTab}
            style={{ marginTop: 6 }}
            items={[
              {
                key: 'color',
                label: <span><BgColorsOutlined /> 색상</span>,
                children: (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {COVER_COLORS.map(c => (
                      <div
                        key={c}
                        onClick={() => { setCoverColor(coverColor === c ? null : c); setCoverImageUrl(null); }}
                        style={{
                          width: 26, height: 26, borderRadius: 4, background: c, cursor: 'pointer',
                          border: coverColor === c ? '2px solid #1677ff' : '2px solid transparent',
                          boxSizing: 'border-box',
                        }}
                      />
                    ))}
                    {coverColor && (
                      <Button size="small" type="text" onClick={() => setCoverColor(null)}>제거</Button>
                    )}
                  </div>
                ),
              },
              {
                key: 'image',
                label: <span><PictureOutlined /> 이미지</span>,
                children: (
                  <div>
                    {coverImageUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img
                          src={`${BACKEND}${coverImageUrl}`}
                          alt="커버"
                          style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 4 }}
                        />
                        <Button danger size="small" onClick={handleCoverImageDelete}>제거</Button>
                      </div>
                    ) : (
                      <Upload
                        showUploadList={false}
                        accept="image/*"
                        beforeUpload={(file) => { handleCoverImageUpload({ file }); return false; }}
                      >
                        <Button size="small" icon={<PlusOutlined />} loading={coverUploading}>
                          이미지 업로드
                        </Button>
                      </Upload>
                    )}
                    {!isEdit && (
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                        카드 저장 후 이미지 업로드가 가능합니다.
                      </Text>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 카드 번호 */}
        {isEdit && card?.cardNumber && (
          <div style={{ marginBottom: 8 }}>
            <Tag style={{ fontSize: 12, fontFamily: 'monospace', color: '#8c8c8c' }}>
              #{card.cardNumber}
            </Tag>
          </div>
        )}

        {/* 제목 */}
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL_STYLE}>제목 <span style={{ color: '#ff4d4f' }}>*</span></label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="카드 제목"
            style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}
            size="large"
          />
        </div>

        {/* 설명 */}
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL_STYLE}>설명</label>
          <RichEditor
            key={card?.id ?? 'new'}
            defaultValue={description}
            onChange={setDescription}
            placeholder="카드 설명 (선택)"
            minHeight={72}
            style={{ marginTop: 4 }}
          />
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 일정 / 상태 / 우선순위 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={LABEL_STYLE}>시작일자</label>
            <DatePicker style={{ width: '100%' }} value={startDate} onChange={setStartDate} placeholder="시작일 선택" />
          </div>
          <div>
            <label style={LABEL_STYLE}>종료예정일</label>
            <DatePicker style={{ width: '100%' }} value={dueDate} onChange={setDueDate} placeholder="종료일 선택" />
          </div>
          <div>
            <label style={LABEL_STYLE}>상태</label>
            <Select style={{ width: '100%' }} value={status} onChange={setStatus}>
              {STATUS_OPTIONS.map(s => (
                <Select.Option key={s.value} value={s.value}>
                  <Tag color={s.color} style={{ marginRight: 0 }}>{s.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <label style={LABEL_STYLE}>우선순위</label>
            <Select style={{ width: '100%' }} value={priority} onChange={setPriority}>
              {PRIORITY_OPTIONS.map(p => (
                <Select.Option key={p.value} value={p.value}>
                  <Tag color={p.color} style={{ marginRight: 0 }}>{p.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>

        {/* 진행도 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>진행도</label>
            <Text style={{ fontSize: 13, color: '#1677ff', fontWeight: 600 }}>{progress}%</Text>
          </div>
          <Slider value={progress} onChange={setProgress} min={0} max={100} step={5} style={{ marginTop: 4 }} tooltip={{ formatter: v => `${v}%` }} />
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 담당자 */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle icon={<UserOutlined />} text="담당자" />
          <Select
            mode="multiple" style={{ width: '100%' }} value={assigneeIds} onChange={setAssigneeIds}
            showSearch filterOption={filterUserOption}
            placeholder="담당자 선택"
            options={buildUserOptions(users.filter(u => u.isActive !== false), getMyDepartment())}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <SectionTitle icon={<UserOutlined />} text="유관 담당자" />
          <Select
            mode="multiple" style={{ width: '100%' }} value={relatedAssigneeIds} onChange={setRelatedAssigneeIds}
            showSearch filterOption={filterUserOption}
            placeholder="유관 담당자 선택"
            options={buildUserOptions(users.filter(u => u.isActive !== false), getMyDepartment())}
          />
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 링크 */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle icon={<LinkOutlined />} text="링크" />
          {links.map(link => (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <LinkOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
              <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                {link.title || link.url}
              </a>
              <Button type="text" size="small" danger icon={<CloseOutlined />} style={{ flexShrink: 0, padding: '0 4px' }} onClick={() => removeLink(link.id)} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Input placeholder="링크 제목 (선택)" value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} style={{ flex: 1 }} size="small" />
            <Input placeholder="https://..." value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} style={{ flex: 2 }} size="small" onPressEnter={addLink} />
            <Button size="small" icon={<PlusOutlined />} onClick={addLink}>추가</Button>
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 체크리스트 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SectionTitle icon={<CheckSquareOutlined />} text={`체크리스트 ${checklists.length > 0 ? `(${checkedCount}/${checklists.length})` : ''}`} />
          </div>
          {checklists.length > 0 && (
            <Progress percent={checklists.length > 0 ? Math.round((checkedCount / checklists.length) * 100) : 0} size="small" style={{ marginBottom: 8 }} showInfo={false} />
          )}
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            {checklists.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Checkbox checked={item.checked} onChange={() => isEdit ? toggleChecklistRemote(item) : toggleChecklistLocal(item.id)} />
                <Text style={{ flex: 1, textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? '#8c8c8c' : undefined, fontSize: 13 }}>{item.content}</Text>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ padding: '0 4px' }}
                  onClick={() => isEdit ? removeChecklistRemote(item.id) : removeChecklistLocal(item.id)} />
              </div>
            ))}
          </Space>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Input placeholder="항목 추가..." value={newCheckContent} onChange={e => setNewCheckContent(e.target.value)} size="small"
              onPressEnter={() => isEdit ? addChecklistRemote() : addChecklistLocal()} />
            <Button size="small" icon={<PlusOutlined />} onClick={() => isEdit ? addChecklistRemote() : addChecklistLocal()}>추가</Button>
          </div>
        </div>

        {/* 커스텀 속성 */}
        {visibleProperties.length > 0 && (
          <>
            <Divider style={{ margin: '12px 0' }}>커스텀 속성</Divider>
            {visibleProperties.map(prop => (
              <div key={prop.id} style={{ marginBottom: 10 }}>
                <label style={LABEL_STYLE}>{prop.name}</label>
                <div style={{ marginTop: 4 }}>
                  <PropertyInput
                    property={prop}
                    value={propValues[prop.id] ?? ''}
                    onChange={v => setPropValues(prev => ({ ...prev, [prop.id]: v }))}
                    users={users}
                    card={card}
                  />
                </div>
              </div>
            ))}
          </>
        )}

        {/* 자동 속성 */}
        {autoProperties.length > 0 && isEdit && (
          <>
            <Divider style={{ margin: '12px 0' }}>자동 속성</Divider>
            {autoProperties.map(prop => (
              <div key={prop.id} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ ...LABEL_STYLE, minWidth: 80, marginBottom: 0 }}>{prop.name}</label>
                <PropertyInput property={prop} value="" onChange={() => {}} users={users} card={card} />
              </div>
            ))}
          </>
        )}

        {/* 기존 카드: 첨부파일 + 의존성 + 업무 연결 + 댓글 */}
        {isEdit && (
          <>
            <Divider style={{ margin: '12px 0' }} />

            {/* 첨부파일 */}
            <div style={{ marginBottom: 14 }}>
              <SectionTitle icon={<PaperClipOutlined />} text={`첨부파일 (${attachments.length})`} />
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                {attachments.map(att => (
                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--fd-chart-grid)', borderRadius: 6, border: '1px solid var(--fd-chart-grid)' }}>
                    <PaperClipOutlined style={{ color: '#8c8c8c' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.originalName}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                        {formatFileSize(att.size)}
                        {att.createdAt && <span style={{ marginLeft: 6 }}>{dayjs(att.createdAt).format('YYYY-MM-DD HH:mm')}</span>}
                      </div>
                    </div>
                    <Tooltip title="다운로드">
                      <Button type="text" size="small" icon={<DownloadOutlined />} href={downloadCardAttachmentUrl(boardId, card.id, att.id)} style={{ padding: '0 4px' }} />
                    </Tooltip>
                    <Popconfirm title="파일을 삭제하시겠습니까?" onConfirm={() => removeAttachment(att.id)} okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ padding: '0 4px' }} />
                    </Popconfirm>
                  </div>
                ))}
              </Space>
              <Upload showUploadList={false} beforeUpload={(file) => { handleUpload({ file }); return false; }}>
                <Button icon={<PlusOutlined />} size="small" style={{ marginTop: 8 }}>파일 첨부</Button>
              </Upload>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 의존성 */}
            <div style={{ marginBottom: 14 }}>
              <SectionTitle icon="🔗" text="의존성" />
              {dependencies.dependsOn.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>이 카드는 다음 카드가 완료되어야 진행 가능:</Text>
                  {dependencies.dependsOn.map(dep => (
                    <div key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Tag color={dep.blocking?.status === 'done' ? 'success' : 'warning'} style={{ fontSize: 11 }}>
                        {dep.blocking?.status === 'done' ? '✓' : '⛔'}
                      </Tag>
                      <Text style={{ fontSize: 12, flex: 1 }}>
                        {dep.blocking?.cardNumber ? `#${dep.blocking.cardNumber} ` : ''}
                        {dep.blocking?.title}
                      </Text>
                      <Button
                        type="text" size="small" danger
                        icon={<DeleteOutlined />}
                        style={{ padding: '0 4px' }}
                        onClick={() => handleRemoveDependency(dep.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {dependencies.blocks.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>이 카드가 완료되어야 진행 가능한 카드:</Text>
                  {dependencies.blocks.map(dep => (
                    <Tag key={dep.id} style={{ fontSize: 11, marginBottom: 4 }}>
                      {dep.dependent?.cardNumber ? `#${dep.dependent.cardNumber} ` : ''}
                      {dep.dependent?.title}
                    </Tag>
                  ))}
                </div>
              )}
              <Select
                showSearch
                placeholder="선행 카드 검색 후 추가..."
                style={{ width: '100%' }}
                value={null}
                filterOption={false}
                onSearch={setDepSearch}
                onChange={handleAddDependency}
                notFoundContent={depSearch ? '카드를 찾을 수 없습니다.' : '카드 제목을 검색하세요.'}
                options={allCards
                  .filter(c =>
                    !dependencies.dependsOn.some(d => d.blockingId === c.id) &&
                    (depSearch ? c.title.toLowerCase().includes(depSearch.toLowerCase()) : depSearch.length > 0)
                  )
                  .slice(0, 10)
                  .map(c => ({
                    value: c.id,
                    label: `${c.cardNumber ? `#${c.cardNumber} ` : ''}${c.title}`,
                  }))
                }
              />
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 업무 연결 */}
            <div style={{ marginBottom: 14 }}>
              <SectionTitle icon="📋" text="업무 연결" />
              {linkedTask ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#f0f9ff', borderRadius: 6, border: '1px solid #bae0ff' }}>
                  <Tag color="blue" style={{ fontSize: 11 }}>{linkedTask.status}</Tag>
                  <Text style={{ fontSize: 13, flex: 1 }}>{linkedTask.title}</Text>
                  <Button type="text" size="small" danger onClick={handleUnlinkTask} loading={taskLinking}>
                    연결 해제
                  </Button>
                </div>
              ) : (
                <Select
                  showSearch
                  placeholder="업무 검색 후 연결..."
                  style={{ width: '100%' }}
                  value={null}
                  filterOption={false}
                  onFocus={loadTasks}
                  onSearch={setTaskSearch}
                  onChange={handleLinkTask}
                  loading={taskLinking}
                  notFoundContent={allTasks.length === 0 ? '업무 목록을 불러오는 중...' : '업무를 찾을 수 없습니다.'}
                  options={allTasks
                    .filter(t => taskSearch ? t.title.toLowerCase().includes(taskSearch.toLowerCase()) : true)
                    .slice(0, 15)
                    .map(t => ({ value: t.id, label: `[${t.status}] ${t.title}` }))
                  }
                />
              )}
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 댓글 */}
            <div style={{ marginBottom: 14 }}>
              <SectionTitle icon={<CommentOutlined />} text={`댓글 (${comments.length})`} />
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {comments.map(comment => (
                  <div key={comment.id} style={{ display: 'flex', gap: 8 }}>
                    <Avatar size={28} style={{ backgroundColor: getAvatarColor(comment.userId ?? comment.user?.id), flexShrink: 0, fontSize: 11 }}>
                      {comment.user?.displayName?.slice(0, 1)}
                    </Avatar>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text strong style={{ fontSize: 13 }}>{comment.user?.displayName}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(comment.createdAt).format('MM/DD HH:mm')}</Text>
                        {(comment.userId === currentUser?.id || currentUser?.role === 'admin') && (
                          <Space size={2} style={{ marginLeft: 'auto' }}>
                            <Button type="text" size="small" style={{ padding: '0 4px', height: 20, fontSize: 12 }}
                              onClick={() => { setEditingCommentId(comment.id); setEditingCommentContent(comment.content); }}>
                              수정
                            </Button>
                            <Popconfirm title="댓글을 삭제하시겠습니까?" onConfirm={() => removeComment(comment.id)} okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}>
                              <Button type="text" size="small" danger style={{ padding: '0 4px', height: 20, fontSize: 12 }}>삭제</Button>
                            </Popconfirm>
                          </Space>
                        )}
                      </div>
                      {editingCommentId === comment.id ? (
                        <div>
                          <TextArea value={editingCommentContent} onChange={e => setEditingCommentContent(e.target.value)} rows={2} size="small" />
                          <Space size={6} style={{ marginTop: 4 }}>
                            <Button size="small" type="primary" onClick={() => saveEditComment(comment.id)}>저장</Button>
                            <Button size="small" onClick={() => setEditingCommentId(null)}>취소</Button>
                          </Space>
                        </div>
                      ) : (
                        <>
                          {comment.content !== '📎' && (
                            <Paragraph style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', background: 'var(--fd-chart-grid)', padding: '6px 8px', borderRadius: 6 }}>
                              {comment.content}
                            </Paragraph>
                          )}
                          {/* 댓글 첨부파일 인라인 표시 */}
                          {(comment.attachments ?? []).map(att => {
                            const isImage = att.mimeType?.startsWith('image/');
                            const fileUrl = `${BACKEND}/api/boards/${boardId}/cards/${card.id}/attachments/${att.id}/download`;
                            return (
                              <div key={att.id} style={{ marginTop: 4 }}>
                                {isImage ? (
                                  <>
                                    <a href={fileUrl} target="_blank" rel="noreferrer">
                                      <img
                                        src={fileUrl}
                                        alt={att.originalName}
                                        style={{ maxWidth: 220, maxHeight: 160, borderRadius: 6, display: 'block', objectFit: 'cover', border: '1px solid #e0e0e0' }}
                                      />
                                    </a>
                                    {att.createdAt && (
                                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{dayjs(att.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                                    )}
                                  </>
                                ) : (
                                  <div>
                                    <a
                                      href={fileUrl}
                                      download={att.originalName}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', background: 'var(--fd-chart-grid)', borderRadius: 6, border: '1px solid #e8e8e8', textDecoration: 'none', color: '#333', fontSize: 13 }}
                                    >
                                      <PaperClipOutlined style={{ color: '#8c8c8c' }} />
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{att.originalName}</span>
                                      <DownloadOutlined style={{ color: '#8c8c8c', fontSize: 12, flexShrink: 0 }} />
                                    </a>
                                    {att.createdAt && (
                                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{dayjs(att.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </Space>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Avatar size={28} style={{ backgroundColor: getAvatarColor(currentUser?.id), flexShrink: 0, fontSize: 11 }}>
                  {currentUser?.displayName?.slice(0, 1)}
                </Avatar>
                <div style={{ flex: 1 }}>
                  <TextArea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="댓글을 입력하세요... (@이름으로 멘션 가능)"
                    rows={2}
                    style={{ fontSize: 13 }}
                  />
                  {/* 첨부파일 미리보기 */}
                  {commentFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '4px 8px', background: '#f8f9fa', borderRadius: 4, border: '1px solid #e8e8e8' }}>
                      <PaperClipOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                      <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {commentFile.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>
                        {commentFile.size < 1024 * 1024
                          ? `${(commentFile.size / 1024).toFixed(1)}KB`
                          : `${(commentFile.size / (1024 * 1024)).toFixed(1)}MB`}
                      </span>
                      <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setCommentFile(null)} style={{ padding: '0 2px', flexShrink: 0 }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* 파일 첨부 버튼 */}
                      <label
                        htmlFor="comment-file-input"
                        title="파일 첨부 (최대 20MB)"
                        style={{ cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#1677ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; }}
                      >
                        <PaperClipOutlined style={{ fontSize: 15 }} />
                      </label>
                      <input
                        id="comment-file-input"
                        ref={commentFileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 20 * 1024 * 1024) { message.error('파일 크기는 20MB 이하여야 합니다.'); return; }
                          setCommentFile({ file, name: file.name, type: file.type, size: file.size });
                          e.target.value = '';
                        }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>@이름 입력 시 해당 멤버에게 채팅 알림이 전송됩니다.</Text>
                    </div>
                    <Button
                      type="primary"
                      size="small"
                      disabled={!newComment.trim() && !commentFile}
                      loading={commentUploading}
                      onClick={submitComment}
                    >
                      등록
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
