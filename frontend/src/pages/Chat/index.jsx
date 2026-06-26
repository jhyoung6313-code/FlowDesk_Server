import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import hljs from 'highlight.js';
import EmojiPicker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { createPortal } from 'react-dom';
import {
  Badge, Button, Tooltip, Avatar, Spin, Modal,
  Select, Radio, Form, Input, message as antMsg, Dropdown, Empty,
  DatePicker,
} from 'antd';
import ResizableDrawer from '../../components/common/ResizableDrawer';
import {
  PlusOutlined, SendOutlined, TeamOutlined, UserOutlined,
  LogoutOutlined, PaperClipOutlined, BoldOutlined, ItalicOutlined,
  UnderlineOutlined, StrikethroughOutlined, FontColorsOutlined,
  DownloadOutlined, FileOutlined, FilePdfOutlined, FileWordOutlined,
  FileExcelOutlined, FileZipOutlined, FileImageOutlined, MessageOutlined,
  PushpinOutlined, StarOutlined, StarFilled, BellOutlined, BellFilled,
  EditOutlined, DeleteOutlined, ShareAltOutlined, BookOutlined,
  SearchOutlined, GlobalOutlined, LockOutlined, MoreOutlined,
  RetweetOutlined, CloseOutlined, CheckOutlined, FolderOutlined,
  NumberOutlined, CodeOutlined, SmileOutlined, ClockCircleOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAvatarColor } from '../../utils/colors';
import useChatStore from '../../store/chatStore';
import useAuthStore from '../../store/authStore';
import { useChatSocketContext } from '../../contexts/ChatSocketContext';
import * as chatApi from '../../api/chat';
import { getUsers, setMyStatus } from '../../api/users';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';

// Vite dev는 직접 연결, Docker/nginx는 상대경로로 프록시
const BACKEND = import.meta.env.DEV ? 'http://localhost:4000' : '';

const FONT_FAMILIES = [
  { value: '', label: '기본' },
  { value: 'Arial', label: 'Arial' },
  { value: "'Malgun Gothic', sans-serif", label: '맑은 고딕' },
  { value: "'Gulim', sans-serif", label: '굴림' },
  { value: "'Nanum Gothic', sans-serif", label: '나눔고딕' },
  { value: 'Georgia', label: 'Georgia' },
  { value: "'Courier New', monospace", label: 'Courier' },
];
const FONT_SIZES = ['10', '12', '13', '14', '16', '18', '20', '24', '28', '32'];
const COLOR_PALETTE = [
  '#000000', '#595959', '#8c8c8c', '#bfbfbf', '#ffffff',
  '#ff4d4f', '#ff7a45', '#ffa940', '#ffd666', '#52c41a',
  '#13c2c2', '#1677ff', '#2f54eb', '#722ed1', '#eb2f96',
];
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

/* ─────────────────── 유틸 ─────────────────── */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function fmtTime(date) {
  return dayjs(date).format('A h:mm').replace('AM', '오전').replace('PM', '오후');
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function roomDisplayName(room, myId) {
  if (room.type !== 'direct') return room.name || '채팅방';
  const other = room.members?.find((m) => m.userId !== myId);
  return other?.user?.displayName || '(탈퇴한 사용자)';
}

function groupReactions(reactions) {
  const map = {};
  for (const r of reactions) {
    if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, users: [] };
    map[r.emoji].users.push(r.user);
  }
  return Object.values(map);
}

function renderContent(html) {
  if (!html) return '';
  // 1) 코드 블록 (<pre class="chat-code-block">) — highlight.js 적용
  let result = html.replace(/<pre class="chat-code-block"><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_, attrs, code) => {
    const lang = (attrs.match(/class="language-(\w+)"/) || [])[1];
    const decoded = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    try {
      const highlighted = lang ? hljs.highlight(decoded, { language: lang, ignoreIllegals: true }).value : hljs.highlightAuto(decoded).value;
      return `<pre class="chat-code-block"><code>${highlighted}</code></pre>`;
    } catch { return `<pre class="chat-code-block"><code>${code}</code></pre>`; }
  });
  // 2) 인라인 코드 (<code> without pre)
  result = result.replace(/(?<!<pre[^>]*>[\s\S]*?)<code>([^<]+)<\/code>/g, '<code class="chat-code-inline">$1</code>');
  // 3) 멘션 span (data-user-id) — 스타일 보강
  result = result.replace(/<span([^>]*data-user-id[^>]*)>(@[^<]+)<\/span>/g,
    '<span class="mention-chip"$1>$2</span>');
  // 4) @word 패턴 (레거시 텍스트 멘션)
  result = result.replace(/(?<![="'])@(\w+)/g,
    '<span class="mention-chip">@$1</span>');
  return result;
}
// 별칭 (기존 호출부 호환)
const highlightMentions = renderContent;

/* ─────────────────── 소형 컴포넌트 ─────────────────── */

function UserAvatar({ user, size = 32 }) {
  const color = getAvatarColor(user?.id, user?.avatarColor);
  const letter = (user?.displayName || '?')[0].toUpperCase();
  return (
    <Avatar size={size} style={{ backgroundColor: color, fontSize: size * 0.44, flexShrink: 0 }}>
      {letter}
    </Avatar>
  );
}

function RoomTypeIcon({ type, size = 12 }) {
  const s = { fontSize: size };
  if (type === 'public') return <NumberOutlined style={{ ...s, color: '#52c41a' }} />;
  if (type === 'private') return <LockOutlined style={{ ...s, color: '#faad14' }} />;
  if (type === 'group') return <TeamOutlined style={{ ...s, color: '#722ed1' }} />;
  return <UserOutlined style={{ ...s, color: '#1677ff' }} />;
}

function FileTypeIcon({ type, size = 16 }) {
  const s = { fontSize: size };
  if (!type) return <FileOutlined style={s} />;
  if (type.startsWith('image/')) return <FileImageOutlined style={{ ...s, color: '#1677ff' }} />;
  if (type === 'application/pdf') return <FilePdfOutlined style={{ ...s, color: '#ff4d4f' }} />;
  if (type.includes('word')) return <FileWordOutlined style={{ ...s, color: '#1677ff' }} />;
  if (type.includes('excel') || type.includes('spreadsheet')) return <FileExcelOutlined style={{ ...s, color: '#52c41a' }} />;
  if (type.includes('zip') || type.includes('compressed')) return <FileZipOutlined style={{ ...s, color: '#faad14' }} />;
  return <FileOutlined style={{ ...s, color: '#999' }} />;
}

function roomAvatar(room, myId, size = 32) {
  if (room.type !== 'direct') {
    const bg = room.type === 'public' ? '#52c41a' : room.type === 'private' ? '#faad14' : '#722ed1';
    return <Avatar size={size} icon={<TeamOutlined />} style={{ backgroundColor: bg, flexShrink: 0 }} />;
  }
  const other = room.members?.find((m) => m.userId !== myId);
  return <UserAvatar user={other?.user} size={size} />;
}

/* ── 날짜 구분선 ── */
function DateDivider({ date }) {
  const d = dayjs(date);
  const today = dayjs();
  let label;
  if (d.isSame(today, 'day')) label = '오늘';
  else if (d.isSame(today.subtract(1, 'day'), 'day')) label = '어제';
  else label = d.format('YYYY년 M월 D일 (ddd)');
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '24px 20px 12px', gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: 'var(--fd-border)' }} />
      <span style={{
        fontSize: 11, color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap',
        padding: '3px 10px', background: 'var(--fd-surface)', borderRadius: 20,
        border: '1px solid var(--fd-border)', letterSpacing: 0.3,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--fd-border)' }} />
    </div>
  );
}

/* ── 사이드바 섹션 헤더 ── */
function SectionHeader({ label, open, onToggle, onAdd, addTitle }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 3px 10px', cursor: 'pointer', userSelect: 'none' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span
        onClick={onToggle}
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <span style={{
          fontSize: 9, color: '#aaa', display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
        }}>▶</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: '#999', textTransform: 'uppercase' }}>
          {label}
        </span>
      </span>
      {onAdd && (
        <Tooltip title={addTitle || '추가'}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: hov ? '#666' : 'transparent', fontSize: 14, padding: '0 2px',
              display: 'flex', alignItems: 'center', transition: 'color 0.12s',
            }}
          >
            <PlusOutlined />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/* ── 채팅방 목록 아이템 ── */
function RoomItem({ room, isActive, myId, onClick, onlineUserIds, onToggleFavorite }) {
  const name = roomDisplayName(room, myId);
  const last = room.lastMessage;
  let preview = '';
  if (last) {
    if (last.fileUrl) preview = last.fileName ? `📎 ${last.fileName}` : '📎 파일';
    else preview = stripHtml(last.content || '');
  }
  const dmOther = room.type === 'direct' ? room.members?.find((m) => m.userId !== myId) : null;
  const isOnline = dmOther ? onlineUserIds?.has(dmOther.userId) : false;
  const hasUnread = (room.unread || 0) > 0;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '6px 10px', cursor: 'pointer', borderRadius: 7,
        margin: '1px 6px',
        background: isActive ? 'rgba(22,119,255,0.1)' : 'transparent',
        transition: 'background 0.12s',
        opacity: room.isArchived ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <Badge count={hasUnread ? room.unread : 0} size="small" offset={[-2, 2]}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {roomAvatar(room, myId, 32)}
          {room.type === 'direct' && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isOnline ? '#52c41a' : '#d9d9d9',
              border: '1.5px solid #f8f8f8',
              position: 'absolute', bottom: 0, right: 0, display: 'block',
            }} />
          )}
        </div>
      </Badge>
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
          <span style={{
            fontWeight: isActive || hasUnread ? 700 : 500,
            fontSize: 13,
            color: isActive ? '#1677ff' : (hasUnread ? '#111' : '#555'),
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {name}
          </span>
          {room.isMuted && <BellFilled style={{ fontSize: 9, color: '#d0d0d0' }} />}
        </div>
        {preview && (
          <div style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {preview}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {last && <span style={{ fontSize: 10, color: '#ccc' }}>{dayjs(last.createdAt).format('HH:mm')}</span>}
        <Tooltip title={room.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(room.id); }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 2px',
              color: room.isFavorite ? '#faad14' : '#d9d9d9',
              fontSize: 11, display: 'flex', alignItems: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#faad14'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = room.isFavorite ? '#faad14' : '#d9d9d9'; }}
          >
            {room.isFavorite ? <StarFilled /> : <StarOutlined />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/* ── 파일 첨부 ── */
// 채팅 이미지 첨부는 실제 사이즈 대신 고정 크기 썸네일로 표시 (클릭 시 원본 열람)
const CHAT_IMAGE_THUMB_W = 220;
const CHAT_IMAGE_THUMB_H = 160;

function FileAttachment({ msg }) {
  const { fileUrl, fileName, fileType, fileSize } = msg;
  const fullUrl = `${BACKEND}${fileUrl}`;
  const isImage = fileType?.startsWith('image/');

  if (isImage) {
    return (
      <div style={{ marginTop: 6 }}>
        <a href={fullUrl} target="_blank" rel="noreferrer">
          <img src={fullUrl} alt={fileName}
            style={{ width: CHAT_IMAGE_THUMB_W, height: CHAT_IMAGE_THUMB_H, borderRadius: 8, display: 'block', objectFit: 'cover', border: '1px solid var(--fd-border)', cursor: 'zoom-in' }}
          />
        </a>
        {fileName && <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{fileName}</div>}
      </div>
    );
  }

  return (
    <a
      href={fullUrl} download={fileName} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--fd-surface-sunken)', textDecoration: 'none', color: 'var(--fd-text-primary)', maxWidth: 320, border: '1px solid var(--fd-border)', transition: 'background 0.12s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#eeeeee'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f5f5'; }}
    >
      <FileTypeIcon type={fileType} size={22} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{fileName || '파일'}</div>
        {fileSize && <div style={{ fontSize: 11, color: '#999' }}>{fmtSize(fileSize)}</div>}
      </div>
      <DownloadOutlined style={{ fontSize: 14, color: '#bbb', flexShrink: 0 }} />
    </a>
  );
}

/* ── 메시지 버블 (Discord 스타일) ── */
function LinkPreviewCard({ url }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    import('../../api/chat').then(({ getLinkPreview }) => {
      getLinkPreview(url).then((d) => { if (!cancelled) setData(d); }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [url]);
  if (!data?.title) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="link-preview-card" style={{ textDecoration: 'none', display: 'block', marginTop: 6 }}>
      {data.image && <img src={data.image} alt="" className="lp-image" style={{ maxWidth: '100%', borderRadius: 6, display: 'block', marginBottom: 4 }} />}
      <div className="lp-body">
        {data.domain && <div className="lp-domain">{data.domain}</div>}
        {data.title && <div className="lp-title">{data.title}</div>}
        {data.description && <div className="lp-desc">{data.description}</div>}
      </div>
    </a>
  );
}

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

function MessageBubble({ msg, prevMsg, myId, onReact, onEdit, onDelete, onPin, onSave, onForward, onMarkUnread, onOpenThread, roomMembers, memberReadAt }) {
  const [hover, setHover] = useState(false);

  const isGrouped = !!prevMsg
    && prevMsg.senderId === msg.senderId
    && dayjs(msg.createdAt).diff(dayjs(prevMsg.createdAt), 'minute') < 5
    && dayjs(msg.createdAt).isSame(dayjs(prevMsg.createdAt), 'day');

  const isMine = msg.senderId === myId;
  const reactions = groupReactions(msg.reactions || []);
  const replyCount = msg._count?.replies || 0;

  const menuItems = [
    { key: 'thread', label: '스레드에 답글', icon: <RetweetOutlined />, onClick: () => onOpenThread(msg) },
    { key: 'pin', label: '메시지 고정', icon: <PushpinOutlined />, onClick: () => onPin(msg.id) },
    { key: 'save', label: '나중에 보기', icon: <BookOutlined />, onClick: () => onSave(msg.id) },
    { key: 'forward', label: '전달', icon: <ShareAltOutlined />, onClick: () => onForward(msg) },
    { key: 'unread', label: '읽지 않음 표시', icon: <BellOutlined />, onClick: () => onMarkUnread(msg) },
    ...(isMine ? [
      { type: 'divider' },
      { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => onEdit(msg) },
      { key: 'delete', label: '삭제', icon: <DeleteOutlined />, danger: true, onClick: () => onDelete(msg.id) },
    ] : []),
  ];

  if (msg.isDeleted) {
    return (
      <div style={{ padding: `${isGrouped ? 1 : 10}px 20px 2px 66px` }}>
        <span style={{ fontSize: 13, color: '#ccc', fontStyle: 'italic' }}>삭제된 메시지입니다.</span>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 0,
        flexDirection: isMine ? 'row-reverse' : 'row',
        padding: `${isGrouped ? 1 : 10}px 20px 2px 20px`,
        background: hover ? 'rgba(0,0,0,0.022)' : 'transparent',
        transition: 'background 0.08s',
        position: 'relative',
      }}
    >
      {/* 아바타 / 그룹 타임스탬프 */}
      <div style={{ width: 36, flexShrink: 0, marginRight: isMine ? 0 : 10, marginLeft: isMine ? 10 : 0, display: 'flex', alignItems: isGrouped ? 'center' : 'flex-start', justifyContent: 'center', paddingTop: isGrouped ? 0 : 2 }}>
        {isGrouped ? (
          <span style={{ fontSize: 10, color: '#ccc', opacity: hover ? 1 : 0, transition: 'opacity 0.12s', whiteSpace: 'nowrap' }}>
            {dayjs(msg.createdAt).format('HH:mm')}
          </span>
        ) : (
          <UserAvatar user={msg.sender} size={36} />
        )}
      </div>

      {/* 콘텐츠 영역 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
        {!isGrouped && !isMine && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fd-text-primary)' }}>
              {msg.sender?.displayName}
            </span>
            <span style={{ fontSize: 11, color: '#c0c0c0' }}>{fmtTime(msg.createdAt)}</span>
          </div>
        )}

        {msg.forwardedFromId && (
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RetweetOutlined /> 전달된 메시지
          </div>
        )}

        {/* 말풍선 */}
        <div style={{
          maxWidth: '72%',
          background: isMine ? '#dcf1ff' : '#f0f0f0',
          borderRadius: isMine ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
          padding: '8px 12px',
        }}>
          {msg.content && (
            <div
              className="chat-msg-content"
              dangerouslySetInnerHTML={{ __html: highlightMentions(msg.content) }}
              style={{ fontSize: 14, lineHeight: 1.65, color: '#1a1a1a', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
            />
          )}
          {msg.fileUrl && <FileAttachment msg={msg} />}
          {msg.editedAt && <span style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>(수정됨)</span>}
          {/* 링크 미리보기 */}
          {msg.content && (() => {
            const plain = msg.content.replace(/<[^>]*>/g, ' ');
            const urls = [...new Set(plain.match(URL_REGEX) || [])].slice(0, 1);
            return urls.map((url) => <LinkPreviewCard key={url} url={url} />);
          })()}
        </div>

        {/* 읽음 확인 (내 메시지에만) */}
        {isMine && roomMembers.length > 1 && (() => {
          const readers = roomMembers.filter((m) => m.userId !== myId && memberReadAt[m.userId] && memberReadAt[m.userId] >= msg.createdAt);
          if (readers.length === 0) return null;
          return (
            <div style={{ display: 'flex', gap: 2, marginTop: 3, justifyContent: 'flex-end' }}>
              {readers.slice(0, 5).map((m) => (
                <Tooltip key={m.userId} title={`${m.user?.displayName} 읽음`}>
                  <span><UserAvatar user={m.user} size={14} /></span>
                </Tooltip>
              ))}
              {readers.length > 5 && <span style={{ fontSize: 9, color: '#aaa' }}>+{readers.length - 5}</span>}
            </div>
          );
        })()}

        {!isGrouped && isMine && (
          <span style={{ fontSize: 10, color: '#bbb', marginTop: 3 }}>{fmtTime(msg.createdAt)}</span>
        )}

        {/* 이모지 반응 */}
        {reactions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {reactions.map((r) => (
              <Tooltip key={r.emoji} title={r.users.map((u) => u.displayName).join(', ')}>
                <button
                  type="button"
                  onClick={() => onReact(msg.id, r.emoji)}
                  style={{
                    background: 'var(--fd-surface-sunken)', border: '1.5px solid var(--fd-border)',
                    borderRadius: 12, padding: '2px 9px', cursor: 'pointer',
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                    fontFamily: 'inherit', transition: 'all 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#e6f4ff'; e.currentTarget.style.borderColor = '#91caff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#e8e8e8'; }}
                >
                  {r.emoji} <span style={{ fontSize: 11, color: 'var(--fd-text-secondary)', fontWeight: 600 }}>{r.users.length}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        )}

        {/* 스레드 답글 */}
        {replyCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenThread(msg)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#1677ff', fontSize: 12, marginTop: 5, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
          >
            <RetweetOutlined /><span style={{ fontWeight: 600 }}>{replyCount}개의 답글</span>
          </button>
        )}
      </div>

      {/* 플로팅 액션바 */}
      {hover && (
        <div style={{
          position: 'absolute', top: -16, right: 20,
          background: 'var(--fd-surface)', border: '1px solid var(--fd-border)',
          borderRadius: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', padding: '2px 6px', zIndex: 10,
        }}>
          {QUICK_EMOJIS.slice(0, 4).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onReact(msg.id, e)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, padding: '3px 4px', borderRadius: 6, display: 'flex', alignItems: 'center', lineHeight: 1, transition: 'transform 0.1s' }}
              onMouseEnter={(ev) => { ev.currentTarget.style.transform = 'scale(1.3)'; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.transform = 'scale(1)'; }}
            >{e}</button>
          ))}
          <div style={{ width: 1, height: 18, background: '#e8e8e8', margin: '0 4px' }} />
          <Tooltip title="스레드에 답글">
            <button
              type="button"
              onClick={() => onOpenThread(msg)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#888', padding: '3px 6px', borderRadius: 6, fontSize: 14, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
            ><RetweetOutlined /></button>
          </Tooltip>
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <button
              type="button"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#888', padding: '3px 6px', borderRadius: 6, fontSize: 14, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
            ><MoreOutlined /></button>
          </Dropdown>
        </div>
      )}
    </div>
  );
}

/* ── 서식 툴바 ── */
function FormatToolbar({ editorRef, fontSize, setFontSize, fontFamily, setFontFamily, fontColor, setFontColor }) {
  const exec = (cmd) => { editorRef.current?.focus(); document.execCommand(cmd, false, null); };
  const [colorOpen, setColorOpen] = useState(false);
  const [colorPos, setColorPos] = useState({ top: 0, left: 0 });
  const colorIconRef = useRef(null);

  const applySpan = (prop, val, setter) => {
    setter(val);
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const editor = editorRef.current;
    const span = document.createElement('span');
    span.style[prop] = prop === 'fontSize' ? `${val}px` : val;

    if (!sel.isCollapsed) {
      // 텍스트 선택 → 선택 영역만 색상 적용
      const range = sel.getRangeAt(0);
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
      sel.removeAllRanges();
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.addRange(nr);
    } else if (prop === 'color' && editor && editor.textContent.trim()) {
      // 색상 + 커서만 있고 기존 텍스트가 있을 때 → 전체 내용을 span으로 감쌈
      while (editor.firstChild) span.appendChild(editor.firstChild);
      editor.appendChild(span);
      const nr = document.createRange();
      nr.selectNodeContents(span);
      nr.collapse(false);
      sel.removeAllRanges();
      sel.addRange(nr);
    } else {
      // 빈 에디터 or 글씨크기·폰트 → 커서 위치에 zero-width span 삽입
      const range = sel.getRangeAt(0);
      span.appendChild(document.createTextNode('​'));
      range.insertNode(span);
      const nr = document.createRange();
      nr.setStart(span.firstChild, 1);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
  };

  const btn = { width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid transparent', borderRadius: 4, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--fd-text-secondary)', flexShrink: 0 };
  const sep = { width: 1, height: 14, background: '#e0e0e0', margin: '0 3px', flexShrink: 0 };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px', borderBottom: '1px solid var(--fd-border)', background: 'var(--fd-surface-sunken)', flexWrap: 'wrap' }}>
      <Tooltip title="굵게"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}><BoldOutlined /></button></Tooltip>
      <Tooltip title="기울임"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}><ItalicOutlined /></button></Tooltip>
      <Tooltip title="밑줄"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('underline'); }}><UnderlineOutlined /></button></Tooltip>
      <Tooltip title="취소선"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('strikeThrough'); }}><StrikethroughOutlined /></button></Tooltip>
      <Tooltip title="코드 블록">
        <button type="button" style={btn} onMouseDown={(e) => {
          e.preventDefault();
          editorRef.current?.focus();
          const sel = window.getSelection();
          const selected = sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneContents().textContent : '';
          const pre = document.createElement('pre');
          pre.className = 'chat-code-block';
          const code = document.createElement('code');
          code.textContent = selected || '코드를 입력하세요';
          pre.appendChild(code);
          if (sel?.rangeCount > 0) { sel.getRangeAt(0).deleteContents(); sel.getRangeAt(0).insertNode(pre); }
          else editorRef.current.appendChild(pre);
        }}><CodeOutlined /></button>
      </Tooltip>
      <div style={sep} />
      <select value={fontSize} onChange={(e) => { editorRef.current?.focus(); applySpan('fontSize', e.target.value, setFontSize); }} style={{ height: 24, fontSize: 11, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', cursor: 'pointer', background: 'var(--fd-surface)', width: 54 }}>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
      </select>
      <select value={fontFamily} onChange={(e) => { editorRef.current?.focus(); applySpan('fontFamily', e.target.value, setFontFamily); }} style={{ height: 24, fontSize: 11, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', cursor: 'pointer', background: 'var(--fd-surface)', width: 78 }}>
        {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <div style={sep} />

      {/* ── 색상 팔레트 (portal + overlay 방식) */}
      <Tooltip title="글자 색상">
        <div
          ref={colorIconRef}
          style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 3px' }}
          onMouseDown={(e) => {
            e.preventDefault();
            const rect = colorIconRef.current?.getBoundingClientRect();
            if (rect) setColorPos({ top: rect.bottom + 4, left: rect.left });
            setColorOpen((v) => !v);
          }}
        >
          <FontColorsOutlined style={{ fontSize: 13, color: 'var(--fd-text-secondary)' }} />
          <div style={{ position: 'absolute', bottom: -1, left: 2, right: 2, height: 3, background: fontColor, borderRadius: 1 }} />
        </div>
      </Tooltip>
      {colorOpen && createPortal(
        <>
          {/* 외부 클릭 시 닫기용 투명 오버레이 */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
            onMouseDown={() => setColorOpen(false)}
          />
          {/* 색상 팔레트 */}
          <div
            style={{
              position: 'fixed', top: colorPos.top, left: colorPos.left, zIndex: 99999,
              background: 'var(--fd-surface)', border: '1px solid var(--fd-border)', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)', padding: 6,
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
            }}
          >
            {COLOR_PALETTE.map((color) => (
              <div
                key={color}
                title={color}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySpan('color', color, setFontColor);
                  setColorOpen(false);
                }}
                style={{
                  width: 22, height: 22, background: color, borderRadius: 3, cursor: 'pointer',
                  border: color === fontColor ? '2px solid #1677ff' : '1px solid var(--fd-border)',
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   메인 ChatPage
══════════════════════════════════════════════════════════ */
export default function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const socketRef = useChatSocketContext();

  // 채팅 메시지 내 내부 링크(보드/런 바로가기) 클릭을 SPA 네비게이션으로 처리
  const handleChatLinkClick = useCallback((e) => {
    const a = e.target.closest?.('a[data-chat-link]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (href) navigate(href);
  }, [navigate]);
  const {
    rooms, setRooms, activeRoomId, setActiveRoom,
    messages, setMessages, prependMessages,
    totalUnread, upsertRoom, removeRoom,
    threadData, setThreadData, closeThread,
    savedMessages, setSavedMessages,
    typingUsers, onlineUserIds,
    setOpen, memberReadAt,
  } = useChatStore();

  // 채팅 페이지 진입/이탈 시 isOpen 동기화 (toast 중복 방지)
  useEffect(() => {
    setOpen(true);
    return () => setOpen(false);
  }, []);

  /* 기본 상태 */
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);

  /* 서식 */
  const [fontSize, setFontSize] = useState('14');
  const [fontFamily, setFontFamily] = useState('');
  const [fontColor, setFontColor] = useState('#000000');

  /* 파일 */
  const [pendingFile, setPendingFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  /* 사이드바 섹션 접기/펼치기 */
  const [expandFav, setExpandFav] = useState(true);
  const [expandChannel, setExpandChannel] = useState(true);
  const [expandDM, setExpandDM] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  /* 채팅방 생성 */
  const [newRoomModal, setNewRoomModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [newRoomForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  /* 공개 채널 탐색 */
  const [publicModal, setPublicModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);

  /* 메시지 수정 */
  const [editingMsg, setEditingMsg] = useState(null);
  const [editContent, setEditContent] = useState('');

  /* 메시지 전달 */
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]);

  /* 고정 메시지 */
  const [pinnedPanel, setPinnedPanel] = useState(false);
  const [pinnedMsgs, setPinnedMsgs] = useState([]);

  /* 8가지 신규 기능 상태 */
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
  const [mentionIndex, setMentionIndex] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(null);
  const [statusModal, setStatusModal] = useState(false);
  const [statusEmoji, setStatusEmoji] = useState('');
  const [statusText, setStatusText] = useState('');
  const [announcementBanner, setAnnouncementBanner] = useState('');


  /* 저장 메시지 */
  const [savedPanel, setSavedPanel] = useState(false);

  /* 검색 */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  /* 채널 정보 수정 */
  const [editRoomModal, setEditRoomModal] = useState(false);
  const [editRoomForm] = Form.useForm();

  /* 스레드 서식 */
  const [threadFontSize, setThreadFontSize] = useState('14');
  const [threadFontFamily, setThreadFontFamily] = useState('');
  const [threadFontColor, setThreadFontColor] = useState('#000000');
  const [threadFile, setThreadFile] = useState(null);
  const [threadSending, setThreadSending] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesBoxRef = useRef(null);
  const editorRef = useRef(null);
  const threadEditorRef = useRef(null);
  const fileInputRef = useRef(null);
  const threadFileRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;
  const activeMessages = (messages[activeRoomId] || []).filter((m) => !m.parentId);

  /* 섹션별 분류 */
  const baseRooms = rooms.filter((r) => showArchived ? r.isArchived : !r.isArchived);
  const favRooms = baseRooms.filter((r) => r.isFavorite);
  const channelRooms = baseRooms.filter((r) => !r.isFavorite && ['public', 'private', 'group'].includes(r.type));
  const dmRooms = baseRooms.filter((r) => !r.isFavorite && r.type === 'direct');

  /* @멘션 자동완성 멤버 목록 */
  const mentionMembers = useMemo(() => {
    if (!activeRoom?.members) return [];
    const q = mentionQuery.toLowerCase();
    return activeRoom.members.filter((m) => {
      if (!m?.user) return false;
      const uname = (m.user.username || '').toLowerCase();
      const dname = (m.user.displayName || '').toLowerCase();
      return uname.includes(q) || dname.includes(q);
    }).slice(0, 8);
  }, [activeRoom, mentionQuery]);

  /* ── 방 목록 로드 */
  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try { const data = await chatApi.getRooms(); setRooms(data); }
    catch { /* silent */ } finally { setLoadingRooms(false); }
  }, [setRooms]);

  useEffect(() => { loadRooms(); }, []);

  /* ── 메시지 로드 */
  const loadMessages = useCallback(async (roomId, beforeId) => {
    setLoadingMsgs(true);
    try {
      const params = beforeId ? { before: beforeId, limit: 50 } : { limit: 50 };
      const data = await chatApi.getMessages(roomId, params);
      if (beforeId) prependMessages(roomId, data);
      else setMessages(roomId, data);
      setHasMore(data.length === 50);
    } catch { /* silent */ } finally { setLoadingMsgs(false); }
  }, [setMessages, prependMessages]);

  useEffect(() => {
    if (!activeRoomId) return;
    if (!messages[activeRoomId]) {
      loadMessages(activeRoomId, null);
      chatApi.markRead(activeRoomId).catch(() => {});
    }
  }, [activeRoomId]);

  useEffect(() => {
    const last = activeMessages[activeMessages.length - 1];
    if (last && activeRoomId) chatApi.markRead(activeRoomId).catch(() => {});
  }, [activeMessages.length, activeRoomId]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  /* ── 소켓 join */
  useEffect(() => {
    if (!socketRef?.current) return;
    rooms.forEach((r) => socketRef.current.emit('join-room', r.id));
  }, [rooms.length]);

  /* ── 방 변경 시 에디터 초기화 */
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = '';
    setPendingFile(null);
    setEditingMsg(null);
  }, [activeRoomId]);

  /* ── 타이핑 */
  const emitTyping = useCallback(() => {
    if (!socketRef?.current?.connected || !activeRoomId) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current.emit('typing', { roomId: activeRoomId });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socketRef.current?.emit('stop-typing', { roomId: activeRoomId });
    }, 2000);
  }, [activeRoomId, socketRef]);

  const stopTyping = useCallback(() => {
    clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socketRef.current?.emit('stop-typing', { roomId: activeRoomId });
    }
  }, [activeRoomId, socketRef]);

  /* ── 메시지 전송 */
  const handleSend = useCallback(async (isThread = false) => {
    const ref = isThread ? threadEditorRef : editorRef;
    const html = ref.current?.innerHTML || '';
    const text = stripHtml(html);
    const file = isThread ? threadFile : pendingFile;
    if (!text && !file) return;
    if (!activeRoomId) return;
    if (!socketRef?.current?.connected) {
      antMsg.error('채팅 서버에 연결되어 있지 않습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    const setSend = isThread ? setThreadSending : setSending;
    setSend(true);
    try {
      let fileData = null;
      if (file) {
        setUploadingFile(true);
        try { fileData = await chatApi.uploadFile(activeRoomId, file.file); }
        finally { setUploadingFile(false); }
      }
      socketRef.current.emit('send-message', {
        roomId: activeRoomId,
        content: html,
        parentId: isThread && threadData ? threadData.parent.id : null,
        ...(fileData ? { fileUrl: fileData.fileUrl, fileName: fileData.fileName, fileType: fileData.fileType, fileSize: fileData.fileSize } : {}),
      });
      if (!isThread) stopTyping();
      if (ref.current) ref.current.innerHTML = '';
      if (isThread) setThreadFile(null);
      else setPendingFile(null);
    } catch { antMsg.error('전송 실패'); }
    finally { setSend(false); }
  }, [activeRoomId, pendingFile, threadFile, threadData, socketRef, stopTyping]);

  const handleScroll = useCallback(() => {
    const box = messagesBoxRef.current;
    if (!box || !hasMore || loadingMsgs) return;
    if (box.scrollTop < 40) {
      const oldest = activeMessages[0];
      if (oldest) loadMessages(activeRoomId, oldest.id);
    }
  }, [hasMore, loadingMsgs, activeMessages, activeRoomId, loadMessages]);

  const applyFile = (file, isThread = false) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { antMsg.error('파일 크기는 20MB 이하여야 합니다.'); return; }
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    const obj = { file, previewUrl, name: file.name, type: file.type, size: file.size };
    if (isThread) setThreadFile(obj); else setPendingFile(obj);
  };

  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); if (!activeRoomId) return; dragCounterRef.current += 1; if (e.dataTransfer.types.includes('Files')) setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current -= 1; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragging(false); } };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setIsDragging(false); if (!activeRoomId) return; applyFile(e.dataTransfer.files?.[0]); };

  /* ── 채팅방 생성 */
  const openNewRoomModal = async () => {
    newRoomForm.resetFields();
    try { const users = await getUsers(); setAllUsers(users.filter((u) => u.isActive && u.id !== user.id)); }
    catch { setAllUsers([]); }
    setNewRoomModal(true);
  };

  const handleCreateRoom = async () => {
    try {
      const values = await newRoomForm.validateFields();
      setCreating(true);
      const rawIds = Array.isArray(values.memberIds) ? values.memberIds : (values.memberIds != null ? [values.memberIds] : []);
      const memberIds = values.type === 'direct' ? rawIds.slice(0, 1) : rawIds;
      const room = await chatApi.createRoom({ type: values.type, memberIds, name: values.name, description: values.description });
      upsertRoom({ ...room, unread: room.unread ?? 0, isFavorite: room.isFavorite ?? false, isMuted: room.isMuted ?? false });
      if (socketRef?.current) socketRef.current.emit('join-room', room.id);
      setActiveRoom(room.id);
      setNewRoomModal(false);
    } catch (err) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.error || err?.message || '채팅방 생성 실패';
      console.error('[채팅방 생성 오류]', err);
      antMsg.error(msg);
    } finally { setCreating(false); }
  };

  const handleLeave = async () => {
    if (!activeRoomId) return;
    try {
      await chatApi.leaveRoom(activeRoomId);
      if (socketRef?.current) socketRef.current.emit('leave-room', activeRoomId);
      removeRoom(activeRoomId);
      antMsg.success('채팅방을 나갔습니다.');
    } catch { antMsg.error('나가기 실패'); }
  };

  /* ── 즐겨찾기 / 뮤트 / 보관 */
  const handleToggleFavorite = async (roomId) => {
    const id = roomId ?? activeRoomId;
    if (!id) return;
    try { const res = await chatApi.toggleFavorite(id); upsertRoom({ id, isFavorite: res.isFavorite }); }
    catch { antMsg.error('처리 실패'); }
  };
  const handleToggleMute = async () => {
    if (!activeRoomId) return;
    try { const res = await chatApi.toggleMute(activeRoomId); upsertRoom({ id: activeRoomId, isMuted: res.isMuted }); }
    catch { antMsg.error('처리 실패'); }
  };
  const handleToggleArchive = async () => {
    if (!activeRoomId || !activeRoom) return;
    try {
      await chatApi.toggleArchive(activeRoomId);
      upsertRoom({ id: activeRoomId, isArchived: !activeRoom.isArchived });
      antMsg.success(activeRoom.isArchived ? '보관 해제되었습니다.' : '보관되었습니다.');
    } catch { antMsg.error('처리 실패'); }
  };

  /* ── 이모지 반응 */
  const handleReact = (messageId, emoji) => {
    if (!socketRef?.current?.connected) return;
    socketRef.current.emit('toggle-reaction', { messageId, emoji });
  };

  /* ── 스레드 */
  const handleOpenThread = async (msg) => {
    try { const data = await chatApi.getThread(msg.id); setThreadData(data); }
    catch { antMsg.error('스레드를 불러오지 못했습니다.'); }
  };

  /* ── 메시지 수정 */
  const handleEdit = (msg) => { setEditingMsg(msg); setEditContent(stripHtml(msg.content)); };
  const handleEditSave = () => {
    if (!socketRef?.current?.connected || !editingMsg) return;
    socketRef.current.emit('edit-message', { messageId: editingMsg.id, content: editContent });
    setEditingMsg(null);
  };

  /* ── 메시지 삭제 */
  const handleDelete = (messageId) => {
    Modal.confirm({
      title: '메시지 삭제', content: '이 메시지를 삭제하시겠습니까?',
      onOk: () => { if (!socketRef?.current?.connected) return; socketRef.current.emit('delete-message', { messageId }); },
      okText: '삭제', cancelText: '취소', okButtonProps: { danger: true },
    });
  };

  /* ── 고정 */
  const handlePin = async (messageId) => {
    try {
      const res = await chatApi.togglePin(messageId);
      if (socketRef?.current) socketRef.current.emit('pin-message', { messageId, pinned: res.pinned });
      antMsg.success(res.pinned ? '고정되었습니다.' : '고정이 해제되었습니다.');
      if (pinnedPanel) { const data = await chatApi.getPinnedMessages(activeRoomId); setPinnedMsgs(data); }
    } catch { antMsg.error('처리 실패'); }
  };
  const handleOpenPinned = async () => {
    try { const data = await chatApi.getPinnedMessages(activeRoomId); setPinnedMsgs(data); setPinnedPanel(true); }
    catch { antMsg.error('불러오기 실패'); }
  };

  /* ── 저장 */
  const handleSaveMsg = async (messageId) => {
    try { const res = await chatApi.toggleSave(messageId); antMsg.success(res.saved ? '저장되었습니다.' : '저장이 취소되었습니다.'); }
    catch { antMsg.error('처리 실패'); }
  };
  const handleOpenSaved = async () => {
    try { const data = await chatApi.getSavedMessages(); setSavedMessages(data); setSavedPanel(true); }
    catch { antMsg.error('불러오기 실패'); }
  };

  /* ── 전달 */
  const handleForward = (msg) => { setForwardMsg(msg); setForwardTargets([]); };
  const handleForwardSend = async () => {
    if (!forwardMsg || forwardTargets.length === 0) return;
    try { await chatApi.forwardMessage(forwardMsg.id, forwardTargets); antMsg.success('전달되었습니다.'); setForwardMsg(null); }
    catch { antMsg.error('전달 실패'); }
  };

  /* ── 읽지 않음 */
  const handleMarkUnread = async (msg) => {
    if (!activeRoomId) return;
    try { await chatApi.markUnread(activeRoomId, msg.id); antMsg.success('읽지 않음으로 표시되었습니다.'); }
    catch { antMsg.error('처리 실패'); }
  };

  /* ── 검색 */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try { const data = await chatApi.searchMessages({ q: searchQuery, roomId: activeRoomId || undefined }); setSearchResults(data); }
    catch { antMsg.error('검색 실패'); }
    finally { setSearching(false); }
  };

  /* ── 공개 채널 */
  const openPublicModal = async () => {
    try { const data = await chatApi.getPublicRooms(); setPublicRooms(data); setPublicModal(true); }
    catch { antMsg.error('불러오기 실패'); }
  };
  const handleJoinPublic = async (roomId) => {
    try {
      const room = await chatApi.joinPublicRoom(roomId);
      upsertRoom({ ...room, unread: 0, isFavorite: false, isMuted: false });
      if (socketRef?.current) socketRef.current.emit('join-room', roomId);
      setActiveRoom(roomId);
      setPublicModal(false);
      antMsg.success('채널에 참여했습니다.');
    } catch { antMsg.error('참여 실패'); }
  };

  /* ── 채널 정보 수정 */
  const handleEditRoom = () => {
    if (!activeRoom) return;
    editRoomForm.setFieldsValue({ name: activeRoom.name, description: activeRoom.description || '' });
    setEditRoomModal(true);
  };
  const handleEditRoomSave = async () => {
    try {
      const values = await editRoomForm.validateFields();
      await chatApi.updateRoom(activeRoomId, values);
      upsertRoom({ id: activeRoomId, ...values });
      setEditRoomModal(false);
      antMsg.success('채널 정보가 수정되었습니다.');
    } catch (err) { if (err?.errorFields) return; antMsg.error('수정 실패'); }
  };

  /* ── @멘션 자동완성 */
  const handleMentionInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const text = range.startContainer.textContent || '';
    const offset = range.startOffset;
    const lastAt = text.lastIndexOf('@', offset - 1);
    if (lastAt !== -1 && offset - lastAt <= 20) {
      const query = text.slice(lastAt + 1, offset);
      if (!/\s/.test(query)) {
        const rect = range.getBoundingClientRect();
        setMentionPos({ top: rect.top - 8, left: rect.left });
        setMentionQuery(query);
        setMentionActive(true);
        setMentionIndex(0);
        return;
      }
    }
    setMentionActive(false);
  }, []);

  const insertMention = useCallback((member) => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const text = range.startContainer.textContent || '';
    const offset = range.startOffset;
    const lastAt = text.lastIndexOf('@', offset - 1);
    if (lastAt !== -1) {
      range.setStart(range.startContainer, lastAt);
      range.setEnd(range.startContainer, offset);
      range.deleteContents();
    }
    const chip = document.createElement('span');
    chip.className = 'mention-chip';
    chip.dataset.userId = member.user.id;
    chip.contentEditable = 'false';
    chip.textContent = `@${member.user.username}`;
    range.insertNode(chip);
    const space = document.createTextNode(' ');
    chip.after(space);
    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    setMentionActive(false);
    setMentionQuery('');
  }, []);

  /* ── 멘션 포함 handleKeyDown */
  const handleKeyDown = (e, isThread = false) => {
    if (mentionActive && !isThread) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionMembers.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (mentionMembers[mentionIndex]) insertMention(mentionMembers[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionActive(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(isThread); }
  };

  /* ── 이모지 삽입 */
  const insertEmoji = useCallback((emoji) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const text = document.createTextNode(emoji.native || emoji.unified ? String.fromCodePoint(...emoji.unified.split('-').map((u) => parseInt(u, 16))) : '');
    if (range) { range.deleteContents(); range.insertNode(text); range.setStartAfter(text); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    else { editor.innerHTML += text.textContent; }
    setEmojiOpen(false);
  }, []);

  /* ── 예약 발송 */
  const handleScheduleSend = async () => {
    if (!scheduleDate || !activeRoomId) return;
    const html = editorRef.current?.innerHTML || '';
    if (!html.trim()) return;
    try {
      await chatApi.createScheduledMessage(activeRoomId, { content: html, scheduledAt: scheduleDate.toISOString() });
      editorRef.current.innerHTML = '';
      setScheduleModal(false);
      setScheduleDate(null);
      antMsg.success('메시지가 예약되었습니다.');
    } catch { antMsg.error('예약 실패'); }
  };

  /* ── 공지 설정 */
  const handleSetAnnouncement = async (text) => {
    if (!activeRoomId) return;
    try {
      await chatApi.setAnnouncement(activeRoomId, text);
      upsertRoom({ id: activeRoomId, announcement: text });
      antMsg.success('공지가 설정되었습니다.');
    } catch { antMsg.error('공지 설정 실패'); }
  };

  /* ── 내 상태 저장 */
  const handleSaveStatus = async () => {
    try {
      await setMyStatus(statusEmoji, statusText);
      antMsg.success('상태가 변경되었습니다.');
      setStatusModal(false);
    } catch { antMsg.error('상태 변경 실패'); }
  };

  if (!user) return null;

  const headerMenuItems = [
    { key: 'favorite', label: activeRoom?.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가', icon: activeRoom?.isFavorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />, onClick: handleToggleFavorite },
    { key: 'mute', label: activeRoom?.isMuted ? '알림 켜기' : '알림 끄기', icon: activeRoom?.isMuted ? <BellOutlined /> : <BellFilled />, onClick: handleToggleMute },
    { key: 'pinned', label: '고정 메시지', icon: <PushpinOutlined />, onClick: handleOpenPinned },
    ...(activeRoom?.type !== 'direct' && activeRoom?.createdBy === user.id ? [
      { key: 'edit', label: '채널 정보 수정', icon: <EditOutlined />, onClick: handleEditRoom },
      { key: 'archive', label: activeRoom?.isArchived ? '보관 해제' : '채널 보관', icon: <FolderOutlined />, onClick: handleToggleArchive },
      {
        key: 'announcement', label: '채널 공지 설정', icon: <NotificationOutlined />,
        onClick: () => {
          Modal.confirm({
            title: '채널 공지 설정',
            content: <Input.TextArea defaultValue={activeRoom?.announcement || ''} id="ann-input" rows={3} maxLength={500} showCount />,
            onOk: () => { const el = document.getElementById('ann-input'); if (el) handleSetAnnouncement(el.value); },
            okText: '저장', cancelText: '취소',
          });
        },
      },
    ] : []),
    { type: 'divider' },
    { key: 'leave', label: '채팅방 나가기', icon: <LogoutOutlined />, danger: true, onClick: handleLeave },
  ];

  /* ── 헬퍼: 아이템 공통 렌더 */
  const renderRoomItem = (room) => (
    <RoomItem
      key={room.id}
      room={room}
      isActive={room.id === activeRoomId}
      myId={user.id}
      onClick={() => setActiveRoom(room.id)}
      onlineUserIds={onlineUserIds}
      onToggleFavorite={handleToggleFavorite}
    />
  );

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--fd-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--fd-border)' }}>

      {/* ══ 왼쪽 사이드바 ══ */}
      <div style={{ width: 252, minWidth: 252, borderRight: '1px solid var(--fd-border)', display: 'flex', flexDirection: 'column', background: 'var(--fd-surface-sunken)' }}>

        {/* 사이드바 헤더 */}
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--fd-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <MessageOutlined style={{ fontSize: 15, color: '#1677ff' }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--fd-text-primary)' }}>채팅</span>
              {totalUnread > 0 && <Badge count={totalUnread} size="small" />}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              <Tooltip title="메시지 검색">
                <Button type="text" size="small" icon={<SearchOutlined />} onClick={() => setSearchOpen(true)} style={{ color: '#999', width: 26, height: 26, padding: 0 }} />
              </Tooltip>
              <Tooltip title="저장된 메시지">
                <Button type="text" size="small" icon={<BookOutlined />} onClick={handleOpenSaved} style={{ color: '#999', width: 26, height: 26, padding: 0 }} />
              </Tooltip>
              <Tooltip title="공개 채널 탐색">
                <Button type="text" size="small" icon={<GlobalOutlined />} onClick={openPublicModal} style={{ color: '#999', width: 26, height: 26, padding: 0 }} />
              </Tooltip>
              <Tooltip title="새 채팅 만들기">
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openNewRoomModal} style={{ height: 26, width: 26, padding: 0 }} />
              </Tooltip>
            </div>
          </div>
          {/* 보관 토글 */}
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: showArchived ? '#1677ff' : '#bbb', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit' }}
          >
            <FolderOutlined /> {showArchived ? '활성 채널 보기' : '보관된 채널 보기'}
          </button>
        </div>

        {/* 섹션 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 10px' }}>
          {loadingRooms ? (
            <div style={{ textAlign: 'center', padding: 30 }}><Spin size="small" /></div>
          ) : (
            <>
              {/* 즐겨찾기 */}
              <div style={{ marginBottom: 4 }}>
                <SectionHeader label="즐겨찾기" open={expandFav} onToggle={() => setExpandFav((v) => !v)} />
                {expandFav && (
                  favRooms.length > 0
                    ? favRooms.map(renderRoomItem)
                    : <div style={{ fontSize: 12, color: '#ccc', padding: '4px 18px' }}>별표로 즐겨찾기를 추가하세요.</div>
                )}
              </div>

              {/* 채널 */}
              {(channelRooms.length > 0 || !showArchived) && (
                <div style={{ marginBottom: 4 }}>
                  <SectionHeader
                    label="채널"
                    open={expandChannel}
                    onToggle={() => setExpandChannel((v) => !v)}
                    onAdd={openNewRoomModal}
                    addTitle="채널 추가"
                  />
                  {expandChannel && (
                    channelRooms.length > 0
                      ? channelRooms.map(renderRoomItem)
                      : <div style={{ fontSize: 12, color: '#ccc', padding: '4px 18px' }}>채널이 없습니다.</div>
                  )}
                </div>
              )}

              {/* 다이렉트 메시지 */}
              <div>
                <SectionHeader
                  label="다이렉트 메시지"
                  open={expandDM}
                  onToggle={() => setExpandDM((v) => !v)}
                  onAdd={openNewRoomModal}
                  addTitle="DM 시작"
                />
                {expandDM && (
                  dmRooms.length > 0
                    ? dmRooms.map(renderRoomItem)
                    : <div style={{ fontSize: 12, color: '#ccc', padding: '4px 18px' }}>대화가 없습니다.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ 중앙: 메시지 영역 ══ (패널 전체가 드롭 존) */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
      >
        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(22,119,255,0.07)', border: '2px dashed #1677ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
            <PaperClipOutlined style={{ fontSize: 40, color: '#1677ff' }} />
            <span style={{ color: '#1677ff', fontWeight: 600, fontSize: 15 }}>파일을 여기에 놓으세요</span>
          </div>
        )}
        {!activeRoomId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: '#ccc' }}>
            <MessageOutlined style={{ fontSize: 52, opacity: 0.15 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: '#bbb' }}>채팅방을 선택하세요</div>
            <div style={{ fontSize: 13, color: '#ccc' }}>왼쪽 목록에서 채팅방을 선택하거나 새 채팅을 시작해보세요.</div>
          </div>
        ) : (
          <>
            {/* 채팅방 헤더 */}
            <div style={{ height: 52, padding: '0 16px', borderBottom: '1px solid var(--fd-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--fd-surface)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {activeRoom && roomAvatar(activeRoom, user.id, 30)}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {activeRoom && <RoomTypeIcon type={activeRoom.type} size={12} />}
                    <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--fd-text-primary)' }}>
                      {activeRoom ? roomDisplayName(activeRoom, user.id) : ''}
                    </span>
                  </div>
                  {activeRoom?.type === 'direct' && (() => {
                    const other = activeRoom.members?.find((m) => m.userId !== user.id);
                    const online = other ? onlineUserIds.has(other.userId) : false;
                    return (
                      <div style={{ fontSize: 11, color: online ? '#52c41a' : '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#52c41a' : '#d9d9d9', display: 'inline-block' }} />
                        {online ? '온라인' : '오프라인'}
                      </div>
                    );
                  })()}
                  {activeRoom?.type !== 'direct' && activeRoom?.description && (
                    <div style={{ fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeRoom.description}</div>
                  )}
                  {activeRoom?.type !== 'direct' && !activeRoom?.description && (
                    <div style={{ fontSize: 11, color: '#ccc' }}>멤버 {activeRoom?.members?.length || 0}명</div>
                  )}
                </div>
              </div>
              <Dropdown menu={{ items: headerMenuItems }} trigger={['click']} placement="bottomRight">
                <Button type="text" icon={<MoreOutlined />} style={{ color: '#aaa' }} size="small" />
              </Dropdown>
            </div>

            {/* 채널 공지 배너 */}
            {activeRoom?.announcement && (
              <div style={{ padding: '6px 16px', background: '#fffbe6', borderBottom: '1px solid #ffe58f', display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                <NotificationOutlined style={{ color: '#faad14', marginTop: 2, flexShrink: 0 }} />
                <span style={{ color: '#7a4f00', flex: 1, lineHeight: 1.5 }}>{activeRoom.announcement}</span>
                {activeRoom.createdBy === user.id && (
                  <Button type="text" size="small" icon={<CloseOutlined />} style={{ color: '#faad14', flexShrink: 0 }}
                    onClick={() => handleSetAnnouncement('')} />
                )}
              </div>
            )}

            {/* 메시지 목록 */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div ref={messagesBoxRef} onScroll={handleScroll} onClick={handleChatLinkClick} style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
                {loadingMsgs && hasMore && <div style={{ textAlign: 'center', padding: '10px 0' }}><Spin size="small" /></div>}
                {activeMessages.length === 0 && !loadingMsgs && (
                  <div style={{ textAlign: 'center', color: '#ccc', fontSize: 13, marginTop: 40 }}>첫 메시지를 보내보세요 👋</div>
                )}
                {activeMessages.map((msg, i) => {
                  const prev = activeMessages[i - 1] || null;
                  const showDate = !prev || !dayjs(msg.createdAt).isSame(dayjs(prev.createdAt), 'day');
                  return (
                    <div key={msg.id}>
                      {showDate && <DateDivider date={msg.createdAt} />}
                      <MessageBubble
                        msg={msg} prevMsg={prev} myId={user.id}
                        onReact={handleReact}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onPin={handlePin}
                        onSave={handleSaveMsg}
                        onForward={handleForward}
                        onMarkUnread={handleMarkUnread}
                        onOpenThread={handleOpenThread}
                        roomMembers={activeRoom?.members || []}
                        memberReadAt={memberReadAt[activeRoomId] || {}}
                      />
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* 타이핑 인디케이터 */}
            {(() => {
              const typers = Object.values(typingUsers[activeRoomId] || {});
              if (typers.length === 0) return <div style={{ height: 24 }} />;
              const names = typers.map((t) => t.displayName).join(', ');
              return (
                <div style={{ padding: '2px 20px 2px', display: 'flex', alignItems: 'center', gap: 7, height: 24 }}>
                  <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#aaa', animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`, display: 'inline-block' }} />
                    ))}
                  </span>
                  <span style={{ fontSize: 11, color: '#aaa' }}>{names}님이 입력 중...</span>
                </div>
              );
            })()}

            {/* 메시지 수정 모드 */}
            {editingMsg && (
              <div style={{ padding: '7px 14px', background: '#fffbe6', borderTop: '1px solid #ffe58f', display: 'flex', alignItems: 'center', gap: 8 }}>
                <EditOutlined style={{ color: '#faad14' }} />
                <span style={{ fontSize: 12, color: '#888' }}>메시지 수정 중</span>
                <Input value={editContent} onChange={(e) => setEditContent(e.target.value)} onPressEnter={handleEditSave} size="small" style={{ flex: 1 }} />
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleEditSave}>저장</Button>
                <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingMsg(null)}>취소</Button>
              </div>
            )}

            {/* 입력 영역 */}
            <div style={{ padding: '6px 72px 8px 14px', background: 'var(--fd-surface)', flexShrink: 0 }}>
              <div style={{ border: '1px solid var(--fd-border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                onFocus={() => {}} // handled per element
              >
                {/* 서식 툴바 */}
                <FormatToolbar
                  editorRef={editorRef}
                  fontSize={fontSize} setFontSize={setFontSize}
                  fontFamily={fontFamily} setFontFamily={setFontFamily}
                  fontColor={fontColor} setFontColor={setFontColor}
                />

                {/* 파일 미리보기 */}
                {pendingFile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--fd-border)', background: 'var(--fd-surface-sunken)' }}>
                    {pendingFile.previewUrl
                      ? <img src={pendingFile.previewUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                      : <FileTypeIcon type={pendingFile.type} size={22} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{fmtSize(pendingFile.size)}</div>
                    </div>
                    <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setPendingFile(null)} style={{ color: '#aaa' }} />
                  </div>
                )}

                {/* 입력 행 */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, padding: '5px 8px' }}>
                  {/* 파일 첨부 */}
                  <Tooltip title="파일 첨부 (최대 20MB)">
                    <label htmlFor="chat-page-file-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, cursor: 'pointer', color: '#bbb', borderRadius: 6, flexShrink: 0, transition: 'color 0.12s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
                    >
                      <PaperClipOutlined style={{ fontSize: 16 }} />
                    </label>
                  </Tooltip>
                  <input id="chat-page-file-input" type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={(e) => { applyFile(e.target.files?.[0]); e.target.value = ''; }} />

                  {/* 에디터 */}
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    onInput={() => { emitTyping(); handleMentionInput(); }}
                    data-placeholder="메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
                    style={{ flex: 1, minHeight: 28, maxHeight: 80, overflowY: 'auto', padding: '4px 8px', fontSize: `${fontSize}px`, fontFamily: fontFamily || 'inherit', color: fontColor, border: 'none', outline: 'none', lineHeight: 1.5, wordBreak: 'break-word', background: 'transparent', cursor: 'text' }}
                  />

                  {/* 이모지 픽커 */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Tooltip title="이모지">
                      <Button type="text" size="small" icon={<SmileOutlined />}
                        onClick={() => setEmojiOpen((v) => !v)}
                        style={{ width: 28, height: 28, padding: 0, color: emojiOpen ? '#1677ff' : '#bbb' }} />
                    </Tooltip>
                    {emojiOpen && createPortal(
                      <div style={{ position: 'fixed', bottom: 70, right: 260, zIndex: 1100 }}
                        onMouseDown={(e) => e.stopPropagation()}>
                        <EmojiPicker data={emojiData} onEmojiSelect={insertEmoji}
                          theme="light" locale="ko" previewPosition="none" skinTonePosition="none" />
                      </div>,
                      document.body
                    )}
                  </div>

                  {/* 예약 발송 */}
                  <Tooltip title="예약 발송">
                    <Button type="text" size="small" icon={<ClockCircleOutlined />}
                      onClick={() => setScheduleModal(true)}
                      style={{ width: 28, height: 28, padding: 0, color: '#bbb', flexShrink: 0 }} />
                  </Tooltip>

                  {/* 전송 */}
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => handleSend(false)}
                    loading={sending || uploadingFile}
                    style={{ flexShrink: 0, height: 28, width: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══ 오른쪽: 정보 패널 (멤버·파일) ══ */}
      {activeRoomId && (
        <div style={{ width: 230, minWidth: 230, borderLeft: '1px solid var(--fd-border)', display: 'flex', flexDirection: 'column', background: 'var(--fd-surface-sunken)', overflowY: 'auto' }}>
          {/* 패널 헤더 */}
          <div style={{ padding: '0 14px', height: 52, borderBottom: '1px solid var(--fd-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fd-text-primary)' }}>정보</span>
            <Tooltip title="내 상태 설정">
              <Button type="text" size="small" icon={<SmileOutlined />} style={{ color: '#bbb' }}
                onClick={() => {
                  const me = activeRoom?.members?.find((m) => m.userId === user.id);
                  setStatusEmoji(me?.user?.statusEmoji || '');
                  setStatusText(me?.user?.statusText || '');
                  setStatusModal(true);
                }} />
            </Tooltip>
          </div>

          {/* 멤버 섹션 */}
          <div style={{ padding: '14px 14px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              멤버 {activeRoom?.members?.length || 0}명
            </div>
            {(activeRoom?.members || []).map((m) => {
              const isOnline = onlineUserIds.has(m.userId);
              const hasStatus = m.user?.statusEmoji || m.user?.statusText;
              return (
                <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <UserAvatar user={m.user} size={26} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? '#52c41a' : '#d9d9d9', border: '1.5px solid #fafbfc', position: 'absolute', bottom: 0, right: 0, display: 'block' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fd-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.user?.displayName}</div>
                    {hasStatus ? (
                      <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.user.statusEmoji} {m.user.statusText}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: isOnline ? '#52c41a' : '#bbb' }}>{isOnline ? '온라인' : '오프라인'}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--fd-border)', margin: '4px 0' }} />

          {/* 고정 메시지 섹션 */}
          <div style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>고정 메시지</div>
            <button
              type="button"
              onClick={handleOpenPinned}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--fd-border)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', width: '100%', color: 'var(--fd-text-secondary)', fontSize: 12, transition: 'background 0.12s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <PushpinOutlined style={{ color: '#1677ff' }} />
              <span>고정 메시지 보기</span>
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--fd-border)', margin: '4px 0' }} />

          {/* 공유 파일 섹션 */}
          {(() => {
            const allMsgs = messages[activeRoomId] || [];
            const fileMsgs = allMsgs.filter((m) => m.fileUrl && !m.isDeleted);
            return (
              <div style={{ padding: '10px 14px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  공유 파일 {fileMsgs.length > 0 ? `(${fileMsgs.length})` : ''}
                </div>
                {fileMsgs.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#ccc' }}>공유된 파일이 없습니다.</div>
                ) : (
                  fileMsgs.slice(0, 10).map((m) => {
                    const isImage = m.fileType?.startsWith('image/');
                    const fullUrl = `${BACKEND}${m.fileUrl}`;
                    return (
                      <a
                        key={m.id}
                        href={fullUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', textDecoration: 'none', borderBottom: '1px solid #f5f5f5' }}
                      >
                        {isImage
                          ? <img src={fullUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--fd-border)' }} />
                          : <FileOutlined style={{ fontSize: 24, color: '#1677ff', flexShrink: 0 }} />
                        }
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: 'var(--fd-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{m.fileName || '파일'}</div>
                          <div style={{ fontSize: 10, color: '#bbb' }}>{m.sender?.displayName} · {dayjs(m.createdAt).format('MM/DD')}</div>
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ══ 오른쪽: 스레드 패널 ══ */}
      {threadData && (
        <div style={{ width: 340, minWidth: 340, borderLeft: '1px solid var(--fd-border)', display: 'flex', flexDirection: 'column', background: 'var(--fd-surface-sunken)' }}>
          <div style={{ padding: '0 14px', height: 52, borderBottom: '1px solid var(--fd-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fd-text-primary)' }}>스레드</span>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={closeThread} style={{ color: '#aaa' }} />
          </div>

          {/* 원본 메시지 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--fd-border)', background: 'var(--fd-surface)' }}>
            {threadData.parent && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <UserAvatar user={threadData.parent.sender} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fd-text-primary)' }}>{threadData.parent.sender?.displayName}</span>
                    <span style={{ fontSize: 11, color: '#c0c0c0' }}>{fmtTime(threadData.parent.createdAt)}</span>
                  </div>
                  {threadData.parent.content && (
                    <div dangerouslySetInnerHTML={{ __html: highlightMentions(threadData.parent.content) }} style={{ fontSize: 13, color: 'var(--fd-text-primary)', wordBreak: 'break-word', lineHeight: 1.6 }} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 답글 수 헤더 */}
          {threadData.replies.length > 0 && (
            <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>{threadData.replies.length}개의 답글</span>
              <div style={{ flex: 1, height: 1, background: 'var(--fd-border)' }} />
            </div>
          )}

          {/* 답글 목록 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {threadData.replies.length === 0 && (
              <div style={{ textAlign: 'center', color: '#ccc', fontSize: 13, marginTop: 24 }}>아직 답글이 없습니다.</div>
            )}
            {threadData.replies.map((msg, i) => {
              const prev = threadData.replies[i - 1] || null;
              const isGrouped = !!prev && prev.senderId === msg.senderId && dayjs(msg.createdAt).diff(dayjs(prev.createdAt), 'minute') < 5;
              return (
                <div
                  key={msg.id}
                  style={{ display: 'flex', gap: 0, alignItems: 'flex-start', padding: `${isGrouped ? 1 : 10}px 16px 2px`, position: 'relative' }}
                >
                  <div style={{ width: 32, flexShrink: 0, marginRight: 8, display: 'flex', alignItems: isGrouped ? 'center' : 'flex-start', justifyContent: 'center', paddingTop: isGrouped ? 0 : 2 }}>
                    {isGrouped
                      ? <span style={{ fontSize: 9, color: '#ddd', whiteSpace: 'nowrap' }}>{dayjs(msg.createdAt).format('HH:mm')}</span>
                      : <UserAvatar user={msg.sender} size={28} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {!isGrouped && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fd-text-primary)' }}>{msg.sender?.displayName}</span>
                        <span style={{ fontSize: 10, color: '#c0c0c0' }}>{fmtTime(msg.createdAt)}</span>
                      </div>
                    )}
                    {msg.isDeleted
                      ? <span style={{ fontSize: 13, color: '#ccc', fontStyle: 'italic' }}>삭제된 메시지입니다.</span>
                      : (
                        <>
                          {msg.content && <div dangerouslySetInnerHTML={{ __html: highlightMentions(msg.content) }} style={{ fontSize: 13, color: 'var(--fd-text-primary)', wordBreak: 'break-word', lineHeight: 1.6 }} />}
                          {msg.fileUrl && <FileAttachment msg={msg} />}
                        </>
                      )
                    }
                    {(msg.reactions || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {groupReactions(msg.reactions).map((r) => (
                          <button key={r.emoji} type="button" onClick={() => handleReact(msg.id, r.emoji)}
                            style={{ background: 'var(--fd-surface-sunken)', border: '1px solid var(--fd-border)', borderRadius: 10, padding: '1px 7px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }}>
                            {r.emoji} <span style={{ fontSize: 11, color: 'var(--fd-text-secondary)' }}>{r.users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 스레드 입력 */}
          <div style={{ padding: '8px 12px 12px', background: 'var(--fd-surface)', borderTop: '1px solid var(--fd-border)' }}>
            {threadFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '5px 8px', background: 'var(--fd-surface-sunken)', borderRadius: 6 }}>
                <FileTypeIcon type={threadFile.type} size={16} />
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{threadFile.name}</span>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setThreadFile(null)} style={{ color: '#aaa' }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, border: '1px solid var(--fd-border)', borderRadius: 8, padding: '6px 8px', background: 'var(--fd-surface-sunken)' }}>
              <label htmlFor="thread-file-input" style={{ cursor: 'pointer', color: '#ccc', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 0.12s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc'; }}
              >
                <PaperClipOutlined style={{ fontSize: 15 }} />
              </label>
              <input id="thread-file-input" type="file" ref={threadFileRef} style={{ display: 'none' }} onChange={(e) => { applyFile(e.target.files?.[0], true); e.target.value = ''; }} />
              <div
                ref={threadEditorRef}
                contentEditable
                suppressContentEditableWarning
                onKeyDown={(e) => handleKeyDown(e, true)}
                data-placeholder="답글 입력..."
                style={{ flex: 1, minHeight: 32, maxHeight: 100, overflowY: 'auto', padding: '4px 6px', fontSize: 13, border: 'none', outline: 'none', lineHeight: 1.55, wordBreak: 'break-word', background: 'transparent', cursor: 'text' }}
              />
              <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleSend(true)} loading={threadSending}
                style={{ height: 30, width: 30, padding: 0, flexShrink: 0, borderRadius: 6 }} />
            </div>
          </div>
        </div>
      )}

      {/* ══ 새 채팅방 생성 모달 ══ */}
      <Modal title="새 채팅 만들기" open={newRoomModal} onOk={handleCreateRoom} onCancel={() => setNewRoomModal(false)} okText="만들기" cancelText="취소" confirmLoading={creating} width={440} destroyOnHidden>
        <Form form={newRoomForm} layout="vertical" style={{ marginTop: 12 }} initialValues={{ type: 'direct' }}>
          <Form.Item name="type" label="채팅 유형">
            <Radio.Group onChange={() => newRoomForm.setFieldsValue({ memberIds: undefined })}>
              <Radio value="direct"><UserOutlined /> 1:1 대화</Radio>
              <Radio value="group"><TeamOutlined /> 그룹 채팅</Radio>
              <Radio value="public"><GlobalOutlined /> 공개 채널</Radio>
              <Radio value="private"><LockOutlined /> 비공개 채널</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) => ['group', 'public', 'private'].includes(getFieldValue('type')) && (
              <>
                <Form.Item name="name" label="채널 이름" rules={[{ required: true, message: '이름을 입력해주세요.' }]}>
                  <Input placeholder="예) 개발팀 채널" />
                </Form.Item>
                <Form.Item name="description" label="설명 (선택)">
                  <Input.TextArea placeholder="채널 설명을 입력하세요." rows={2} />
                </Form.Item>
              </>
            )}
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) => {
              const t = getFieldValue('type');
              if (t === 'public') return null;
              return (
                <Form.Item name="memberIds" label="대화 상대" rules={[{ required: t !== 'public', message: '상대방을 선택해주세요.' }]}>
                  <Select mode={t !== 'direct' ? 'multiple' : undefined} placeholder="사용자를 선택하세요 (이름·부서 검색)" filterOption={filterUserOption} showSearch style={{ width: '100%' }} getPopupContainer={(trigger) => trigger.parentElement}
                    options={buildUserOptions(allUsers, getMyDepartment())} />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* ══ 공개 채널 탐색 모달 ══ */}
      <Modal title={<><GlobalOutlined /> 공개 채널 탐색</>} open={publicModal} onCancel={() => setPublicModal(false)} footer={null} width={500}>
        {publicRooms.length === 0
          ? <Empty description="공개 채널이 없습니다." />
          : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {publicRooms.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderBottom: '1px solid var(--fd-border)' }}>
                  <Avatar icon={<GlobalOutlined />} style={{ background: '#52c41a', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                    {r.description && <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
                    <div style={{ fontSize: 11, color: '#bbb' }}>멤버 {r._count?.members || 0}명</div>
                  </div>
                  {r.joined
                    ? <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 600 }}>참여 중</span>
                    : <Button size="small" type="primary" onClick={() => handleJoinPublic(r.id)}>참여</Button>
                  }
                </div>
              ))}
            </div>
          )
        }
      </Modal>

      {/* ══ 고정 메시지 패널 ══ */}
      <ResizableDrawer title={<><PushpinOutlined /> 고정 메시지</>} open={pinnedPanel} onClose={() => setPinnedPanel(false)} width={380} placement="right">
        {pinnedMsgs.length === 0 ? <Empty description="고정된 메시지가 없습니다." /> : (
          <div>
            {pinnedMsgs.map((p) => (
              <div key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <UserAvatar user={p.message.sender} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--fd-text-primary)' }}>{p.message.sender?.displayName}</span>
                      {' · '}{dayjs(p.message.createdAt).format('MM/DD HH:mm')}
                    </div>
                    {p.message.content && <div dangerouslySetInnerHTML={{ __html: p.message.content }} style={{ fontSize: 13, wordBreak: 'break-word' }} />}
                  </div>
                  <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => handlePin(p.message.id)} style={{ color: '#ccc' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </ResizableDrawer>

      {/* ══ 저장 메시지 패널 ══ */}
      <ResizableDrawer title={<><BookOutlined /> 저장된 메시지</>} open={savedPanel} onClose={() => setSavedPanel(false)} width={400} placement="right">
        {savedMessages.length === 0 ? <Empty description="저장된 메시지가 없습니다." /> : (
          <div>
            {savedMessages.map((s) => (
              <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                  <span style={{ color: '#1677ff', fontWeight: 500 }}>{s.message.room?.name || 'DM'}</span>
                  {' · '}{s.message.sender?.displayName}
                  {' · '}{dayjs(s.message.createdAt).format('MM/DD HH:mm')}
                </div>
                {s.message.content && <div dangerouslySetInnerHTML={{ __html: s.message.content }} style={{ fontSize: 13, wordBreak: 'break-word' }} />}
              </div>
            ))}
          </div>
        )}
      </ResizableDrawer>

      {/* ══ 검색 패널 ══ */}
      <ResizableDrawer title={<><SearchOutlined /> 메시지 검색</>} open={searchOpen} onClose={() => { setSearchOpen(false); setSearchResults([]); setSearchQuery(''); }} width={420} placement="right">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input placeholder="검색어 입력..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onPressEnter={handleSearch} allowClear />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={searching}>검색</Button>
        </div>
        {searchResults.length === 0 && !searching && searchQuery && <Empty description="검색 결과가 없습니다." />}
        {searchResults.map((msg) => (
          <div key={msg.id} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
            onClick={() => { setSearchOpen(false); setActiveRoom(msg.roomId); }}>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
              <span style={{ color: '#1677ff', fontWeight: 500 }}>{msg.room?.name || 'DM'}</span>
              {' · '}<span style={{ fontWeight: 600, color: 'var(--fd-text-primary)' }}>{msg.sender?.displayName}</span>
              {' · '}{dayjs(msg.createdAt).format('MM/DD HH:mm')}
            </div>
            {msg.content && <div dangerouslySetInnerHTML={{ __html: msg.content }} style={{ fontSize: 13, wordBreak: 'break-word', maxHeight: 60, overflow: 'hidden' }} />}
          </div>
        ))}
      </ResizableDrawer>

      {/* ══ 메시지 전달 모달 ══ */}
      <Modal title={<><ShareAltOutlined /> 메시지 전달</>} open={!!forwardMsg} onOk={handleForwardSend} onCancel={() => setForwardMsg(null)} okText="전달" cancelText="취소" okButtonProps={{ disabled: forwardTargets.length === 0 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>전달할 채팅방 선택</div>
          <Select mode="multiple" style={{ width: '100%' }} placeholder="채팅방을 선택하세요" value={forwardTargets} onChange={setForwardTargets}
            options={rooms.filter((r) => r.id !== activeRoomId).map((r) => ({ value: r.id, label: roomDisplayName(r, user.id) }))} />
        </div>
        {forwardMsg?.content && (
          <div style={{ padding: '8px 12px', background: 'var(--fd-surface-sunken)', borderRadius: 6, fontSize: 13, maxHeight: 80, overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: forwardMsg.content }} />
        )}
      </Modal>

      {/* ══ 채널 정보 수정 모달 ══ */}
      <Modal title={<><EditOutlined /> 채널 정보 수정</>} open={editRoomModal} onOk={handleEditRoomSave} onCancel={() => setEditRoomModal(false)} okText="저장" cancelText="취소" destroyOnHidden>
        <Form form={editRoomForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="채널 이름" rules={[{ required: true, message: '이름을 입력해주세요.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={3} placeholder="채널 설명을 입력하세요." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ══ @멘션 드롭다운 ══ */}
      {mentionActive && mentionMembers.length > 0 && createPortal(
        <div style={{ position: 'fixed', top: mentionPos.top - 8 - Math.min(mentionMembers.length, 6) * 36, left: mentionPos.left, zIndex: 2000, background: 'var(--fd-surface)', border: '1px solid var(--fd-border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 200, overflow: 'hidden' }}>
          {mentionMembers.map((m, idx) => (
            <div key={m.userId}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: idx === mentionIndex ? '#f0f5ff' : 'transparent', borderLeft: idx === mentionIndex ? '3px solid #1677ff' : '3px solid transparent' }}>
              <UserAvatar user={m.user} size={22} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fd-text-primary)' }}>{m.user.username}</div>
                {m.user.displayName && m.user.displayName !== m.user.username && <div style={{ fontSize: 11, color: '#aaa' }}>{m.user.displayName}</div>}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}

      {/* ══ 예약 발송 모달 ══ */}
      <Modal title={<><ClockCircleOutlined /> 메시지 예약 발송</>} open={scheduleModal}
        onOk={handleScheduleSend} onCancel={() => { setScheduleModal(false); setScheduleDate(null); }}
        okText="예약" cancelText="취소" okButtonProps={{ disabled: !scheduleDate }}>
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--fd-text-secondary)' }}>현재 입력창의 내용을 아래 시간에 발송합니다.</div>
          <DatePicker
            showTime format="YYYY-MM-DD HH:mm"
            value={scheduleDate ? dayjs(scheduleDate) : null}
            onChange={(d) => setScheduleDate(d ? d.toDate() : null)}
            disabledDate={(d) => d && d.isBefore(dayjs(), 'minute')}
            style={{ width: '100%' }}
            placeholder="발송 시간 선택"
          />
        </div>
      </Modal>

      {/* ══ 내 상태 설정 모달 ══ */}
      <Modal title="내 상태 설정" open={statusModal}
        onOk={handleSaveStatus} onCancel={() => setStatusModal(false)}
        okText="저장" cancelText="취소">
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>이모지</div>
            <Input value={statusEmoji} onChange={(e) => setStatusEmoji(e.target.value)} placeholder="예: 🗓️ 🏖️ 💻" maxLength={4} style={{ width: 80 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>상태 메시지</div>
            <Input value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="예: 회의 중, 자리 비움" maxLength={50} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['🗓️', '회의 중'], ['☕', '자리 비움'], ['🏖️', '휴가 중'], ['💻', '재택 근무'], ['', '']].map(([e, t]) => (
              <Button key={e + t} size="small" onClick={() => { setStatusEmoji(e); setStatusText(t); }}
                style={{ fontSize: 12 }}>{e} {t || '상태 초기화'}</Button>
            ))}
          </div>
        </div>
      </Modal>

      <style>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #c0c0c0;
          pointer-events: none;
          font-size: 13px;
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        .chat-msg-content s,
        .chat-msg-content del {
          text-decoration: line-through !important;
        }
        .chat-msg-content span[style] {
          display: inline;
        }
      `}</style>
    </div>
  );
}
