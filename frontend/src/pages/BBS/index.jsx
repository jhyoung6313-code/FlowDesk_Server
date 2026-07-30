import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Layout, Tree, Table, Button, Space, Typography, Tag, Input, message,
  Form, Select, Tooltip, Popconfirm, Badge, theme as antTheme, Empty, Switch,
  DatePicker, Segmented,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, PushpinOutlined,
  EyeOutlined, CommentOutlined, PaperClipOutlined, SearchOutlined,
  FolderOutlined, FileTextOutlined, SettingOutlined, LockOutlined,
  UnlockOutlined, ProfileOutlined, ContainerOutlined,
} from '@ant-design/icons';
import {
  getBbsCategories, createBbsCategory, updateBbsCategory, deleteBbsCategory,
  reorderBbsCategories,
  getBbsPosts, pinBbsPost, deleteBbsPost,
} from '../../api/bbs';
import ResizableDrawer from '../../components/common/ResizableDrawer';
import { CommandBar, DetailEmpty } from '../../components/listkit';
import PostFormDrawer from './PostFormDrawer';
import PostDetail from './PostDetail';
import useAuthStore from '../../store/authStore';
import dayjs from 'dayjs';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;
const { useToken } = antTheme;

const WRITE_ROLE_LABELS = { all: '모든 사용자', admin: '관리자만' };
const SEARCH_FIELD_LABELS = { title: '제목', senderOrg: '발신처', recipientDepts: '수신부서', content: '내용', all: '전체' };
const ICON_OPTIONS = ['📋', '📁', '📌', '🗂️', '📢', '💡', '❓', '📝', '🔔', '⭐', '📑', '🏷️'];

function buildTree(items) {
  const map = {};
  items.forEach(i => { map[i.id] = { ...i, children: [] }; });
  const roots = [];
  items.forEach(i => {
    if (i.parentId && map[i.parentId]) map[i.parentId].children.push(map[i.id]);
    else roots.push(map[i.id]);
  });
  function toTreeNode(node) {
    return {
      key: String(node.id),
      title: node.name,
      icon: node.icon || null,
      writeRole: node.writeRole,
      rawData: node,
      isLeaf: node.children.length === 0,
      children: node.children.map(toTreeNode),
    };
  }
  return roots.map(toTreeNode);
}

export default function BbsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const { token } = useToken();

  const [categories, setCategories] = useState([]);
  const [treeData, setTreeData] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [selectedCat, setSelectedCat] = useState(null);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');      // 실제 적용된 검색어
  const [searchInput, setSearchInput] = useState(''); // 입력창 표시값
  const [searchField, setSearchField] = useState('title'); // 검색 항목(게시글 입력 기준)
  const [dateField, setDateField] = useState('createdAt');  // 기간 기준(작성일/처리기한)
  const [dateRange, setDateRange] = useState(null);          // [dayjs, dayjs] | null
  const searchTimer = useRef(null);

  const [selectedPostId, setSelectedPostId] = useState(null);
  // 미리보기 패널 토글 (B: 사이드 프리뷰 / C: 전체화면 상세) — 사용자별 기억
  const [previewMode, setPreviewMode] = useState(() => {
    const v = localStorage.getItem('bbs_preview_mode');
    return v === null ? true : v === '1';
  });
  const togglePreviewMode = (v) => {
    setPreviewMode(v);
    localStorage.setItem('bbs_preview_mode', v ? '1' : '0');
  };

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm] = Form.useForm();
  const [catSaving, setCatSaving] = useState(false);

  // 글쓰기/수정 드로어
  const [postDrawerOpen, setPostDrawerOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);

  const loadCategories = useCallback(async () => {
    try {
      const data = await getBbsCategories();
      setCategories(data);
      setTreeData(buildTree(data));
    } catch {
      message.error('카테고리를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  useEffect(() => {
    const catId = searchParams.get('categoryId');
    if (catId) setSelectedCatId(Number(catId));
    const postId = searchParams.get('postId');
    if (postId) setSelectedPostId(Number(postId));
  }, []);

  const loadPosts = useCallback(async () => {
    if (!selectedCatId) return;
    setLoading(true);
    try {
      const data = await getBbsPosts({
        categoryId: selectedCatId, page, limit: 20, search, searchField,
        dateField,
        dateFrom: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
        dateTo: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
      });
      setPosts(data.posts || []);
      setTotal(data.total || 0);
    } catch {
      message.error('게시글을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedCatId, page, search, searchField, dateField, dateRange]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // 디바운스 타이머 정리
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  // 선택된 카테고리 객체 동기화 (URL 딥링크 포함)
  useEffect(() => {
    if (selectedCatId) setSelectedCat(categories.find(c => c.id === selectedCatId) || null);
  }, [selectedCatId, categories]);

  const handleSelectCategory = (keys) => {
    if (!keys.length) return;
    const id = Number(keys[0]);
    setSelectedCatId(id);
    setSelectedPostId(null);
    setPage(1);
    setSearch('');
    setSearchInput('');
    setDateRange(null);
    setSearchParams({ categoryId: id });
  };

  // 입력 즉시(디바운스 300ms) 검색 적용
  const handleSearchChange = (value) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(value.trim());
      setPage(1);
    }, 300);
  };

  // 즉시 검색 (Enter/돋보기) — 디바운스 대기 없이 바로 적용
  const handleSearchNow = (value) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch(value.trim());
    setPage(1);
  };

  // 트리에서 평탄화하여 [{ id, order, parentId }] 페이로드 생성
  const flattenForReorder = (nodes, parentId = null) => {
    let out = [];
    nodes.forEach((node, idx) => {
      out.push({ id: Number(node.key), order: idx, parentId });
      if (node.children?.length) {
        out = out.concat(flattenForReorder(node.children, Number(node.key)));
      }
    });
    return out;
  };

  // 특정 노드의 부모 key 반환 (최상위면 null)
  const findParentKey = (nodes, key, parentKey = null) => {
    for (const node of nodes) {
      if (node.key === key) return parentKey;
      if (node.children?.length) {
        const found = findParentKey(node.children, key, node.key);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  const handleDrop = async (info) => {
    const dropKey = info.node.key;
    const dragKey = info.dragNode.key;
    const dropPos = info.node.pos.split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    // 소속(부모)이 바뀌는 이동은 차단 — 같은 게시판 그룹 내에서만 순서 변경 허용
    const dragParentKey = findParentKey(treeData, dragKey) ?? null;
    const targetParentKey = !info.dropToGap
      ? dropKey // 노드 안쪽으로 드롭 → 자식 편입 시도
      : (findParentKey(treeData, dropKey) ?? null);
    if (dragParentKey !== targetParentKey) {
      message.warning('같은 게시판 안에서만 순서를 변경할 수 있습니다.');
      return;
    }

    const data = JSON.parse(JSON.stringify(treeData));

    const loop = (arr, key, cb) => {
      for (let i = 0; i < arr.length; i += 1) {
        if (arr[i].key === key) return cb(arr[i], i, arr);
        if (arr[i].children) loop(arr[i].children, key, cb);
      }
    };

    // 드래그 대상 분리
    let dragObj;
    loop(data, dragKey, (item, index, arr) => {
      arr.splice(index, 1);
      dragObj = item;
    });
    if (!dragObj) return;

    if (!info.dropToGap) {
      // 노드 안쪽에 드롭 → 자식으로 편입
      loop(data, dropKey, (item) => {
        item.children = item.children || [];
        item.children.unshift(dragObj);
      });
    } else {
      let ar = [];
      let i = 0;
      loop(data, dropKey, (item, index, arr) => { ar = arr; i = index; });
      if (dropPosition === -1) ar.splice(i, 0, dragObj);
      else ar.splice(i + 1, 0, dragObj);
    }

    setTreeData(data); // 즉시 반영
    try {
      await reorderBbsCategories(flattenForReorder(data));
      loadCategories();
    } catch {
      message.error('순서 저장에 실패했습니다.');
      loadCategories(); // 원복
    }
  };

  const handleSelectPost = (postId) => {
    setSelectedPostId(postId);
    setSearchParams({ categoryId: String(selectedCatId), postId: String(postId) });
  };

  const handlePin = async (id) => {
    try { await pinBbsPost(id); loadPosts(); }
    catch { message.error('고정 상태 변경 실패'); }
  };

  const handleDelete = async (id) => {
    try { await deleteBbsPost(id); message.success('삭제되었습니다.'); loadPosts(); }
    catch { message.error('삭제 실패'); }
  };

  const openCatCreate = () => { setEditingCat(null); catForm.resetFields(); setCatModalOpen(true); };
  const openCatEdit = (cat) => {
    setEditingCat(cat);
    catForm.setFieldsValue({ name: cat.name, description: cat.description, parentId: cat.parentId || undefined, icon: cat.icon || undefined, writeRole: cat.writeRole || 'all', showOnDashboard: cat.showOnDashboard || false });
    setCatModalOpen(true);
  };

  const handleCatSave = async () => {
    try {
      const values = await catForm.validateFields();
      setCatSaving(true);
      if (editingCat) { await updateBbsCategory(editingCat.id, values); message.success('수정되었습니다.'); }
      else { await createBbsCategory(values); message.success('게시판이 생성되었습니다.'); }
      setCatModalOpen(false);
      loadCategories();
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    } finally { setCatSaving(false); }
  };

  const handleCatDelete = async (cat) => {
    try {
      await deleteBbsCategory(cat.id);
      message.success('삭제되었습니다.');
      if (selectedCatId === cat.id) { setSelectedCatId(null); setSelectedCat(null); }
      loadCategories();
    } catch { message.error('삭제 실패 (하위 카테고리나 게시글이 있을 수 있습니다.)'); }
  };

  const canWrite = selectedCat ? (selectedCat.writeRole === 'all' || isAdmin) : false;

  // 트리 노드 타이틀 렌더러
  const renderTreeTitle = (nodeData, isTop = false, isFirstTop = false) => {
    const cat = nodeData.rawData;
    const isSelected = cat.id === selectedCatId;
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', paddingRight: 4,
          // 최상위 게시판 강조: 배경 틴트(선택 시 제외) + 그룹 구분선
          ...(isTop ? {
            background: isSelected ? 'transparent' : token.colorFillTertiary,
            borderTop: isFirstTop ? 'none' : `1px solid ${token.colorBorderSecondary}`,
            marginTop: isFirstTop ? 0 : 4,
            paddingTop: 3, paddingBottom: 3, paddingLeft: 4,
          } : {}),
        }}
      >
        <Space size={5} style={{ flex: 1, overflow: 'hidden' }}>
          {cat.icon && <span style={{ fontSize: isTop ? 15 : 14 }}>{cat.icon}</span>}
          <span style={{
            fontSize: isTop ? 14 : 13,
            fontWeight: isTop ? 700 : 400,
            color: isTop ? token.colorTextHeading : undefined,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{cat.name}</span>
          {cat.writeRole === 'admin' && <LockOutlined style={{ fontSize: 10, color: token.colorWarning, flexShrink: 0 }} />}
        </Space>
        {isAdmin && (
          <Space size={2} className="cat-actions" style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <Button size="small" type="text" icon={<EditOutlined style={{ fontSize: 11 }} />} onClick={() => openCatEdit(cat)} style={{ width: 20, height: 20, padding: 0 }} />
            <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleCatDelete(cat)} okText="삭제" cancelText="취소">
              <Button size="small" type="text" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} style={{ width: 20, height: 20, padding: 0 }} />
            </Popconfirm>
          </Space>
        )}
      </div>
    );
  };

  const treeDataWithRender = (nodes, isRootLevel = true) => nodes.map((node, idx) => ({
    ...node,
    title: renderTreeTitle(node, isRootLevel, isRootLevel && idx === 0),
    children: node.children ? treeDataWithRender(node.children, false) : [],
  }));

  // 사이드 프리뷰(B) 모드에서만 목록을 좁게(compact) 표시. 전체화면(C) 모드는 목록을 숨기고 상세만 노출
  const sidePreview = !!selectedPostId && previewMode;
  const compact = sidePreview;

  const titleColumn = {
    title: '제목',
    dataIndex: 'title',
    ellipsis: true,
    render: (title, row) => {
      const deptPrefix = row.recipientDepts?.length ? `[${row.recipientDepts.join(', ')}]` : '';
      const displayTitle = `${deptPrefix}[${title}]`;
      return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {row.isPinned && <PushpinOutlined style={{ color: token.colorWarning, fontSize: 12, flexShrink: 0 }} />}
          <Text
            ellipsis={{ tooltip: displayTitle }}
            style={{ fontWeight: row.isPinned ? 600 : 400, color: token.colorText, fontSize: 13, flex: 1, minWidth: 0 }}
          >
            {deptPrefix && <span style={{ color: token.colorPrimary, fontWeight: 600 }}>{deptPrefix}</span>}
            {`[${title}]`}
          </Text>
          {row._count?.attachments > 0 && (
            <span style={{ fontSize: 11, color: token.colorTextTertiary, flexShrink: 0 }}>
              <PaperClipOutlined /> {row._count.attachments}
            </span>
          )}
          {row._count?.comments > 0 && (
            <span style={{ fontSize: 11, color: token.colorPrimary, flexShrink: 0 }}>
              <CommentOutlined /> {row._count.comments}
            </span>
          )}
        </div>
        {compact && (
          <div style={{ marginTop: 3, display: 'flex', gap: 10, fontSize: 11, color: token.colorTextTertiary }}>
            <span>{row.creator?.displayName}</span>
            <span>{dayjs(row.createdAt).format('MM.DD HH:mm')}</span>
            <span><EyeOutlined /> {row.viewCount}</span>
          </div>
        )}
      </div>
      );
    },
  };

  const columns = compact ? [titleColumn] : [
    titleColumn,
    {
      title: '발신처',
      dataIndex: 'senderOrg',
      width: 120,
      ellipsis: true,
      render: (v) => v
        ? <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>,
    },
    {
      title: '수신부서',
      dataIndex: 'recipientDepts',
      width: 140,
      ellipsis: true,
      render: (v) => (v?.length)
        ? <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v.join(', ') }}>{v.join(', ')}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>,
    },
    {
      title: '처리기한',
      dataIndex: 'officialDueDate',
      width: 100,
      align: 'center',
      render: (v) => {
        if (!v) return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
        const overdue = dayjs(v).isBefore(dayjs(), 'day');
        return (
          <Text style={{ fontSize: 12, color: overdue ? token.colorError : token.colorText, fontWeight: overdue ? 600 : 400 }}>
            {dayjs(v).format('YYYY.MM.DD')}
          </Text>
        );
      },
    },
    {
      title: '작성자',
      dataIndex: ['creator', 'displayName'],
      width: 90,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: <EyeOutlined />,
      dataIndex: 'viewCount',
      width: 56,
      align: 'center',
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '작성일',
      dataIndex: 'createdAt',
      width: 90,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('MM.DD HH:mm')}</Text>,
    },
    ...(isAdmin ? [{
      title: '',
      key: 'actions',
      width: 72,
      render: (_, row) => (
        <Space size={2} onClick={e => e.stopPropagation()}>
          <Tooltip title={row.isPinned ? '고정 해제' : '공지 고정'}>
            <Button size="small" type="text"
              icon={<PushpinOutlined style={{ color: row.isPinned ? token.colorWarning : token.colorTextQuaternary }} />}
              onClick={() => handlePin(row.id)}
            />
          </Tooltip>
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(row.id)} okText="삭제" cancelText="취소">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <Layout style={{ height: '100%', background: 'transparent' }}>
      <style>{`
        .cat-actions { opacity: 0; transition: opacity 0.15s; }
        .ant-tree-node-content-wrapper:hover .cat-actions { opacity: 1; }
      `}</style>

      {/* 카테고리 사이드바 */}
      <Sider
        width={220}
        theme="light"
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          overflow: 'auto',
          height: '100%',
        }}
      >
        <div style={{
          padding: '14px 14px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 6,
        }}>
          <Text strong style={{ fontSize: 13, color: token.colorTextHeading }}>게시판</Text>
          {isAdmin && (
            <Tooltip title="게시판 추가">
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined style={{ fontSize: 13 }} />}
                onClick={openCatCreate}
                style={{ width: 26, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              />
            </Tooltip>
          )}
        </div>

        {treeData.length === 0 ? (
          <div style={{ padding: '20px 14px', color: token.colorTextTertiary, fontSize: 12, textAlign: 'center' }}>
            {isAdmin ? '+ 버튼으로 게시판을 추가하세요.' : '등록된 게시판이 없습니다.'}
          </div>
        ) : (
          <Tree
            treeData={treeDataWithRender(treeData)}
            selectedKeys={selectedCatId ? [String(selectedCatId)] : []}
            onSelect={handleSelectCategory}
            draggable={isAdmin ? { icon: false } : false}
            onDrop={handleDrop}
            blockNode
            defaultExpandAll
            style={{ background: 'transparent', padding: '4px 6px' }}
          />
        )}
      </Sider>

      {/* 게시글 목록 / 상세 */}
      <Content style={{ display: 'flex', overflow: 'hidden', background: token.colorBgLayout, padding: 0 }}>
        {/* 목록 패널 (전체화면 모드에서 문서 선택 시 숨김) */}
        <div style={{
          width: sidePreview ? 400 : '100%',
          flexShrink: 0,
          borderRight: sidePreview ? `1px solid ${token.colorBorderSecondary}` : 'none',
          display: (selectedPostId && !previewMode) ? 'none' : 'flex',
          flexDirection: 'column',
          background: token.colorBgContainer,
          transition: 'width 0.2s',
          overflow: 'hidden',
        }}>
          {!selectedCatId ? (
            <DetailEmpty
              icon={<FileTextOutlined />}
              title="게시판을 선택하세요"
              hint="왼쪽에서 게시판을 선택하면 게시글 목록이 표시됩니다."
            />
          ) : (
            <>
              {/* 헤더 (CommandBar) */}
              <CommandBar
                style={{ padding: '11px 16px' }}
                left={
                  <Space size={8} align="center">
                    {selectedCat?.icon && <span style={{ fontSize: 18 }}>{selectedCat.icon}</span>}
                    <Title level={5} style={{ margin: 0 }}>{selectedCat?.name}</Title>
                    {selectedCat?.writeRole === 'admin' && (
                      <Tag icon={<LockOutlined />} color="warning" style={{ fontSize: 11 }}>관리자 전용</Tag>
                    )}
                  </Space>
                }
                right={
                  <Space size={6} align="center" wrap className="fd-toolbar">
                  {!compact && (
                    <Space size={4} align="center">
                      <Select
                        value={dateField}
                        onChange={setDateField}
                        style={{ width: 92 }}
                        options={[
                          { value: 'createdAt', label: '작성일' },
                          { value: 'officialDueDate', label: '처리기한' },
                        ]}
                      />
                      <RangePicker
                        value={dateRange}
                        onChange={(v) => { setDateRange(v); setPage(1); }}
                        format="YYYY-MM-DD"
                        allowEmpty={[true, true]}
                        style={{ width: 226 }}
                      />
                    </Space>
                  )}
                  <Select
                    value={searchField}
                    onChange={setSearchField}
                    style={{ width: 92 }}
                    options={[
                      { value: 'title', label: '제목' },
                      { value: 'senderOrg', label: '발신처' },
                      { value: 'recipientDepts', label: '수신부서' },
                      { value: 'content', label: '내용' },
                      { value: 'all', label: '전체' },
                    ]}
                  />
                  <Search
                    placeholder={`${SEARCH_FIELD_LABELS[searchField]} 검색`}
                    allowClear
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onSearch={handleSearchNow}
                    style={{ width: compact ? 130 : 170 }}
                  />
                  {!compact && (
                    <Tooltip title={previewMode ? '미리보기 패널: 켜짐 (목록 옆에서 바로 열람)' : '미리보기 패널: 꺼짐 (전체화면으로 열람)'}>
                      <Segmented
                        value={previewMode ? 'preview' : 'full'}
                        onChange={(v) => togglePreviewMode(v === 'preview')}
                        options={[
                          { value: 'preview', icon: <ProfileOutlined /> },
                          { value: 'full', icon: <ContainerOutlined /> },
                        ]}
                      />
                    </Tooltip>
                  )}
                    {canWrite && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => { setEditingPostId(null); setPostDrawerOpen(true); }}
                      >
                        글쓰기
                      </Button>
                    )}
                  </Space>
                }
              />

              {/* 목록 */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <Table
                  dataSource={posts}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  size="small"
                  showHeader={!compact}
                  pagination={{
                    current: page,
                    pageSize: 20,
                    total,
                    onChange: (p) => setPage(p),
                    showSizeChanger: false,
                    size: 'small',
                    simple: compact,
                    style: { padding: '8px 16px' },
                  }}
                  onRow={(row) => ({
                    onClick: (e) => {
                      if (e.target.closest('button') || e.target.closest('a')) return;
                      handleSelectPost(row.id);
                    },
                    style: {
                      cursor: 'pointer',
                      background: row.id === selectedPostId
                        ? token.colorPrimaryBg
                        : (row.isPinned ? `${token.colorWarning}08` : undefined),
                    },
                  })}
                  style={{ border: 'none' }}
                />
              </div>
            </>
          )}
        </div>

        {/* 상세 패널 */}
        {selectedPostId && (
          <div style={{ flex: 1, overflowY: 'auto', background: token.colorBgLayout }}>
            <PostDetail
              postId={selectedPostId}
              onBack={() => { setSelectedPostId(null); setSearchParams(selectedCatId ? { categoryId: String(selectedCatId) } : {}); }}
              onChanged={loadPosts}
            />
          </div>
        )}
      </Content>

      {/* 카테고리 추가/수정 드로어 */}
      <ResizableDrawer
        title={editingCat ? '게시판 수정' : '게시판 추가'}
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        width={420}
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setCatModalOpen(false)}>취소</Button>
            <Button type="primary" loading={catSaving} onClick={handleCatSave}>저장</Button>
          </Space>
        }
      >
        <Form form={catForm} layout="vertical">
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input placeholder="게시판 이름" />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input placeholder="설명 (선택)" />
          </Form.Item>
          <Form.Item name="parentId" label="상위 게시판">
            <Select allowClear placeholder="없음 (최상위)">
              {categories.filter(c => c.id !== editingCat?.id).map(c => (
                <Select.Option key={c.id} value={c.id}>{c.icon} {c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="icon" label="아이콘">
            <Select allowClear placeholder="아이콘 선택">
              {ICON_OPTIONS.map(ic => <Select.Option key={ic} value={ic}>{ic} {ic}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="writeRole" label="작성 권한" initialValue="all">
            <Select>
              <Select.Option value="all"><UnlockOutlined /> 모든 사용자</Select.Option>
              <Select.Option value="admin"><LockOutlined /> 관리자만</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="showOnDashboard"
            label="대시보드에 표시"
            valuePropName="checked"
            initialValue={false}
            tooltip="켜면 모든 사용자의 대시보드 게시판 위젯에 기본으로 노출됩니다."
          >
            <Switch />
          </Form.Item>
        </Form>
      </ResizableDrawer>

      {/* 글쓰기/수정 드로어 */}
      <PostFormDrawer
        open={postDrawerOpen}
        postId={editingPostId}
        categoryId={selectedCatId}
        onClose={() => setPostDrawerOpen(false)}
        onSaved={() => { setPostDrawerOpen(false); setEditingPostId(null); loadPosts(); }}
      />
    </Layout>
  );
}
