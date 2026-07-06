import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Table, Button, Space, Typography, Tag, Tooltip, Badge, Popconfirm, Empty,
  theme as antTheme, message, Input, Dropdown,
} from 'antd';
import {
  InboxOutlined, SendOutlined, FileTextOutlined, StarOutlined, StarFilled,
  DeleteOutlined, PlusOutlined, ReloadOutlined, PaperClipOutlined, MailOutlined,
  SearchOutlined, TagOutlined, TagsOutlined, SettingOutlined, ThunderboltFilled,
  CheckOutlined, MailFilled, EyeInvisibleOutlined, RollbackOutlined,
} from '@ant-design/icons';
import {
  getMailList, toggleStar, trashMail, emptyTrash, getUnreadCount,
  getMailLabels, bulkMailAction, setMailLabels,
} from '../../api/mail';
import useAuthStore from '../../store/authStore';
import ComposeModal from './ComposeModal';
import MailDetail from './MailDetail';
import LabelManager from './LabelManager';
import dayjs from 'dayjs';

const { Text } = Typography;
const { useToken } = antTheme;

const FOLDERS = [
  { key: 'inbox',   label: '받은편지함', icon: <InboxOutlined /> },
  { key: 'sent',    label: '보낸편지함', icon: <SendOutlined /> },
  { key: 'drafts',  label: '임시저장',   icon: <FileTextOutlined /> },
  { key: 'starred', label: '중요메일',   icon: <StarOutlined /> },
  { key: 'trash',   label: '휴지통',     icon: <DeleteOutlined /> },
];

export default function MailPage() {
  const { token } = useToken();
  const user = useAuthStore(s => s.user);
  const [searchParams] = useSearchParams();
  const [folder, setFolder] = useState('inbox');
  const [mails, setMails] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') ? parseInt(searchParams.get('id')) : null);
  const [unread, setUnread] = useState(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  // 검색
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // 라벨
  const [labels, setLabels] = useState([]);
  const [activeLabelId, setActiveLabelId] = useState(null);
  const [labelMgrOpen, setLabelMgrOpen] = useState(false);

  // 일괄 선택
  const [selectedKeys, setSelectedKeys] = useState([]);

  const loadLabels = useCallback(() => {
    getMailLabels().then(setLabels).catch(() => {});
  }, []);
  useEffect(() => { loadLabels(); }, [loadLabels]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMailList({ folder, page, limit: 30, q: searchQuery || undefined, labelId: activeLabelId || undefined });
      setMails(data.mails || []);
      setTotal(data.total || 0);
    } catch { message.error('메일 목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, [folder, page, searchQuery, activeLabelId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getUnreadCount().then(d => setUnread(d.count || 0)).catch(() => {});
  }, [mails]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(parseInt(id));
  }, [searchParams]);

  // 폴더/라벨/검색 변경 시 선택 초기화
  useEffect(() => { setSelectedKeys([]); }, [folder, page, searchQuery, activeLabelId]);

  const handleFolderChange = (f) => {
    setFolder(f);
    setActiveLabelId(null);
    setPage(1);
    setSelectedId(null);
  };

  const handleLabelClick = (id) => {
    setActiveLabelId(id);
    setFolder('inbox');  // 라벨은 받은편지함 기준으로 필터
    setPage(1);
    setSelectedId(null);
  };

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
    setPage(1);
    setSelectedId(null);
  };
  const clearSearch = () => { setSearchInput(''); setSearchQuery(''); setPage(1); };

  const handleSelectMail = (mail) => {
    if (folder === 'drafts') {
      setEditDraft(mail);
      setComposeMode('draft');
      setComposeOpen(true);
    } else {
      setSelectedId(mail.id);
    }
  };

  const handleStar = async (e, id) => {
    e.stopPropagation();
    await toggleStar(id).catch(() => {});
    load();
  };

  const handleTrash = async (e, id) => {
    e.stopPropagation();
    await trashMail(id).catch(() => {});
    message.success('휴지통으로 이동했습니다.');
    load();
  };

  const handleEmptyTrash = async () => {
    await emptyTrash();
    message.success('휴지통을 비웠습니다.');
    load();
  };

  // 일괄 처리
  const doBulk = async (action) => {
    if (!selectedKeys.length) return;
    try {
      await bulkMailAction(selectedKeys, action);
      const labelMap = { read: '읽음 처리', unread: '안읽음 처리', star: '별표 지정', unstar: '별표 해제', trash: '휴지통 이동', delete: '영구 삭제', restore: '복원' };
      message.success(`${selectedKeys.length}건 ${labelMap[action] || '처리'} 완료`);
      setSelectedKeys([]);
      load();
    } catch (e) { message.error(e.response?.data?.error || '일괄 처리 실패'); }
  };

  // 선택 메일에 라벨 일괄 지정
  const applyLabelToSelected = async (labelId) => {
    if (!selectedKeys.length) return;
    try {
      for (const mid of selectedKeys) {
        const m = mails.find(x => x.id === mid);
        const cur = (m?.labels || []).map(l => l.id);
        const next = cur.includes(labelId) ? cur : [...cur, labelId];
        await setMailLabels(mid, next);
      }
      message.success('라벨을 지정했습니다.');
      setSelectedKeys([]);
      load();
    } catch { message.error('라벨 지정 실패'); }
  };

  const isRecipientFolder = folder === 'inbox' || folder === 'starred' || folder === 'trash';

  const columns = [
    {
      dataIndex: 'isRead',
      width: 12,
      align: 'center',
      render: (isRead) => (
        <div style={{
          width: 7, height: 7, borderRadius: '50%', margin: '0 auto',
          background: isRead ? 'transparent' : token.colorPrimary,
        }} />
      ),
    },
    {
      title: folder === 'sent' ? '받는 사람' : '보낸 사람',
      width: 110,
      render: (_, row) => {
        if (folder === 'sent') {
          const tos = row.recipients?.filter(r => r.type === 'to') || [];
          const name = tos[0]?.user?.displayName || '-';
          return <Text style={{ fontSize: 12, fontWeight: row.isRead ? 400 : 600 }}>{name}{tos.length > 1 ? ` 외 ${tos.length - 1}` : ''}</Text>;
        }
        return <Text style={{ fontSize: 12, fontWeight: row.isRead ? 400 : 600 }}>{row.from?.displayName || '-'}</Text>;
      },
    },
    {
      title: '제목',
      ellipsis: true,
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {row.priority === 'urgent' && (
            <Tag color="red" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px', flexShrink: 0 }}>긴급</Tag>
          )}
          <Text
            ellipsis={{ tooltip: row.subject || '(제목 없음)' }}
            style={{ fontSize: 13, fontWeight: row.isRead ? 400 : 600, flex: 1, minWidth: 0 }}
          >
            {row.subject || '(제목 없음)'}
          </Text>
          {row.attachments?.length > 0 && (
            <PaperClipOutlined style={{ fontSize: 11, color: token.colorTextSecondary, flexShrink: 0 }} />
          )}
          {/* 라벨 표시 (최대 2개) */}
          {row.labels?.slice(0, 2).map(lb => (
            <Tag key={lb.id} color={lb.color} style={{ fontSize: 10, margin: 0, padding: '0 5px', lineHeight: '16px', border: 'none', flexShrink: 0 }}>
              {lb.name}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      dataIndex: 'createdAt',
      width: 80,
      render: (v) => {
        const d = dayjs(v);
        const isToday = d.isSame(dayjs(), 'day');
        return (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {isToday ? d.format('HH:mm') : d.format('MM.DD')}
          </Text>
        );
      },
    },
    {
      width: 60,
      render: (_, row) => (
        <Space size={2} onClick={e => e.stopPropagation()}>
          {folder !== 'sent' && folder !== 'drafts' && (
            <Tooltip title={row.isStarred ? '별표 해제' : '별표'}>
              <Button
                size="small" type="text"
                icon={row.isStarred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                onClick={e => handleStar(e, row.id)}
              />
            </Tooltip>
          )}
          {folder !== 'trash' && folder !== 'drafts' && (
            <Tooltip title="휴지통">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={e => handleTrash(e, row.id)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // 라벨 지정 드롭다운 메뉴
  const labelMenuItems = labels.length
    ? labels.map(lb => ({
        key: lb.id,
        label: (
          <Space size={6}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: lb.color, display: 'inline-block' }} />
            {lb.name}
          </Space>
        ),
        onClick: () => applyLabelToSelected(lb.id),
      }))
    : [{ key: 'none', label: '라벨이 없습니다', disabled: true }];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', background: token.colorBgLayout }}>
      {/* 폴더 사이드바 */}
      <div style={{
        width: 200,
        background: token.colorBgContainer,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
        flexShrink: 0,
        overflowY: 'auto',
      }}>
        <div style={{ padding: '0 12px 16px' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            block
            onClick={() => { setEditDraft(null); setComposeMode(null); setComposeOpen(true); }}
          >
            메일 쓰기
          </Button>
        </div>

        {FOLDERS.map(f => {
          const active = folder === f.key && !activeLabelId;
          return (
            <div
              key={f.key}
              onClick={() => handleFolderChange(f.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', cursor: 'pointer',
                background: active ? token.colorPrimaryBg : 'transparent',
                color: active ? token.colorPrimary : token.colorText,
                fontWeight: active ? 600 : 400, fontSize: 13,
                transition: 'all 0.14s',
                borderRight: active ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 15, color: active ? token.colorPrimary : token.colorTextSecondary }}>
                {f.icon}
              </span>
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.key === 'inbox' && unread > 0 && (
                <Badge count={unread} size="small" style={{ backgroundColor: token.colorPrimary }} />
              )}
            </div>
          );
        })}

        {/* 라벨 섹션 */}
        <div style={{
          marginTop: 16, padding: '8px 16px 4px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>라벨</Text>
          <Tooltip title="라벨 관리">
            <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => setLabelMgrOpen(true)} style={{ height: 20, width: 20, minWidth: 20 }} />
          </Tooltip>
        </div>
        {labels.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 11, padding: '4px 16px' }}>
            <a onClick={() => setLabelMgrOpen(true)}>+ 라벨 추가</a>
          </Text>
        ) : labels.map(lb => {
          const active = activeLabelId === lb.id;
          return (
            <div
              key={lb.id}
              onClick={() => handleLabelClick(lb.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 16px', cursor: 'pointer',
                background: active ? token.colorPrimaryBg : 'transparent',
                fontWeight: active ? 600 : 400, fontSize: 13,
                borderRight: active ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 3, background: lb.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: active ? token.colorPrimary : token.colorText }}>{lb.name}</span>
            </div>
          );
        })}
      </div>

      {/* 메일 목록 / 상세 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 목록 패널 */}
        <div style={{
          width: selectedId ? 420 : '100%',
          borderRight: selectedId ? `1px solid ${token.colorBorderSecondary}` : 'none',
          display: 'flex', flexDirection: 'column',
          background: token.colorBgContainer,
          transition: 'width 0.2s', flexShrink: 0, overflow: 'hidden',
        }}>
          {/* 검색바 */}
          <div style={{ padding: '10px 16px 0' }}>
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onPressEnter={handleSearch}
              placeholder="제목·내용·보낸사람 검색"
              prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
              allowClear
              onClear={clearSearch}
              size="small"
              suffix={
                <Button type="text" size="small" onClick={handleSearch} style={{ height: 20, fontSize: 11 }}>검색</Button>
              }
            />
          </div>

          {/* 목록 헤더 */}
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Space size={6}>
              {activeLabelId ? (
                <>
                  <TagOutlined style={{ color: labels.find(l => l.id === activeLabelId)?.color }} />
                  <Text strong style={{ fontSize: 14 }}>{labels.find(l => l.id === activeLabelId)?.name}</Text>
                </>
              ) : (
                <>
                  <MailOutlined style={{ color: token.colorPrimary }} />
                  <Text strong style={{ fontSize: 14 }}>{FOLDERS.find(f => f.key === folder)?.label}</Text>
                </>
              )}
              {searchQuery && (
                <Tag closable onClose={clearSearch} style={{ fontSize: 11 }}>"{searchQuery}"</Tag>
              )}
              {total > 0 && (
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>전체 {total}</Text>
                  {folder === 'inbox' && !activeLabelId && !searchQuery && (
                    unread > 0
                      ? <Tag color="red" style={{ fontSize: 11, margin: 0, padding: '0 6px', lineHeight: '18px' }}>미열람 {unread}</Tag>
                      : <Tag color="green" style={{ fontSize: 11, margin: 0, padding: '0 6px', lineHeight: '18px' }}>모두 읽음</Tag>
                  )}
                </Space>
              )}
            </Space>
            <Space>
              {folder === 'trash' && mails.length > 0 && (
                <Popconfirm title="휴지통을 비우시겠습니까?" onConfirm={handleEmptyTrash} okText="비우기" cancelText="취소">
                  <Button size="small" danger>비우기</Button>
                </Popconfirm>
              )}
              <Button size="small" type="text" icon={<ReloadOutlined />} onClick={load} loading={loading} />
            </Space>
          </div>

          {/* 일괄 처리 툴바 */}
          {selectedKeys.length > 0 && (
            <div style={{
              padding: '8px 16px',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorPrimaryBg,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <Text strong style={{ fontSize: 12, color: token.colorPrimary }}>{selectedKeys.length}건 선택</Text>
              <Button size="small" icon={<MailFilled />} onClick={() => doBulk('read')}>읽음</Button>
              <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => doBulk('unread')}>안읽음</Button>
              <Button size="small" icon={<StarOutlined />} onClick={() => doBulk('star')}>별표</Button>
              <Dropdown menu={{ items: labelMenuItems }} trigger={['click']}>
                <Button size="small" icon={<TagsOutlined />}>라벨</Button>
              </Dropdown>
              {folder === 'trash' ? (
                <>
                  <Button size="small" icon={<RollbackOutlined />} onClick={() => doBulk('restore')}>복원</Button>
                  <Popconfirm title={`${selectedKeys.length}건을 영구 삭제하시겠습니까?`} onConfirm={() => doBulk('delete')} okText="삭제" cancelText="취소">
                    <Button size="small" danger icon={<DeleteOutlined />}>영구삭제</Button>
                  </Popconfirm>
                </>
              ) : (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => doBulk('trash')}>휴지통</Button>
              )}
              <Button size="small" type="text" onClick={() => setSelectedKeys([])}>선택 해제</Button>
            </div>
          )}

          {/* 목록 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {mails.length === 0 && !loading ? (
              <Empty description={searchQuery ? '검색 결과가 없습니다.' : '메일이 없습니다.'} style={{ marginTop: 60 }} />
            ) : (
              <Table
                dataSource={mails}
                columns={columns}
                rowKey="id"
                loading={loading}
                size="small"
                showHeader={false}
                rowSelection={isRecipientFolder ? {
                  selectedRowKeys: selectedKeys,
                  onChange: setSelectedKeys,
                  columnWidth: 36,
                } : undefined}
                pagination={{
                  current: page, pageSize: 30, total,
                  onChange: p => setPage(p),
                  showSizeChanger: false, size: 'small',
                  style: { padding: '8px 16px' },
                }}
                onRow={row => ({
                  onClick: () => handleSelectMail(row),
                  style: {
                    cursor: 'pointer',
                    background: row.id === selectedId ? token.colorPrimaryBg : undefined,
                  },
                })}
                style={{ border: 'none' }}
              />
            )}
          </div>
        </div>

        {/* 상세 패널 */}
        {selectedId && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MailDetail
              mailId={selectedId}
              folder={folder}
              labels={labels}
              onBack={() => setSelectedId(null)}
              onRefresh={load}
              onLabelsChanged={loadLabels}
            />
          </div>
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        mode={composeMode}
        sourceMail={editDraft}
        onClose={() => { setComposeOpen(false); setEditDraft(null); setComposeMode(null); }}
        onSent={() => { load(); setComposeOpen(false); setEditDraft(null); setComposeMode(null); }}
      />

      <LabelManager
        open={labelMgrOpen}
        onClose={() => setLabelMgrOpen(false)}
        onChanged={() => { loadLabels(); load(); }}
      />
    </div>
  );
}
