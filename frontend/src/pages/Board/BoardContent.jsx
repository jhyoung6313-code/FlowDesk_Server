import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Select, Space, Spin, Typography, message, Tooltip, Breadcrumb,
  Dropdown, Modal, Upload, Tag, Divider, Input, Switch, Form, InputNumber,
  List, Popconfirm, Badge,
} from 'antd';
import {
  AppstoreOutlined, TableOutlined, CalendarOutlined, PictureOutlined,
  SettingOutlined, TeamOutlined, FilterOutlined, SortAscendingOutlined,
  MessageOutlined, ExportOutlined, ImportOutlined, MoreOutlined,
  CloseOutlined, PlusOutlined, LinkOutlined, SearchOutlined,
  PartitionOutlined, ThunderboltOutlined, AlignLeftOutlined,
  DeleteOutlined, EditOutlined, PlayCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useAuthStore from '../../store/authStore';
import {
  getBoard, getCards, deleteCard, updateCardProperties, updateBoard,
  exportBoard, importBoard, createCard,
  getAutomations, createAutomation, updateAutomation, deleteAutomation,
  markBoardRead, getBoardUnreadCount,
  getBoardViews, createBoardView, updateBoardView, deleteBoardView,
} from '../../api/boards';
import { getUsers } from '../../api/users';
import { getRooms } from '../../api/chat';
import useUnreadStore from '../../store/unreadStore';
import KanbanView from './views/KanbanView';
import TableView from './views/TableView';
import GalleryView from './views/GalleryView';
import CalendarView from './views/CalendarView';
import TimelineView from './views/TimelineView';
import CardModal from './components/CardModal';
import PropertyEditor, { BUILTIN_COLS } from './components/PropertyEditor';
import MemberManager from './components/MemberManager';

const { Title, Text } = Typography;

const VIEW_OPTIONS = [
  { value: 'kanban',    label: '칸반',     icon: <AppstoreOutlined /> },
  { value: 'table',     label: '테이블',   icon: <TableOutlined /> },
  { value: 'gallery',   label: '갤러리',   icon: <PictureOutlined /> },
  { value: 'calendar',  label: '캘린더',   icon: <CalendarOutlined /> },
  { value: 'timeline',  label: '타임라인', icon: <AlignLeftOutlined /> },
];

const STATUS_OPTIONS = [
  { value: 'todo', label: '예정' },
  { value: 'in_progress', label: '진행중' },
  { value: 'review', label: '검토중' },
  { value: 'done', label: '완료' },
  { value: 'hold', label: '보류' },
  { value: 'cancelled', label: '취소' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: '높음' },
  { value: 'normal', label: '보통' },
  { value: 'low', label: '낮음' },
];

const SORT_FIELDS = [
  { value: 'order',     label: '기본 순서' },
  { value: 'title',     label: '제목' },
  { value: 'status',    label: '상태' },
  { value: 'priority',  label: '우선순위' },
  { value: 'dueDate',   label: '마감일' },
  { value: 'progress',  label: '진행도' },
  { value: 'createdAt', label: '생성일' },
];

const TRIGGER_OPTIONS = [
  { value: 'card_created',        label: '카드 생성 시' },
  { value: 'card_status_changed', label: '상태 변경 시' },
  { value: 'card_assigned',       label: '담당자 지정 시' },
];

const ACTION_OPTIONS = [
  { value: 'set_status',    label: '상태 변경' },
  { value: 'set_priority',  label: '우선순위 변경' },
  { value: 'notify',        label: '알림 전송' },
];

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const STATUS_ORDER   = { todo: 0, in_progress: 1, review: 2, done: 3, hold: 4, cancelled: 5 };

export default function BoardContent({ boardId: propBoardId }) {
  const { id } = useParams();
  const boardId = propBoardId ?? Number(id);
  const embedded = propBoardId != null;
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');

  // 저장 뷰
  const [views, setViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewModalMode, setViewModalMode] = useState('create'); // create | rename
  const [viewModalTarget, setViewModalTarget] = useState(null);
  const [viewNameInput, setViewNameInput] = useState('');

  // 칸반 그룹 기준 (저장 뷰 활성 시 뷰 config, 아니면 보드 기본값)
  const [groupPropId, setGroupPropId] = useState(null);

  // 카드 모달
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [initialGroupValue, setInitialGroupValue] = useState(null);

  // 속성/멤버/채팅연결 모달
  const [propEditorOpen, setPropEditorOpen] = useState(false);
  const [memberManagerOpen, setMemberManagerOpen] = useState(false);
  const [chatLinkOpen, setChatLinkOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  // F-B05 필터
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState([]);
  const [pendingFilter, setPendingFilter] = useState({ field: 'status', op: 'eq', value: '' });

  // F-B05 정렬
  const [sortField, setSortField] = useState('order');
  const [sortDir, setSortDir] = useState('asc');

  // F-B08 가져오기
  const [importLoading, setImportLoading] = useState(false);

  // 검색
  const [searchQuery, setSearchQuery] = useState('');

  // WIP 제한 설정
  const [wipConfigOpen, setWipConfigOpen] = useState(false);
  const [wipLimits, setWipLimits] = useState({});

  // 스위밍레인 설정
  const [swimlaneConfigPropId, setSwimlanePropId] = useState(null);

  // 기본 항목 컬럼 선택 (그리드용)
  const [builtinCols, setBuiltinCols] = useState(() => {
    try {
      const saved = localStorage.getItem(`board_${Number(id)}_builtin_cols`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(['status', 'priority', 'assignees', 'dueDate']);
  });

  const handleBuiltinColsChange = (cols) => {
    localStorage.setItem(`board_${boardId}_builtin_cols`, JSON.stringify([...cols]));
    setBuiltinCols(new Set(cols));
  };

  // 자동화 모달
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [automations, setAutomations] = useState([]);
  const [autoForm] = Form.useForm();
  const [editingAuto, setEditingAuto] = useState(null);
  const [autoFormOpen, setAutoFormOpen] = useState(false);

  const myRole = useCallback(() => {
    if (!board || !user) return null;
    if (user.role === 'admin') return 'owner';
    return board.members?.find(m => m.userId === user.id)?.role ?? null;
  }, [board, user]);

  const isOwnerOrAdmin = useCallback(() => {
    const role = myRole();
    return role === 'owner';
  }, [myRole]);

  const canEdit = useCallback(() => {
    const role = myRole();
    return role === 'owner' || role === 'member';
  }, [myRole]);

  const canComment = useCallback(() => {
    const role = myRole();
    return ['owner', 'member', 'commenter'].includes(role);
  }, [myRole]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, c, u, r, vs] = await Promise.all([
        getBoard(boardId), getCards(boardId), getUsers(), getRooms(), getBoardViews(boardId),
      ]);
      setBoard(b);
      setCards(c);
      setAllUsers(u);
      setRooms(r);
      setViews(vs);
      setSelectedRoomId(b.linkedRoomId ?? null);
      // 저장 뷰가 있으면 기본 뷰(또는 첫 뷰)를 적용, 없으면 보드 기본값 사용
      const initialView = vs.find(v => v.isDefault) || vs[0];
      if (initialView) {
        applyViewConfig(initialView, b);
      } else {
        setView(b.defaultView || 'kanban');
        setGroupPropId(b.kanbanGroupByPropId ?? null);
        setSwimlanePropId(b.swimlaneGroupByPropId ?? null);
        if (b.wipLimitsJson) {
          try { setWipLimits(JSON.parse(b.wipLimitsJson)); } catch { setWipLimits({}); }
        } else {
          setWipLimits({});
        }
      }
    } catch (err) {
      if (err?.response?.status === 403) {
        message.error('접근 권한이 없습니다.');
        navigate('/boards');
      }
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  // 보드 열람: 안읽음 읽음 처리 + 사이드바 카운트 동기화. 이탈 시에도 한 번 더 markRead.
  useEffect(() => {
    if (!boardId) return;
    const { setBoardViewing, setBoardUnreadMap, clearBoardUnread } = useUnreadStore.getState();
    setBoardViewing(boardId);
    const sync = () => {
      clearBoardUnread(boardId); // 배지 즉시 제거(낙관적), 이후 서버 집계로 보정
      return markBoardRead(boardId)
        .then(() => getBoardUnreadCount())
        .then((d) => setBoardUnreadMap(d.boards))
        .catch(() => {});
    };
    sync();
    return () => {
      setBoardViewing(null);
      sync();
    };
  }, [boardId]);

  // 자동화 목록 로드
  useEffect(() => {
    if (!boardId) return;
    getAutomations(boardId).then(setAutomations).catch(() => {});
  }, [boardId]);

  const handleViewChange = async (newView) => {
    setView(newView);
    // 활성 저장 뷰가 있으면 그 뷰의 타입을 갱신, 없으면 보드 기본 뷰 타입을 저장(레거시)
    if (activeViewId) {
      try {
        const updated = await updateBoardView(boardId, activeViewId, { type: newView, config: captureViewConfig({ type: newView }) });
        setViews(prev => prev.map(v => v.id === updated.id ? updated : v));
      } catch {}
    } else {
      try {
        await updateBoard(boardId, { ...board, defaultView: newView });
        setBoard(prev => ({ ...prev, defaultView: newView }));
      } catch {}
    }
  };

  // ─── 저장 뷰 ──────────────────────────────────────────────────────────────────
  // 현재 화면 상태(필터/정렬/검색/컬럼/그룹·레인·WIP)를 뷰 config 객체로 캡처
  const captureViewConfig = (override = {}) => ({
    filters,
    sortField,
    sortDir,
    search: searchQuery,
    builtinCols: [...builtinCols],
    groupPropId,
    swimlaneByPropId: swimlaneConfigPropId,
    wipLimits,
    ...override,
  });

  // 저장 뷰를 현재 화면에 적용 (fallbackBoard: 최초 로드 시 board state가 아직 없을 때 대비)
  const applyViewConfig = (v, fallbackBoard = null) => {
    setActiveViewId(v.id);
    const cfg = v.config || {};
    const fb = fallbackBoard || board || {};
    setView(v.type || 'kanban');
    setFilters(Array.isArray(cfg.filters) ? cfg.filters : []);
    setSortField(cfg.sortField || 'order');
    setSortDir(cfg.sortDir || 'asc');
    setSearchQuery(cfg.search || '');
    if (Array.isArray(cfg.builtinCols)) setBuiltinCols(new Set(cfg.builtinCols));
    setGroupPropId(cfg.groupPropId ?? fb.kanbanGroupByPropId ?? null);
    setSwimlanePropId(cfg.swimlaneByPropId ?? fb.swimlaneGroupByPropId ?? null);
    setWipLimits(cfg.wipLimits || {});
  };

  // 그룹/레인/WIP 등 뷰 설정 변경을 활성 뷰 config에 즉시 저장
  const persistViewSettings = async (override = {}) => {
    if (!activeViewId) return;
    try {
      const updated = await updateBoardView(boardId, activeViewId, { config: captureViewConfig(override) });
      setViews(prev => prev.map(v => v.id === updated.id ? updated : v));
    } catch {}
  };

  const openCreateViewModal = () => {
    setViewModalMode('create');
    setViewModalTarget(null);
    setViewNameInput('');
    setViewModalOpen(true);
  };

  const openRenameViewModal = (v) => {
    setViewModalMode('rename');
    setViewModalTarget(v);
    setViewNameInput(v.name);
    setViewModalOpen(true);
  };

  const handleViewModalOk = async () => {
    const name = viewNameInput.trim();
    if (!name) return;
    try {
      if (viewModalMode === 'create') {
        const created = await createBoardView(boardId, { name, type: view, config: captureViewConfig() });
        setViews(prev => [...prev, created]);
        setActiveViewId(created.id);
        message.success('뷰가 저장되었습니다.');
      } else if (viewModalTarget) {
        const updated = await updateBoardView(boardId, viewModalTarget.id, { name });
        setViews(prev => prev.map(v => v.id === updated.id ? updated : v));
      }
      setViewModalOpen(false);
    } catch { message.error('저장에 실패했습니다.'); }
  };

  // 활성 뷰에 현재 화면 상태를 덮어쓰기
  const handleUpdateActiveView = async (v) => {
    try {
      const updated = await updateBoardView(boardId, v.id, { type: view, config: captureViewConfig() });
      setViews(prev => prev.map(x => x.id === updated.id ? updated : x));
      message.success(`'${updated.name}' 뷰가 현재 상태로 갱신되었습니다.`);
    } catch { message.error('저장에 실패했습니다.'); }
  };

  const handleDeleteView = async (v) => {
    try {
      await deleteBoardView(boardId, v.id);
      const rest = views.filter(x => x.id !== v.id);
      setViews(rest);
      if (activeViewId === v.id) {
        if (rest.length > 0) applyViewConfig(rest[0]);
        else setActiveViewId(null);
      }
      message.success('뷰가 삭제되었습니다.');
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  // ─── F-B05 필터링 ─────────────────────────────────────────────────────────────
  const filteredCards = useMemo(() => {
    if (filters.length === 0) return cards;
    return cards.filter(card => {
      return filters.every(f => {
        let cardVal;
        if (f.field === 'status') cardVal = card.status;
        else if (f.field === 'priority') cardVal = card.priority;
        else if (f.field === 'assignee') {
          const ids = (card.assignees ?? []).filter(a => a.type === 'assignee').map(a => a.userId ?? a.user?.id);
          return ids.includes(Number(f.value));
        } else if (f.field === 'dueDate') {
          if (!card.dueDate) return false;
          const d = dayjs(card.dueDate);
          if (f.op === 'before') return d.isBefore(dayjs(f.value), 'day');
          if (f.op === 'after')  return d.isAfter(dayjs(f.value), 'day');
          return d.format('YYYY-MM-DD') === f.value;
        } else {
          const prop = board?.properties?.find(p => String(p.id) === f.field);
          if (!prop) return true;
          const pv = card.properties?.find(pv => pv.propertyId === prop.id);
          cardVal = pv?.value ?? '';
        }
        if (f.op === 'eq')       return cardVal === f.value;
        if (f.op === 'contains') return String(cardVal).includes(f.value);
        return true;
      });
    });
  }, [cards, filters, board]);

  // ─── 검색 필터 ────────────────────────────────────────────────────────────────
  const searchedCards = useMemo(() => {
    if (!searchQuery.trim()) return filteredCards;
    const q = searchQuery.toLowerCase();
    return filteredCards.filter(c =>
      c.title?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      (c.cardNumber && String(c.cardNumber).includes(q))
    );
  }, [filteredCards, searchQuery]);

  // ─── F-B05 정렬 ───────────────────────────────────────────────────────────────
  const sortedCards = useMemo(() => {
    if (sortField === 'order') return searchedCards;
    return [...searchedCards].sort((a, b) => {
      let av, bv;
      if (sortField === 'title')    { av = a.title ?? ''; bv = b.title ?? ''; }
      else if (sortField === 'status')   { av = STATUS_ORDER[a.status] ?? 99; bv = STATUS_ORDER[b.status] ?? 99; }
      else if (sortField === 'priority') { av = PRIORITY_ORDER[a.priority] ?? 99; bv = PRIORITY_ORDER[b.priority] ?? 99; }
      else if (sortField === 'dueDate')  { av = a.dueDate ? dayjs(a.dueDate).valueOf() : 9e15; bv = b.dueDate ? dayjs(b.dueDate).valueOf() : 9e15; }
      else if (sortField === 'progress') { av = a.progress ?? 0; bv = b.progress ?? 0; }
      else if (sortField === 'createdAt') { av = dayjs(a.createdAt).valueOf(); bv = dayjs(b.createdAt).valueOf(); }
      else return 0;

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [searchedCards, sortField, sortDir]);

  // ─── 카드 조작 ────────────────────────────────────────────────────────────────
  const openAddCard = (groupValue = null) => {
    setEditingCard(null);
    setInitialGroupValue(groupValue);
    setCardModalOpen(true);
  };

  const openEditCard = (card) => {
    setEditingCard(card);
    setInitialGroupValue(null);
    setCardModalOpen(true);
  };

  const handleCardSaved = (saved) => {
    setCards(prev => {
      const exists = prev.find(c => c.id === saved.id);
      if (exists) return prev.map(c => c.id === saved.id ? saved : c);
      return [...prev, saved];
    });
  };

  const handleDeleteCard = async (cardId) => {
    try {
      await deleteCard(boardId, cardId);
      setCards(prev => prev.filter(c => c.id !== cardId));
      message.success('카드가 삭제되었습니다.');
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  const handleCardDrop = async (cardId, propId, value) => {
    try {
      const updated = await updateCardProperties(boardId, cardId, { [propId]: value });
      setCards(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch { message.error('이동에 실패했습니다.'); }
  };

  const handleKanbanGroupChange = async (propId) => {
    setGroupPropId(propId ?? null);
    if (activeViewId) {
      persistViewSettings({ groupPropId: propId ?? null });
    } else {
      try {
        const updated = await updateBoard(boardId, { kanbanGroupByPropId: propId ?? null });
        setBoard(prev => ({ ...prev, kanbanGroupByPropId: updated.kanbanGroupByPropId }));
      } catch { message.error('저장에 실패했습니다.'); }
    }
  };

  // ─── 인라인 빠른 카드 추가 ───────────────────────────────────────────────────
  const handleQuickAdd = async (groupValue, title) => {
    try {
      const propValues = {};
      if (groupValue && groupPropId) {
        propValues[groupPropId] = groupValue;
      }
      const saved = await createCard(boardId, { title, properties: propValues });
      setCards(prev => [...prev, saved]);
    } catch { message.error('카드 추가에 실패했습니다.'); }
  };

  // ─── 스위밍레인 설정 ─────────────────────────────────────────────────────────
  const handleSwimlaneSave = async (propId) => {
    setSwimlanePropId(propId ?? null);
    if (activeViewId) {
      persistViewSettings({ swimlaneByPropId: propId ?? null });
    } else {
      try {
        const updated = await updateBoard(boardId, { swimlaneGroupByPropId: propId ?? null });
        setBoard(prev => ({ ...prev, swimlaneGroupByPropId: updated.swimlaneGroupByPropId }));
      } catch { message.error('저장에 실패했습니다.'); }
    }
  };

  // ─── WIP 제한 저장 ───────────────────────────────────────────────────────────
  const handleWipSave = async () => {
    if (activeViewId) {
      await persistViewSettings({ wipLimits });
      message.success('WIP 제한이 저장되었습니다.');
      setWipConfigOpen(false);
    } else {
      try {
        const json = JSON.stringify(wipLimits);
        const updated = await updateBoard(boardId, { wipLimitsJson: json });
        setBoard(prev => ({ ...prev, wipLimitsJson: updated.wipLimitsJson }));
        message.success('WIP 제한이 저장되었습니다.');
        setWipConfigOpen(false);
      } catch { message.error('저장에 실패했습니다.'); }
    }
  };

  // ─── F-B06 채팅방 연결 ────────────────────────────────────────────────────────
  const handleChatLink = async () => {
    try {
      await updateBoard(boardId, { linkedRoomId: selectedRoomId ?? null });
      setBoard(prev => ({ ...prev, linkedRoomId: selectedRoomId ?? null }));
      message.success(selectedRoomId ? '채팅방이 연결되었습니다.' : '채팅방 연결이 해제되었습니다.');
      setChatLinkOpen(false);
    } catch { message.error('저장에 실패했습니다.'); }
  };

  // ─── F-B08 내보내기 ──────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const data = await exportBoard(boardId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${board.title}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('보드가 내보내기 되었습니다.');
    } catch { message.error('내보내기에 실패했습니다.'); }
  };

  // ─── F-B08 가져오기 ──────────────────────────────────────────────────────────
  const handleImport = async (file) => {
    setImportLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const created = await importBoard(data);
      message.success(`"${created.title}" 보드가 가져오기 되었습니다.`);
      navigate(`/boards/${created.id}`);
    } catch { message.error('가져오기에 실패했습니다. 올바른 JSON 파일인지 확인하세요.'); }
    setImportLoading(false);
    return false;
  };

  // ─── 자동화 CRUD ─────────────────────────────────────────────────────────────
  const handleAutoSave = async (values) => {
    try {
      const payload = {
        name: values.name,
        trigger: values.trigger,
        triggerConfig: values.triggerValue ? { value: values.triggerValue } : {},
        action: values.action,
        actionConfig: values.actionValue ? { value: values.actionValue } : {},
        isActive: true,
      };
      if (editingAuto) {
        const updated = await updateAutomation(boardId, editingAuto.id, payload);
        setAutomations(prev => prev.map(a => a.id === updated.id ? updated : a));
        message.success('자동화가 수정되었습니다.');
      } else {
        const created = await createAutomation(boardId, payload);
        setAutomations(prev => [...prev, created]);
        message.success('자동화가 생성되었습니다.');
      }
      setAutoFormOpen(false);
      setEditingAuto(null);
      autoForm.resetFields();
    } catch { message.error('저장에 실패했습니다.'); }
  };

  const handleAutoToggle = async (auto) => {
    try {
      const updated = await updateAutomation(boardId, auto.id, { isActive: !auto.isActive });
      setAutomations(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch { message.error('저장에 실패했습니다.'); }
  };

  const handleAutoDelete = async (autoId) => {
    try {
      await deleteAutomation(boardId, autoId);
      setAutomations(prev => prev.filter(a => a.id !== autoId));
      message.success('자동화가 삭제되었습니다.');
    } catch { message.error('삭제에 실패했습니다.'); }
  };

  // ─── 필터 UI 헬퍼 ─────────────────────────────────────────────────────────────
  const addFilter = () => {
    if (!pendingFilter.value && pendingFilter.field !== 'assignee') return;
    setFilters(prev => [...prev, { ...pendingFilter, id: Date.now() }]);
    setPendingFilter({ field: 'status', op: 'eq', value: '' });
  };

  const removeFilter = (id) => setFilters(prev => prev.filter(f => f.id !== id));

  const getFilterLabel = (f) => {
    const fieldLabel = (() => {
      if (f.field === 'status') return '상태';
      if (f.field === 'priority') return '우선순위';
      if (f.field === 'assignee') return '담당자';
      if (f.field === 'dueDate') return '마감일';
      const prop = board?.properties?.find(p => String(p.id) === f.field);
      return prop?.name ?? f.field;
    })();
    const opLabel = f.op === 'eq' ? '=' : f.op === 'contains' ? '포함' : f.op === 'before' ? '<' : '>';
    const valLabel = (() => {
      if (f.field === 'status') return STATUS_OPTIONS.find(s => s.value === f.value)?.label ?? f.value;
      if (f.field === 'priority') return PRIORITY_OPTIONS.find(p => p.value === f.value)?.label ?? f.value;
      if (f.field === 'assignee') return allUsers.find(u => u.id === Number(f.value))?.displayName ?? f.value;
      return f.value;
    })();
    return `${fieldLabel} ${opLabel} ${valLabel}`;
  };

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (!board) return null;

  const selectProps = (board.properties ?? []).filter(p => p.type === 'select');
  const linkedRoom = rooms.find(r => r.id === board.linkedRoomId);

  // 그룹기준·스위밍레인·WIP를 (저장 뷰가 있으면 뷰 기준으로) 오버라이드한 보드 객체
  const effectiveBoard = {
    ...board,
    kanbanGroupByPropId: groupPropId,
    swimlaneGroupByPropId: swimlaneConfigPropId,
    wipLimitsJson: JSON.stringify(wipLimits || {}),
  };

  // 더보기 메뉴
  const moreMenuItems = [
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '보드 내보내기 (JSON)',
      onClick: handleExport,
    },
    {
      key: 'import',
      label: (
        <Upload showUploadList={false} accept=".json" beforeUpload={handleImport}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ImportOutlined /> 보드 가져오기 (JSON)
          </span>
        </Upload>
      ),
    },
    { type: 'divider' },
    {
      key: 'chatlink',
      icon: <MessageOutlined />,
      label: `채팅방 연결${linkedRoom ? ` (${linkedRoom.name ?? '1:1'})` : ''}`,
      onClick: () => setChatLinkOpen(true),
    },
  ];

  const initialPropValues = (() => {
    if (initialGroupValue === null || !groupPropId) return {};
    return { [groupPropId]: initialGroupValue };
  })();

  // 보드 배경색 style — 보드 영역 전체 배경에 적용 (헤더에만 minHeight:100%를 주면
  // 헤더가 화면 전체를 덮어 뷰가 밀려나므로 컨테이너 배경으로 처리한다)
  const boardBgStyle = board.bgColor ? { background: board.bgColor } : {};

  const statusColumns = [
    { value: 'todo', label: '예정' },
    { value: 'in_progress', label: '진행중' },
    { value: 'review', label: '검토중' },
    { value: 'done', label: '완료' },
    { value: 'hold', label: '보류' },
    { value: 'cancelled', label: '취소' },
  ];

  return (
    <div style={{ padding: embedded ? '16px 20px' : '24px', height: '100%', overflow: 'auto', ...boardBgStyle }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 12 }}>
        {!embedded && (
          <Breadcrumb
            items={[
              { title: <a onClick={() => navigate('/boards')}>보드</a> },
              { title: board.icon ? `${board.icon} ${board.title}` : board.title },
            ]}
            style={{ marginBottom: 8 }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Title level={4} style={{ margin: 0 }}>
              {board.icon && <span style={{ marginRight: 6 }}>{board.icon}</span>}
              {board.title}
            </Title>
            {linkedRoom && (
              <Tooltip title={`채팅방: ${linkedRoom.name ?? '1:1 채팅'}`}>
                <Tag icon={<MessageOutlined />} color="blue" style={{ fontSize: 11 }}>
                  {linkedRoom.name ?? '채팅 연결됨'}
                </Tag>
              </Tooltip>
            )}
          </div>

          <Space wrap>
            {/* 뷰 전환 */}
            {VIEW_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                type={view === opt.value ? 'primary' : 'default'}
                icon={opt.icon}
                size="small"
                onClick={() => handleViewChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}

            {/* 보드 내 검색 */}
            <Input
              size="small"
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="카드 검색..."
              style={{ width: 160 }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
            />

            {/* 칸반: 그룹 기준 */}
            {view === 'kanban' && selectProps.length > 0 && (
              <Select
                size="small"
                style={{ width: 150 }}
                placeholder="그룹 기준 속성"
                value={groupPropId ?? undefined}
                allowClear
                onChange={v => handleKanbanGroupChange(v ?? null)}
              >
                {selectProps.map(p => (
                  <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                ))}
              </Select>
            )}

            {/* 칸반: 스위밍레인 설정 */}
            {view === 'kanban' && (
              <Tooltip title="스위밍레인 설정">
                <Dropdown
                  trigger={['click']}
                  dropdownRender={() => (
                    <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: 12, minWidth: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>스위밍레인 기준</Text>
                      <Select
                        size="small"
                        style={{ width: '100%' }}
                        placeholder="레인 기준 없음"
                        value={swimlaneConfigPropId ?? undefined}
                        allowClear
                        onChange={v => {
                          setSwimlanePropId(v ?? null);
                          handleSwimlaneSave(v ?? null);
                        }}
                      >
                        {selectProps.map(p => (
                          <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                        ))}
                      </Select>
                    </div>
                  )}
                >
                  <Button
                    size="small"
                    icon={<PartitionOutlined />}
                    type={swimlaneConfigPropId ? 'primary' : 'default'}
                  >
                    레인
                  </Button>
                </Dropdown>
              </Tooltip>
            )}

            {/* 칸반: WIP 제한 설정 */}
            {view === 'kanban' && (
              <Tooltip title="WIP 제한 설정">
                <Button
                  size="small"
                  icon={<SettingOutlined />}
                  type={Object.keys(wipLimits).length > 0 ? 'primary' : 'default'}
                  onClick={() => setWipConfigOpen(true)}
                >
                  WIP
                </Button>
              </Tooltip>
            )}

            {/* F-B05 필터 */}
            <Tooltip title="필터">
              <Button
                size="small"
                icon={<FilterOutlined />}
                type={filters.length > 0 ? 'primary' : 'default'}
                onClick={() => setFilterOpen(!filterOpen)}
              >
                {filters.length > 0 ? `필터 ${filters.length}` : '필터'}
              </Button>
            </Tooltip>

            {/* F-B05 정렬 */}
            <Select
              size="small"
              style={{ width: 110 }}
              value={sortField}
              onChange={setSortField}
              prefix={<SortAscendingOutlined />}
            >
              {SORT_FIELDS.map(f => (
                <Select.Option key={f.value} value={f.value}>{f.label}</Select.Option>
              ))}
            </Select>
            <Button
              size="small"
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            >
              {sortDir === 'asc' ? '↑ 오름차순' : '↓ 내림차순'}
            </Button>

            {/* 자동화 */}
            {isOwnerOrAdmin() && (
              <Tooltip title="워크플로우 자동화">
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  type={automations.filter(a => a.isActive).length > 0 ? 'primary' : 'default'}
                  onClick={() => setAutomationModalOpen(true)}
                >
                  자동화{automations.filter(a => a.isActive).length > 0 ? ` (${automations.filter(a => a.isActive).length})` : ''}
                </Button>
              </Tooltip>
            )}

            {/* 속성/멤버 관리 */}
            {isOwnerOrAdmin() && (
              <Tooltip title="속성 관리">
                <Button size="small" icon={<SettingOutlined />} onClick={() => setPropEditorOpen(true)} />
              </Tooltip>
            )}
            <Tooltip title="멤버 관리">
              <Button size="small" icon={<TeamOutlined />} onClick={() => setMemberManagerOpen(true)} />
            </Tooltip>

            {/* 더보기 */}
            <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        </div>

        {board.description && (
          <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>{board.description}</Text>
        )}

        {/* 검색 결과 수 표시 */}
        {searchQuery && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            "{searchQuery}" 검색 결과: {sortedCards.length}개
          </Text>
        )}
      </div>

      {/* 저장 뷰 탭 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0', marginBottom: 12, paddingBottom: 6 }}>
        {views.map(v => {
          const isActive = v.id === activeViewId;
          const typeMeta = VIEW_OPTIONS.find(o => o.value === v.type);
          const menuItems = [
            { key: 'rename', icon: <EditOutlined />, label: '이름 변경', onClick: () => openRenameViewModal(v) },
            { key: 'update', icon: <SettingOutlined />, label: '현재 상태로 갱신', onClick: () => handleUpdateActiveView(v) },
            { type: 'divider' },
            { key: 'delete', icon: <DeleteOutlined />, label: '삭제', danger: true, onClick: () => handleDeleteView(v) },
          ];
          return (
            <div
              key={v.id}
              onClick={() => applyViewConfig(v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                padding: '4px 10px', borderRadius: 6,
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? '#1677ff' : '#595959',
                background: isActive ? '#e6f4ff' : 'transparent',
              }}
            >
              <span style={{ fontSize: 12 }}>{typeMeta?.icon}</span>
              <span>{v.name}</span>
              {canEdit() && (
                <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                  <MoreOutlined onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: '#bfbfbf' }} />
                </Dropdown>
              )}
            </div>
          );
        })}
        {canEdit() && (
          <Tooltip title="현재 화면을 새 뷰로 저장">
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={openCreateViewModal} style={{ color: '#8c8c8c' }}>
              뷰 추가
            </Button>
          </Tooltip>
        )}
      </div>

      {/* F-B05 필터 패널 */}
      {filterOpen && (
        <div style={{ background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>필터</Text>
            {filters.map(f => (
              <Tag
                key={f.id}
                closable
                onClose={() => removeFilter(f.id)}
                color="blue"
                style={{ fontSize: 12 }}
              >
                {getFilterLabel(f)}
              </Tag>
            ))}
            {filters.length > 0 && (
              <Button size="small" type="text" danger onClick={() => setFilters([])}>전체 초기화</Button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select
              size="small"
              style={{ width: 120 }}
              value={pendingFilter.field}
              onChange={v => setPendingFilter(p => ({ ...p, field: v, value: '' }))}
            >
              <Select.Option value="status">상태</Select.Option>
              <Select.Option value="priority">우선순위</Select.Option>
              <Select.Option value="assignee">담당자</Select.Option>
              <Select.Option value="dueDate">마감일</Select.Option>
              {(board.properties ?? []).filter(p => ['select', 'text', 'multiselect'].includes(p.type)).map(p => (
                <Select.Option key={p.id} value={String(p.id)}>{p.name}</Select.Option>
              ))}
            </Select>

            <Select
              size="small"
              style={{ width: 80 }}
              value={pendingFilter.op}
              onChange={v => setPendingFilter(p => ({ ...p, op: v }))}
            >
              <Select.Option value="eq">일치</Select.Option>
              <Select.Option value="contains">포함</Select.Option>
              {pendingFilter.field === 'dueDate' && <>
                <Select.Option value="before">이전</Select.Option>
                <Select.Option value="after">이후</Select.Option>
              </>}
            </Select>

            {pendingFilter.field === 'status' && (
              <Select size="small" style={{ width: 100 }} value={pendingFilter.value} onChange={v => setPendingFilter(p => ({ ...p, value: v }))}>
                {STATUS_OPTIONS.map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
              </Select>
            )}
            {pendingFilter.field === 'priority' && (
              <Select size="small" style={{ width: 100 }} value={pendingFilter.value} onChange={v => setPendingFilter(p => ({ ...p, value: v }))}>
                {PRIORITY_OPTIONS.map(p => <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>)}
              </Select>
            )}
            {pendingFilter.field === 'assignee' && (
              <Select size="small" style={{ width: 120 }} value={pendingFilter.value} onChange={v => setPendingFilter(p => ({ ...p, value: v }))}>
                {allUsers.map(u => <Select.Option key={u.id} value={u.id}>{u.displayName}</Select.Option>)}
              </Select>
            )}
            {pendingFilter.field === 'dueDate' && (
              <Input type="date" size="small" style={{ width: 130 }} value={pendingFilter.value} onChange={e => setPendingFilter(p => ({ ...p, value: e.target.value }))} />
            )}
            {!['status', 'priority', 'assignee', 'dueDate'].includes(pendingFilter.field) && (
              <Input size="small" style={{ width: 120 }} placeholder="값 입력" value={pendingFilter.value} onChange={e => setPendingFilter(p => ({ ...p, value: e.target.value }))} />
            )}

            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={addFilter}>추가</Button>
          </div>
        </div>
      )}

      {/* 뷰 렌더링 */}
      {view === 'kanban' && (
        <KanbanView
          board={effectiveBoard}
          cards={sortedCards}
          onAddCard={canEdit() ? openAddCard : null}
          onEditCard={openEditCard}
          onDeleteCard={canEdit() ? handleDeleteCard : null}
          onCardDrop={canEdit() ? handleCardDrop : null}
          onQuickAdd={canEdit() ? handleQuickAdd : null}
          readonly={!canEdit()}
        />
      )}
      {view === 'table' && (
        <TableView
          board={board}
          cards={sortedCards}
          onAddCard={canEdit() ? openAddCard : null}
          onEditCard={openEditCard}
          onDeleteCard={canEdit() ? handleDeleteCard : null}
          readonly={!canEdit()}
          builtinCols={builtinCols}
        />
      )}
      {view === 'gallery' && (
        <GalleryView
          board={board}
          cards={sortedCards}
          onAddCard={canEdit() ? openAddCard : null}
          onEditCard={openEditCard}
          onDeleteCard={canEdit() ? handleDeleteCard : null}
          readonly={!canEdit()}
        />
      )}
      {view === 'calendar' && (
        <CalendarView
          board={board}
          cards={sortedCards}
          onAddCard={canEdit() ? openAddCard : null}
          onEditCard={openEditCard}
        />
      )}
      {view === 'timeline' && (
        <TimelineView
          board={board}
          cards={sortedCards}
          onEditCard={openEditCard}
        />
      )}

      {/* 카드 모달 */}
      <CardModal
        open={cardModalOpen}
        onClose={() => { setCardModalOpen(false); setEditingCard(null); setInitialGroupValue(null); }}
        onSave={handleCardSaved}
        boardId={boardId}
        properties={board.properties ?? []}
        card={editingCard
          ? { ...editingCard }
          : (initialGroupValue !== null && groupPropId)
            ? { title: '', description: '', properties: [{ propertyId: groupPropId, value: initialGroupValue }] }
            : null}
        users={allUsers}
      />

      {/* 속성 에디터 */}
      <PropertyEditor
        open={propEditorOpen}
        onClose={() => setPropEditorOpen(false)}
        boardId={boardId}
        properties={board.properties ?? []}
        onPropertiesChange={p => setBoard(prev => ({ ...prev, properties: p }))}
        builtinCols={builtinCols}
        onBuiltinColsChange={handleBuiltinColsChange}
      />

      {/* 멤버 관리 */}
      <MemberManager
        open={memberManagerOpen}
        onClose={() => setMemberManagerOpen(false)}
        boardId={boardId}
        members={board.members ?? []}
        allUsers={allUsers}
        currentUserId={user.id}
        isOwnerOrAdmin={isOwnerOrAdmin()}
        onMembersChange={m => setBoard(prev => ({ ...prev, members: m }))}
      />

      {/* F-B06 채팅방 연결 모달 */}
      <Modal
        title={<span><MessageOutlined style={{ marginRight: 8 }} />채팅방 연결</span>}
        open={chatLinkOpen}
        onOk={handleChatLink}
        onCancel={() => setChatLinkOpen(false)}
        okText="저장" cancelText="취소"
        width={400}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
          연결된 채팅방에 카드 생성/수정/삭제 알림이 전송됩니다.
        </Text>
        <Select
          style={{ width: '100%' }}
          placeholder="채팅방 선택"
          value={selectedRoomId}
          onChange={setSelectedRoomId}
          allowClear
        >
          {rooms.map(r => (
            <Select.Option key={r.id} value={r.id}>
              {r.type === 'group' ? `👥 ${r.name}` : `💬 ${r.members?.filter(m => m.userId !== user.id).map(m => m.user?.displayName).join(', ') || '1:1 채팅'}`}
            </Select.Option>
          ))}
        </Select>
      </Modal>

      {/* WIP 제한 설정 모달 */}
      <Modal
        title={<span><SettingOutlined style={{ marginRight: 8 }} />WIP 제한 설정</span>}
        open={wipConfigOpen}
        onOk={handleWipSave}
        onCancel={() => setWipConfigOpen(false)}
        okText="저장" cancelText="취소"
        width={420}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
          각 상태 열의 최대 카드 수를 설정합니다. 0은 제한 없음입니다.
        </Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {statusColumns.map(col => (
            <div key={col.value} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Text style={{ width: 80, flexShrink: 0 }}>{col.label}</Text>
              <InputNumber
                min={0}
                max={999}
                value={wipLimits[col.value] ?? 0}
                onChange={v => setWipLimits(prev => ({ ...prev, [col.value]: v ?? 0 }))}
                placeholder="제한 없음"
                style={{ width: 120 }}
              />
              {wipLimits[col.value] > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>최대 {wipLimits[col.value]}개</Text>
              )}
            </div>
          ))}
        </div>
      </Modal>

      {/* 자동화 모달 */}
      <Modal
        title={<span><ThunderboltOutlined style={{ marginRight: 8 }} />워크플로우 자동화</span>}
        open={automationModalOpen}
        onCancel={() => setAutomationModalOpen(false)}
        footer={null}
        width={600}
      >
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => { setEditingAuto(null); autoForm.resetFields(); setAutoFormOpen(true); }}
          >
            자동화 추가
          </Button>
        </div>

        {automations.length === 0 ? (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '20px 0' }}>
            자동화가 없습니다. 추가 버튼을 눌러 워크플로우를 만들어보세요.
          </Text>
        ) : (
          <List
            dataSource={automations}
            renderItem={auto => (
              <List.Item
                actions={[
                  <Switch
                    key="toggle"
                    size="small"
                    checked={auto.isActive}
                    onChange={() => handleAutoToggle(auto)}
                  />,
                  <Button
                    key="edit"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingAuto(auto);
                      const tCfg = (() => { try { return auto.triggerConfig ? JSON.parse(auto.triggerConfig) : {}; } catch { return {}; } })();
                      const aCfg = (() => { try { return auto.actionConfig ? JSON.parse(auto.actionConfig) : {}; } catch { return {}; } })();
                      autoForm.setFieldsValue({
                        name: auto.name,
                        trigger: auto.trigger,
                        triggerValue: tCfg.value,
                        action: auto.action,
                        actionValue: aCfg.value,
                      });
                      setAutoFormOpen(true);
                    }}
                  />,
                  <Popconfirm
                    key="delete"
                    title="자동화를 삭제할까요?"
                    onConfirm={() => handleAutoDelete(auto.id)}
                    okText="삭제" cancelText="취소"
                  >
                    <Button size="small" icon={<DeleteOutlined />} danger />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Badge dot={auto.isActive} color="green">
                      <PlayCircleOutlined style={{ fontSize: 20, color: auto.isActive ? '#52c41a' : '#bfbfbf' }} />
                    </Badge>
                  }
                  title={<Text style={{ fontWeight: 600 }}>{auto.name}</Text>}
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {TRIGGER_OPTIONS.find(t => t.value === auto.trigger)?.label ?? auto.trigger}
                      {' → '}
                      {ACTION_OPTIONS.find(a => a.value === auto.action)?.label ?? auto.action}
                      {(() => { try { const c = auto.actionConfig ? JSON.parse(auto.actionConfig) : {}; return c.value ? ` (${c.value})` : ''; } catch { return ''; } })()}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* 자동화 폼 모달 */}
      <Modal
        title={editingAuto ? '자동화 수정' : '자동화 추가'}
        open={autoFormOpen}
        onOk={() => autoForm.submit()}
        onCancel={() => { setAutoFormOpen(false); setEditingAuto(null); autoForm.resetFields(); }}
        okText="저장" cancelText="취소"
        width={460}
      >
        <Form form={autoForm} layout="vertical" onFinish={handleAutoSave}>
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
            <Input placeholder="자동화 이름" />
          </Form.Item>
          <Form.Item name="trigger" label="트리거" rules={[{ required: true, message: '트리거를 선택하세요' }]}>
            <Select placeholder="언제 실행할까요?">
              {TRIGGER_OPTIONS.map(t => (
                <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.trigger !== cur.trigger}
          >
            {({ getFieldValue }) =>
              getFieldValue('trigger') === 'card_status_changed' ? (
                <Form.Item name="triggerValue" label="변경될 상태">
                  <Select placeholder="모든 상태 변경 시" allowClear>
                    {STATUS_OPTIONS.map(s => (
                      <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="action" label="액션" rules={[{ required: true, message: '액션을 선택하세요' }]}>
            <Select placeholder="무엇을 할까요?">
              {ACTION_OPTIONS.map(a => (
                <Select.Option key={a.value} value={a.value}>{a.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.action !== cur.action}
          >
            {({ getFieldValue }) => {
              const action = getFieldValue('action');
              if (action === 'set_status') return (
                <Form.Item name="actionValue" label="변경할 상태" rules={[{ required: true }]}>
                  <Select>
                    {STATUS_OPTIONS.map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
                  </Select>
                </Form.Item>
              );
              if (action === 'set_priority') return (
                <Form.Item name="actionValue" label="변경할 우선순위" rules={[{ required: true }]}>
                  <Select>
                    {PRIORITY_OPTIONS.map(p => <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>)}
                  </Select>
                </Form.Item>
              );
              if (action === 'notify') return (
                <Form.Item name="actionValue" label="알림 메시지">
                  <Input placeholder="알림으로 보낼 메시지" />
                </Form.Item>
              );
              return null;
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 저장 뷰 이름 모달 */}
      <Modal
        title={viewModalMode === 'create' ? '새 뷰 저장' : '뷰 이름 변경'}
        open={viewModalOpen}
        onOk={handleViewModalOk}
        onCancel={() => setViewModalOpen(false)}
        okText="저장" cancelText="취소"
        width={400}
      >
        {viewModalMode === 'create' && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
            현재 뷰 타입·필터·정렬·검색·컬럼 설정이 새 뷰로 저장됩니다.
          </Text>
        )}
        <Input
          placeholder="뷰 이름"
          value={viewNameInput}
          onChange={e => setViewNameInput(e.target.value)}
          onPressEnter={handleViewModalOk}
          autoFocus
          maxLength={100}
        />
      </Modal>
    </div>
  );
}
