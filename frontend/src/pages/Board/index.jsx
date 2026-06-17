import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Col, Form, Input, Modal, Row, Select, Spin, Typography,
  Avatar, Tooltip, Popconfirm, message, Steps, Radio, Empty, Dropdown,
} from 'antd';
import {
  PlusOutlined, AppstoreOutlined, DeleteOutlined, EditOutlined,
  SearchOutlined, CheckOutlined, StarOutlined, StarFilled,
  FolderOutlined, FolderOpenOutlined, MoreOutlined, RightOutlined,
  DownOutlined, LockOutlined, TeamOutlined, FolderAddOutlined,
} from '@ant-design/icons';
import {
  getBoards, createBoard, updateBoard, deleteBoard, toggleFavorite, createProperty,
} from '../../api/boards';
import {
  getBoardCategories, createBoardCategory, updateBoardCategory, deleteBoardCategory,
  reorderBoardCategories, reorderBoards,
} from '../../api/boardCategories';
import { getUsers } from '../../api/users';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';
import useAuthStore from '../../store/authStore';
import useUnreadStore from '../../store/unreadStore';
import BoardContent from './BoardContent';

const { Title, Text } = Typography;

const ICONS = ['📋', '🗂️', '📌', '🚀', '💡', '🔥', '🎯', '⭐', '🛠️', '📊'];
const CATEGORY_ICONS = ['📁', '🗂️', '👥', '🏢', '🔒', '⭐', '🚀', '🛠️', '📊', '📌'];

const CAT_COLORS = [
  { label: '기본', value: null },
  { label: '파랑', value: '#1677ff' },
  { label: '초록', value: '#52c41a' },
  { label: '보라', value: '#722ed1' },
  { label: '분홍', value: '#eb2f96' },
  { label: '주황', value: '#fa8c16' },
  { label: '회색', value: '#8c8c8c' },
];

const BG_COLORS = [
  { label: '없음', value: null },
  { label: '하늘', value: 'linear-gradient(135deg,#e0f2fe,#bae6fd)' },
  { label: '민트', value: 'linear-gradient(135deg,#d1fae5,#a7f3d0)' },
  { label: '라벤더', value: 'linear-gradient(135deg,#ede9fe,#ddd6fe)' },
  { label: '복숭아', value: 'linear-gradient(135deg,#fce7f3,#fbcfe8)' },
  { label: '황금', value: 'linear-gradient(135deg,#fef9c3,#fde68a)' },
  { label: '슬레이트', value: 'linear-gradient(135deg,#f1f5f9,#e2e8f0)' },
];

const TEMPLATES = [
  { id: 'blank', name: '빈 보드', icon: '📋', description: '처음부터 직접 구성', properties: [] },
  {
    id: 'project', name: '프로젝트 관리', icon: '🚀', description: '업무 카테고리와 마감일로 프로젝트 추적',
    properties: [
      { name: '카테고리', type: 'select', options: [
        { id: 'p1', value: '기획', color: '#722ed1' },
        { id: 'p2', value: '개발', color: '#1677ff' },
        { id: 'p3', value: '디자인', color: '#eb2f96' },
        { id: 'p4', value: 'QA', color: '#fa8c16' },
        { id: 'p5', value: '배포', color: '#52c41a' },
      ] },
      { name: '마감일', type: 'date', options: null },
      { name: '참고 URL', type: 'url', options: null },
    ],
  },
  {
    id: 'bugtracker', name: '버그 트래커', icon: '🐛', description: '버그와 이슈를 심각도별로 추적',
    properties: [
      { name: '심각도', type: 'select', options: [
        { id: 'b1', value: 'Critical', color: '#ff4d4f' },
        { id: 'b2', value: 'High', color: '#fa8c16' },
        { id: 'b3', value: 'Medium', color: '#faad14' },
        { id: 'b4', value: 'Low', color: '#8c8c8c' },
      ] },
      { name: '발견 버전', type: 'text', options: null },
      { name: '재현 여부', type: 'checkbox', options: null },
      { name: '참고 링크', type: 'url', options: null },
    ],
  },
  {
    id: 'content', name: '콘텐츠 캘린더', icon: '📅', description: '콘텐츠 유형별 발행 일정 관리',
    properties: [
      { name: '콘텐츠 유형', type: 'select', options: [
        { id: 'c1', value: '블로그', color: '#1677ff' },
        { id: 'c2', value: 'SNS', color: '#eb2f96' },
        { id: 'c3', value: '뉴스레터', color: '#52c41a' },
        { id: 'c4', value: '영상', color: '#ff4d4f' },
      ] },
      { name: '발행일', type: 'date', options: null },
      { name: '채널', type: 'text', options: null },
    ],
  },
];

const EXPAND_KEY = 'fd_board_cat_expanded';
const UNCATEGORIZED = '__uncategorized__';
const UNREAD_MAX_DISPLAY = 99;

// 안읽음 개수 배지 (채팅 사이드바와 동일한 빨간 알약 스타일)
function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      flexShrink: 0, background: '#ff4d4f', color: '#fff', fontSize: 11, fontWeight: 600,
      lineHeight: '16px', minWidth: 16, height: 16, borderRadius: 8, padding: '0 5px', textAlign: 'center',
    }}>
      {count > UNREAD_MAX_DISPLAY ? `${UNREAD_MAX_DISPLAY}+` : count}
    </span>
  );
}

function getExpandedState() {
  try { return new Set(JSON.parse(localStorage.getItem(EXPAND_KEY) || '[]')); } catch { return new Set(); }
}

export default function BoardWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const boardUnreadMap = useUnreadStore((s) => s.boardUnreadMap);
  const selectedBoardId = id ? Number(id) : null;

  const [boards, setBoards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(getExpandedState); // 접힌 카테고리 id 집합

  // 드래그 상태
  const [dragItem, setDragItem] = useState(null); // { kind:'board'|'cat', id }
  const [dropTarget, setDropTarget] = useState(null); // { kind, id }

  // 보드 생성
  const [boardModalOpen, setBoardModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  // 보드 수정
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm] = Form.useForm();

  // 카테고리 생성/수정
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catMode, setCatMode] = useState('create');
  const [catTarget, setCatTarget] = useState(null);
  const [catForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [b, c, u] = await Promise.all([getBoards(), getBoardCategories(), getUsers()]);
      setBoards(b);
      setCategories(c);
      setUsers(u);
    } catch (err) {
      console.error('보드 워크스페이스 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleCollapse = (catId) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      localStorage.setItem(EXPAND_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const canEditBoard = (board) =>
    user.role === 'admin' || board.members.some(m => m.userId === user.id && m.role === 'owner');

  const canManageCat = (cat) =>
    user.role === 'admin' || cat.createdBy === user.id || (cat.scope === 'personal' && cat.ownerId === user.id);

  // ─── 트리 구성 (카테고리 중첩 지원) ───────────────────────────────────────────
  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q ? boards.filter(b => b.title.toLowerCase().includes(q)) : boards;
    const boardsByCat = new Map();
    for (const b of matched) {
      const key = b.categoryId ?? UNCATEGORIZED;
      if (!boardsByCat.has(key)) boardsByCat.set(key, []);
      boardsByCat.get(key).push(b);
    }
    for (const list of boardsByCat.values()) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title));
    }
    const childrenMap = new Map(); // parentId(null=루트) -> 정렬된 카테고리[]
    for (const c of categories) {
      const pid = c.parentId ?? null;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(c);
    }
    for (const list of childrenMap.values()) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
    }
    return { boardsByCat, childrenMap, uncategorized: boardsByCat.get(UNCATEGORIZED) ?? [] };
  }, [boards, categories, search]);

  // 검색 중 빈 서브트리 숨김용: 카테고리 서브트리에 매칭 보드가 있는지
  const catHasContent = (catId) => {
    if ((tree.boardsByCat.get(catId) ?? []).length > 0) return true;
    return (tree.childrenMap.get(catId) ?? []).some(c => catHasContent(c.id));
  };

  // 카테고리 서브트리(소속 보드 + 하위 카테고리)의 안읽음 합계 — 접힌 카테고리 배지용
  const catUnreadCount = (catId) => {
    let sum = 0;
    for (const b of (tree.boardsByCat.get(catId) ?? [])) sum += boardUnreadMap[b.id] || 0;
    for (const c of (tree.childrenMap.get(catId) ?? [])) sum += catUnreadCount(c.id);
    return sum;
  };

  // dragCat의 하위(자손)인지 검사 — 자기 자신/자손으로의 중첩 방지
  const isDescendantCat = (catId, ancestorId) => {
    let cur = categories.find(c => c.id === catId);
    while (cur && cur.parentId != null) {
      if (cur.parentId === ancestorId) return true;
      cur = categories.find(c => c.id === cur.parentId);
    }
    return false;
  };

  // ─── 보드 생성 ────────────────────────────────────────────────────────────────
  const openCreateBoard = (categoryId = null) => {
    setStep(0);
    setSelectedTemplate('blank');
    form.resetFields();
    form.setFieldsValue({ icon: '📋', memberIds: [user.id], bgColor: null, categoryId });
    setBoardModalOpen(true);
  };

  const handleCreateNext = () => {
    const tpl = TEMPLATES.find(t => t.id === selectedTemplate);
    if (tpl && tpl.icon !== '📋') form.setFieldsValue({ icon: tpl.icon });
    setStep(1);
  };

  const handleCreateBoard = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const created = await createBoard(values);
      const tpl = TEMPLATES.find(t => t.id === selectedTemplate);
      if (tpl?.properties?.length > 0) {
        for (const p of tpl.properties) {
          await createProperty(created.id, { name: p.name, type: p.type, options: p.options });
        }
      }
      setBoards(prev => [{ ...created, isFavorite: false }, ...prev]);
      message.success('보드가 생성되었습니다.');
      setBoardModalOpen(false);
      navigate(`/boards/${created.id}`);
    } catch {
      message.error('저장에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // ─── 보드 수정/삭제/즐겨찾기/이동 ─────────────────────────────────────────────
  const openEditBoard = (board) => {
    setEditTarget(board);
    editForm.setFieldsValue({
      title: board.title,
      description: board.description,
      icon: board.icon || '📋',
      bgColor: board.bgColor || null,
      categoryId: board.categoryId ?? null,
    });
    setEditModalOpen(true);
  };

  const handleEditBoard = async () => {
    try {
      const values = await editForm.validateFields();
      const updated = await updateBoard(editTarget.id, values);
      setBoards(prev => prev.map(b => b.id === updated.id ? { ...updated, isFavorite: b.isFavorite } : b));
      message.success('보드가 수정되었습니다.');
      setEditModalOpen(false);
    } catch {
      message.error('저장에 실패했습니다.');
    }
  };

  const handleDeleteBoard = async (board) => {
    try {
      await deleteBoard(board.id);
      setBoards(prev => prev.filter(b => b.id !== board.id));
      if (selectedBoardId === board.id) navigate('/boards');
      message.success('보드가 삭제되었습니다.');
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const handleFavorite = async (board) => {
    try {
      const { isFavorite } = await toggleFavorite(board.id);
      setBoards(prev => prev.map(b => b.id === board.id ? { ...b, isFavorite } : b));
    } catch { message.error('즐겨찾기 변경 실패'); }
  };

  const handleMoveBoard = async (board, categoryId) => {
    try {
      const updated = await updateBoard(board.id, { categoryId });
      setBoards(prev => prev.map(b => b.id === board.id ? { ...updated, isFavorite: b.isFavorite } : b));
    } catch { message.error('이동에 실패했습니다.'); }
  };

  // ─── 드래그앤드롭: 보드 이동/정렬 ─────────────────────────────────────────────
  // dragged 보드를 targetCatId 그룹의 beforeBoardId 앞(없으면 끝)으로 이동
  const moveBoardTo = async (dragged, targetCatId, beforeBoardId = null) => {
    if (!canEditBoard(dragged)) { message.warning('이동 권한이 없습니다.'); return; }
    const tc = (targetCatId == null || targetCatId === UNCATEGORIZED) ? null : targetCatId;
    const siblings = boards
      .filter(b => (b.categoryId ?? null) === tc && b.id !== dragged.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let idx = siblings.length;
    if (beforeBoardId != null) {
      const i = siblings.findIndex(b => b.id === beforeBoardId);
      if (i >= 0) idx = i;
    }
    siblings.splice(idx, 0, { ...dragged, categoryId: tc });
    const items = siblings.map((b, i) => ({ id: b.id, order: i, categoryId: tc }));
    // 낙관적 반영
    setBoards(prev => prev.map(b => {
      const it = items.find(x => x.id === b.id);
      return it ? { ...b, order: it.order, categoryId: it.categoryId } : b;
    }));
    try { await reorderBoards(items); }
    catch { message.error('정렬 저장에 실패했습니다.'); load(); }
  };

  // ─── 드래그앤드롭: 카테고리 정렬/중첩 ─────────────────────────────────────────
  // dragged 카테고리를 target 카테고리의 형제로(앞에) 이동 (parentId = target.parentId)
  const moveCatBeside = async (draggedId, target) => {
    if (draggedId === target.id) return;
    if (isDescendantCat(target.id, draggedId)) { message.warning('하위 카테고리로는 이동할 수 없습니다.'); return; }
    const dragged = categories.find(c => c.id === draggedId);
    if (!dragged || !canManageCat(dragged)) { message.warning('이동 권한이 없습니다.'); return; }
    const newParent = target.parentId ?? null;
    const siblings = categories
      .filter(c => (c.parentId ?? null) === newParent && c.id !== draggedId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
    let idx = siblings.findIndex(c => c.id === target.id);
    if (idx < 0) idx = siblings.length;
    siblings.splice(idx, 0, { ...dragged, parentId: newParent });
    const items = siblings.map((c, i) => ({ id: c.id, order: i, parentId: newParent }));
    setCategories(prev => prev.map(c => {
      const it = items.find(x => x.id === c.id);
      return it ? { ...c, order: it.order, parentId: it.parentId } : c;
    }));
    try { await reorderBoardCategories(items); }
    catch { message.error('정렬 저장에 실패했습니다.'); load(); }
  };

  // dragged 카테고리를 target 카테고리의 하위로 중첩
  const nestCatInto = async (draggedId, parentCat) => {
    if (draggedId === parentCat.id || isDescendantCat(parentCat.id, draggedId)) {
      message.warning('하위 카테고리로는 이동할 수 없습니다.'); return;
    }
    const dragged = categories.find(c => c.id === draggedId);
    if (!dragged || !canManageCat(dragged)) { message.warning('이동 권한이 없습니다.'); return; }
    const siblings = categories
      .filter(c => (c.parentId ?? null) === parentCat.id && c.id !== draggedId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
    const items = [...siblings, { ...dragged, parentId: parentCat.id }]
      .map((c, i) => ({ id: c.id, order: i, parentId: parentCat.id }));
    setCategories(prev => prev.map(c => c.id === draggedId ? { ...c, parentId: parentCat.id } : c));
    setCollapsed(prev => { const n = new Set(prev); n.delete(parentCat.id); localStorage.setItem(EXPAND_KEY, JSON.stringify([...n])); return n; });
    try { await reorderBoardCategories(items); }
    catch { message.error('이동 저장에 실패했습니다.'); load(); }
  };

  const handleDrop = (target) => {
    // target: { kind:'board'|'catHeader'|'catBody', board?, cat? }
    if (!dragItem) return;
    if (dragItem.kind === 'board') {
      const dragged = boards.find(b => b.id === dragItem.id);
      if (!dragged) return;
      if (target.kind === 'board') moveBoardTo(dragged, target.board.categoryId ?? null, target.board.id);
      else if (target.kind === 'catBody' || target.kind === 'catHeader') moveBoardTo(dragged, target.cat?.id ?? null, null);
    } else if (dragItem.kind === 'cat') {
      if (target.kind === 'catHeader' && target.cat) moveCatBeside(dragItem.id, target.cat);
      else if (target.kind === 'catBody' && target.cat) nestCatInto(dragItem.id, target.cat);
    }
    setDragItem(null);
    setDropTarget(null);
  };

  // ─── 카테고리 생성/수정/삭제 ──────────────────────────────────────────────────
  const openCreateCat = (parentId = null) => {
    setCatMode('create');
    setCatTarget(null);
    catForm.resetFields();
    catForm.setFieldsValue({ icon: '📁', color: null, scope: 'shared', parentId });
    setCatModalOpen(true);
  };

  const openEditCat = (cat) => {
    setCatMode('rename');
    setCatTarget(cat);
    catForm.setFieldsValue({ name: cat.name, icon: cat.icon || '📁', color: cat.color || null, scope: cat.scope, parentId: cat.parentId ?? null });
    setCatModalOpen(true);
  };

  const handleCatOk = async () => {
    try {
      const values = await catForm.validateFields();
      if (catMode === 'create') {
        const created = await createBoardCategory(values);
        setCategories(prev => [...prev, created]);
        message.success('카테고리가 생성되었습니다.');
      } else if (catTarget) {
        const updated = await updateBoardCategory(catTarget.id, {
          name: values.name, icon: values.icon, color: values.color, parentId: values.parentId ?? null,
        });
        setCategories(prev => prev.map(c => c.id === updated.id ? updated : c));
        message.success('카테고리가 수정되었습니다.');
      }
      setCatModalOpen(false);
    } catch (err) {
      if (err?.errorFields) return; // 폼 검증 실패는 각 필드에 표시되므로 토스트 생략
      message.error(err?.response?.data?.error || err?.message || '저장에 실패했습니다.');
    }
  };

  // 상위 카테고리 후보 (편집 시 자기 자신과 자손 제외)
  const parentCatOptions = useMemo(() => {
    const excluded = new Set();
    if (catMode === 'rename' && catTarget) {
      excluded.add(catTarget.id);
      const collect = (pid) => {
        for (const c of categories) {
          if (c.parentId === pid && !excluded.has(c.id)) { excluded.add(c.id); collect(c.id); }
        }
      };
      collect(catTarget.id);
    }
    return categories
      .filter(c => !excluded.has(c.id))
      .map(c => ({ value: c.id, label: `${c.icon || '📁'} ${c.name}` }));
  }, [categories, catMode, catTarget]);

  const handleDeleteCat = async (cat) => {
    try {
      await deleteBoardCategory(cat.id);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      // 소속 보드는 미분류로 이동(서버 SetNull) → 로컬 반영
      setBoards(prev => prev.map(b => b.categoryId === cat.id ? { ...b, categoryId: null } : b));
      message.success('카테고리가 삭제되었습니다.');
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  // ─── 렌더 헬퍼 ────────────────────────────────────────────────────────────────
  const moveMenuItems = (board) => ([
    {
      key: 'move',
      icon: <FolderOutlined />,
      label: '카테고리 이동',
      children: [
        { key: 'move-none', label: '미분류', onClick: () => handleMoveBoard(board, null) },
        ...categories.map(c => ({
          key: `move-${c.id}`,
          label: `${c.icon || '📁'} ${c.name}`,
          onClick: () => handleMoveBoard(board, c.id),
        })),
      ],
    },
  ]);

  const renderBoardRow = (board, indentPx = 26) => {
    const isSelected = board.id === selectedBoardId;
    const editable = canEditBoard(board);
    const isDrop = dropTarget?.kind === 'board' && dropTarget.id === board.id;
    const rowMenu = [
      ...(editable ? [{ key: 'edit', icon: <EditOutlined />, label: '수정', onClick: () => openEditBoard(board) }] : []),
      ...(editable ? moveMenuItems(board) : []),
      ...(editable ? [{ type: 'divider' }] : []),
      ...(editable ? [{
        key: 'delete', icon: <DeleteOutlined />, label: '삭제', danger: true,
        onClick: () => Modal.confirm({
          title: '보드를 삭제할까요?',
          content: '모든 카드가 함께 삭제됩니다.',
          okText: '삭제', cancelText: '취소', okButtonProps: { danger: true },
          onOk: () => handleDeleteBoard(board),
        }),
      }] : []),
    ];
    return (
      <div
        key={board.id}
        draggable={editable}
        onDragStart={(e) => { if (!editable) return; setDragItem({ kind: 'board', id: board.id }); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => { if (dragItem?.kind === 'board') { e.preventDefault(); e.stopPropagation(); setDropTarget({ kind: 'board', id: board.id }); } }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop({ kind: 'board', board }); }}
        onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
        onClick={() => navigate(`/boards/${board.id}`)}
        className="fd-board-row"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '6px 8px', paddingLeft: indentPx, borderRadius: 6, fontSize: 15,
          background: isSelected ? '#e6f4ff' : 'transparent',
          color: isSelected ? '#1677ff' : '#262626',
          fontWeight: isSelected ? 600 : 400,
          borderTop: isDrop ? '2px solid #1677ff' : '2px solid transparent',
        }}
      >
        <span style={{ flexShrink: 0 }}>{board.icon || '📋'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.title}</span>
        <UnreadBadge count={boardUnreadMap[board.id]} />
        <span className="fd-board-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 2 }} onClick={e => e.stopPropagation()}>
          <Tooltip title={board.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}>
            <span onClick={() => handleFavorite(board)} style={{ cursor: 'pointer', display: 'flex' }}>
              {board.isFavorite
                ? <StarFilled style={{ fontSize: 15, color: '#faad14' }} />
                : <StarOutlined style={{ fontSize: 15, color: '#bfbfbf' }} />}
            </span>
          </Tooltip>
          {rowMenu.length > 0 && (
            <Dropdown menu={{ items: rowMenu }} trigger={['click']}>
              <MoreOutlined style={{ fontSize: 16, color: '#bfbfbf' }} />
            </Dropdown>
          )}
        </span>
      </div>
    );
  };

  const renderCategoryNode = (cat, depth = 0, isPseudo = false) => {
    if (search.trim() && !isPseudo && !catHasContent(cat.id)) return null;
    const isCollapsed = collapsed.has(cat.id);
    const manageable = !isPseudo && canManageCat(cat);
    const catBoards = tree.boardsByCat.get(cat.id) ?? [];
    const childCats = isPseudo ? [] : (tree.childrenMap.get(cat.id) ?? []);
    const headerIndent = 8 + depth * 14;
    const isDropHeader = dropTarget?.kind === 'catHeader' && dropTarget.id === cat.id;
    const isDropBody = dropTarget?.kind === 'catBody' && dropTarget.id === cat.id;
    const catMenu = [
      ...(manageable ? [{ key: 'edit', icon: <EditOutlined />, label: '카테고리 수정', onClick: () => openEditCat(cat) }] : []),
      { key: 'add-board', icon: <PlusOutlined />, label: '보드 추가', onClick: () => openCreateBoard(isPseudo ? null : cat.id) },
      ...(manageable ? [{ type: 'divider' }, {
        key: 'delete', icon: <DeleteOutlined />, label: '카테고리 삭제', danger: true,
        onClick: () => Modal.confirm({
          title: '카테고리를 삭제할까요?',
          content: '소속 보드는 미분류로 이동되며, 하위 카테고리는 함께 삭제됩니다.',
          okText: '삭제', cancelText: '취소', okButtonProps: { danger: true },
          onOk: () => handleDeleteCat(cat),
        }),
      }] : []),
    ];
    return (
      <div key={cat.id} style={{ marginBottom: 2 }}>
        <div
          className="fd-cat-header"
          draggable={manageable}
          onDragStart={(e) => { if (!manageable) return; setDragItem({ kind: 'cat', id: cat.id }); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => {
            if (!dragItem) return;
            if (isPseudo && dragItem.kind === 'cat') return; // 미분류엔 카테고리 못 놓음
            e.preventDefault(); e.stopPropagation();
            setDropTarget({ kind: 'catHeader', id: cat.id });
          }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (dragItem?.kind === 'board') handleDrop({ kind: 'catBody', cat: isPseudo ? null : cat });
            else if (!isPseudo) handleDrop({ kind: 'catHeader', cat });
          }}
          onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
          onClick={() => toggleCollapse(cat.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            padding: '6px 8px', paddingLeft: headerIndent, borderRadius: 6, userSelect: 'none',
            background: isDropHeader && dragItem?.kind === 'board' ? '#f0f7ff' : 'transparent',
            borderTop: isDropHeader && dragItem?.kind === 'cat' ? '2px solid #1677ff' : '2px solid transparent',
          }}
        >
          {isCollapsed ? <RightOutlined style={{ fontSize: 12, color: '#8c8c8c' }} /> : <DownOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />}
          <span style={{ fontSize: 16 }}>{cat.icon || '📁'}</span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: cat.color || '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cat.name}
          </span>
          {cat.scope === 'personal' && (
            <Tooltip title="개인 카테고리"><LockOutlined style={{ fontSize: 13, color: '#bfbfbf' }} /></Tooltip>
          )}
          {isCollapsed && <UnreadBadge count={catUnreadCount(cat.id)} />}
          <span style={{ fontSize: 13, color: '#bfbfbf' }}>{catBoards.length}</span>
          <span className="fd-cat-actions" onClick={e => e.stopPropagation()}>
            <Dropdown menu={{ items: catMenu }} trigger={['click']}>
              <MoreOutlined style={{ fontSize: 16, color: '#bfbfbf' }} />
            </Dropdown>
          </span>
        </div>
        {!isCollapsed && (
          <div
            onDragOver={(e) => {
              if (!dragItem) return;
              if (dragItem.kind === 'cat' && isPseudo) return;
              e.preventDefault();
              setDropTarget({ kind: 'catBody', id: cat.id });
            }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation();
              if (dragItem?.kind === 'board') handleDrop({ kind: 'catBody', cat: isPseudo ? null : cat });
              else if (!isPseudo && dragItem?.kind === 'cat') handleDrop({ kind: 'catBody', cat });
            }}
            style={{ background: isDropBody ? '#f6ffed' : 'transparent', borderRadius: 6, minHeight: 2 }}
          >
            {childCats.map(cc => renderCategoryNode(cc, depth + 1))}
            {catBoards.length === 0 && childCats.length === 0
              ? <div style={{ padding: `4px 8px 4px ${headerIndent + 18}px`, fontSize: 14, color: '#bfbfbf' }}>보드 없음</div>
              : catBoards.map(b => renderBoardRow(b, headerIndent + 18))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8' }}>
      {/* ─── 좌측 트리 사이드바 ─── */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700 }}>
              <AppstoreOutlined /> 보드
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              <Tooltip title="카테고리 추가">
                <Button type="text" size="small" icon={<FolderAddOutlined style={{ fontSize: 20 }} />} onClick={() => openCreateCat()} />
              </Tooltip>
              <Tooltip title="새 보드">
                <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 20 }} />} onClick={() => openCreateBoard(null)} />
              </Tooltip>
            </div>
          </div>
          <Input
            size="small"
            placeholder="보드 검색..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {loading ? (
            <Spin style={{ display: 'block', margin: '40px auto' }} />
          ) : (
            <>
              {(tree.childrenMap.get(null) ?? []).map(cat => renderCategoryNode(cat, 0))}

              {/* 미분류 */}
              {(tree.uncategorized.length > 0 || categories.length === 0) && (
                renderCategoryNode(
                  { id: UNCATEGORIZED, name: '미분류', icon: '🗂️', scope: 'shared', createdBy: -1, color: null, parentId: null },
                  0, true,
                )
              )}

              {boards.length === 0 && categories.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 13 }}>
                  <AppstoreOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
                  보드가 없습니다.<br />새 보드를 만들어 보세요.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── 우측 보드 내용 ─── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        {selectedBoardId ? (
          <BoardContent key={selectedBoardId} boardId={selectedBoardId} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span style={{ color: '#8c8c8c' }}>
                  왼쪽에서 보드를 선택하거나<br />새 보드를 만들어 보세요.
                </span>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateBoard(null)}>새 보드</Button>
            </Empty>
          </div>
        )}
      </div>

      {/* ─── 카테고리 생성/수정 모달 ─── */}
      <Modal
        title={catMode === 'create' ? '카테고리 생성' : '카테고리 수정'}
        open={catModalOpen}
        onOk={handleCatOk}
        onCancel={() => setCatModalOpen(false)}
        okText="저장" cancelText="취소"
        width={440}
      >
        <Form form={catForm} layout="vertical">
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="아이콘" style={{ flex: '0 0 auto' }}>
              <Form.Item name="icon" noStyle>
                <Select style={{ width: 80 }}>
                  {CATEGORY_ICONS.map(ic => <Select.Option key={ic} value={ic}>{ic}</Select.Option>)}
                </Select>
              </Form.Item>
            </Form.Item>
            <Form.Item name="name" label="카테고리 이름" rules={[{ required: true, message: '이름을 입력하세요.' }]} style={{ flex: 1 }}>
              <Input placeholder="예: 팀별 보드" />
            </Form.Item>
          </div>
          <Form.Item name="color" label="색상">
            <Radio.Group>
              {CAT_COLORS.map(c => (
                <Radio.Button key={String(c.value)} value={c.value}>
                  {c.value
                    ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: c.value, verticalAlign: 'middle' }} />
                    : <span style={{ fontSize: 11 }}>기본</span>}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item name="parentId" label="상위 카테고리" tooltip="선택하면 해당 카테고리의 하위 폴더로 들어갑니다.">
            <Select allowClear placeholder="없음 (최상위)" options={parentCatOptions} />
          </Form.Item>
          {catMode === 'create' && (
            <Form.Item name="scope" label="공개 범위" tooltip="공용은 전체 팀에 보이고, 개인은 나에게만 보입니다.">
              <Radio.Group>
                <Radio.Button value="shared"><TeamOutlined /> 공용</Radio.Button>
                <Radio.Button value="personal"><LockOutlined /> 개인</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* ─── 새 보드 생성 모달 ─── */}
      <Modal
        title={step === 0 ? '템플릿 선택' : '보드 정보 입력'}
        open={boardModalOpen}
        onCancel={() => setBoardModalOpen(false)}
        footer={
          step === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => setBoardModalOpen(false)}>취소</Button>
              <Button type="primary" onClick={handleCreateNext}>다음</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setStep(0)}>이전</Button>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setBoardModalOpen(false)}>취소</Button>
                <Button type="primary" onClick={handleCreateBoard} loading={creating}>생성</Button>
              </div>
            </div>
          )
        }
        width={620}
      >
        <Steps current={step} size="small" style={{ marginBottom: 20 }} items={[{ title: '템플릿 선택' }, { title: '보드 정보' }]} />

        {step === 0 && (
          <Row gutter={[12, 12]}>
            {TEMPLATES.map(tpl => (
              <Col key={tpl.id} xs={24} sm={12}>
                <div
                  onClick={() => setSelectedTemplate(tpl.id)}
                  style={{
                    padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
                    border: selectedTemplate === tpl.id ? '2px solid #1677ff' : '2px solid #e8e8e8',
                    background: selectedTemplate === tpl.id ? '#e6f4ff' : '#fff',
                    position: 'relative', transition: 'all 0.15s',
                  }}
                >
                  {selectedTemplate === tpl.id && (
                    <CheckOutlined style={{ position: 'absolute', top: 10, right: 10, color: '#1677ff', fontWeight: 700 }} />
                  )}
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{tpl.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{tpl.name}</div>
                  <div style={{ fontSize: 11, color: '#8c8c8c' }}>{tpl.description}</div>
                </div>
              </Col>
            ))}
          </Row>
        )}

        {step === 1 && (
          <Form form={form} layout="vertical">
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item label="아이콘" style={{ flex: '0 0 auto' }}>
                <Form.Item name="icon" noStyle>
                  <Select style={{ width: 80 }}>
                    {ICONS.map(ic => <Select.Option key={ic} value={ic}>{ic}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Form.Item>
              <Form.Item label="배경 색상" style={{ flex: 1 }}>
                <Form.Item name="bgColor" noStyle>
                  <Radio.Group>
                    {BG_COLORS.map(bg => (
                      <Radio.Button key={String(bg.value)} value={bg.value} style={{ marginBottom: 4 }}>
                        {bg.value
                          ? <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: bg.value, verticalAlign: 'middle' }} />
                          : <span style={{ fontSize: 11 }}>없음</span>}
                      </Radio.Button>
                    ))}
                  </Radio.Group>
                </Form.Item>
              </Form.Item>
            </div>
            <Form.Item name="title" label="보드 이름" rules={[{ required: true, message: '보드 이름을 입력하세요.' }]}>
              <Input placeholder="보드 이름" />
            </Form.Item>
            <Form.Item name="categoryId" label="카테고리">
              <Select allowClear placeholder="미분류" options={categories.map(c => ({ value: c.id, label: `${c.icon || '📁'} ${c.name}` }))} />
            </Form.Item>
            <Form.Item name="description" label="설명">
              <Input.TextArea rows={2} placeholder="보드 설명 (선택)" />
            </Form.Item>
            <Form.Item name="memberIds" label="멤버">
              <Select
                mode="multiple" placeholder="이름·부서로 검색" showSearch
                filterOption={filterUserOption}
                options={buildUserOptions(users, getMyDepartment())}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* ─── 보드 수정 모달 ─── */}
      <Modal
        title="보드 수정"
        open={editModalOpen}
        onOk={handleEditBoard}
        onCancel={() => setEditModalOpen(false)}
        okText="수정" cancelText="취소"
      >
        <Form form={editForm} layout="vertical">
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="아이콘" style={{ flex: '0 0 auto' }}>
              <Form.Item name="icon" noStyle>
                <Select style={{ width: 80 }}>
                  {ICONS.map(ic => <Select.Option key={ic} value={ic}>{ic}</Select.Option>)}
                </Select>
              </Form.Item>
            </Form.Item>
            <Form.Item label="배경 색상" style={{ flex: 1 }}>
              <Form.Item name="bgColor" noStyle>
                <Radio.Group>
                  {BG_COLORS.map(bg => (
                    <Radio.Button key={String(bg.value)} value={bg.value} style={{ marginBottom: 4 }}>
                      {bg.value
                        ? <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: bg.value, verticalAlign: 'middle' }} />
                        : <span style={{ fontSize: 11 }}>없음</span>}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
            </Form.Item>
          </div>
          <Form.Item name="title" label="보드 이름" rules={[{ required: true, message: '보드 이름을 입력하세요.' }]}>
            <Input placeholder="보드 이름" />
          </Form.Item>
          <Form.Item name="categoryId" label="카테고리">
            <Select allowClear placeholder="미분류" options={categories.map(c => ({ value: c.id, label: `${c.icon || '📁'} ${c.name}` }))} />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="보드 설명 (선택)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
