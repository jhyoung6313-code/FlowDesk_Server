import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button, Space, Typography, Tag, Tooltip, Badge, Popconfirm, Empty,
  theme as antTheme, message, Input, Dropdown, Checkbox, Pagination, Spin,
} from 'antd';
import {
  InboxOutlined, SendOutlined, FileTextOutlined, StarOutlined, StarFilled,
  DeleteOutlined, PlusOutlined, ReloadOutlined, PaperClipOutlined, MailOutlined,
  SearchOutlined, TagOutlined, TagsOutlined, SettingOutlined,
  MailFilled, EyeInvisibleOutlined, RollbackOutlined,
} from '@ant-design/icons';
import {
  getMailList, toggleStar, trashMail, emptyTrash, getUnreadCount,
  getMailLabels, bulkMailAction, setMailLabels,
} from '../../api/mail';
import useAuthStore from '../../store/authStore';
import { CommandBar, DetailEmpty, AvatarListRow } from '../../components/listkit';
import { bodyPreview } from '../../utils/listkit';
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
    if (selectedId === id) setSelectedId(null);
    load();
  };

  const handleEmptyTrash = async () => {
    await emptyTrash();
    message.success('휴지통을 비웠습니다.');
    setSelectedId(null);
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
  const allSelected = mails.length > 0 && selectedKeys.length === mails.length;

  const toggleSelect = (id) => {
    setSelectedKeys(keys => keys.includes(id) ? keys.filter(k => k !== id) : [...keys, id]);
  };
  const toggleSelectAll = () => {
    setSelectedKeys(allSelected ? [] : mails.map(m => m.id));
  };

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

  const folderTitle = activeLabelId
    ? labels.find(l => l.id === activeLabelId)?.name
    : FOLDERS.find(f => f.key === folder)?.label;

  /* ── M365 스타일 목록 행 (listkit AvatarListRow 사용) ── */
  const renderRow = (row) => {
    // 표시 이름: 보낸편지함은 받는 사람, 그 외는 보낸 사람
    let name = '-';
    if (folder === 'sent') {
      const tos = row.recipients?.filter(r => r.type === 'to') || [];
      name = (tos[0]?.user?.displayName || '-') + (tos.length > 1 ? ` 외 ${tos.length - 1}` : '');
    } else {
      name = row.from?.displayName || '-';
    }
    const d = dayjs(row.createdAt);
    const timeStr = d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.isSame(dayjs(), 'year') ? d.format('MM.DD') : d.format('YY.MM.DD');
    const preview = bodyPreview(row.body);

    return (
      <AvatarListRow
        key={row.id}
        onClick={() => handleSelectMail(row)}
        active={row.id === selectedId}
        unread={!row.isRead}
        selectable={isRecipientFolder}
        selected={selectedKeys.includes(row.id)}
        onSelectToggle={() => toggleSelect(row.id)}
        name={name}
        time={timeStr}
        subject={row.subject || '(제목 없음)'}
        subjectPrefix={row.priority === 'urgent'
          ? <Tag color="red" style={{ fontSize: 13, margin: 0, padding: '0 4px', lineHeight: '16px', flexShrink: 0 }}>긴급</Tag>
          : null}
        subjectSuffix={row.attachments?.length > 0
          ? <PaperClipOutlined style={{ fontSize: 13, color: token.colorTextTertiary, flexShrink: 0 }} />
          : null}
        preview={preview || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>(내용 없음)</span>}
        labelDots={(row.labels || []).slice(0, 2).map(lb => lb.color)}
        actions={
          <>
            {folder !== 'sent' && folder !== 'drafts' && (
              <Tooltip title={row.isStarred ? '별표 해제' : '별표'}>
                <Button size="small" type="text" icon={row.isStarred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />} onClick={e => handleStar(e, row.id)} style={{ height: 22, width: 22, minWidth: 22 }} />
              </Tooltip>
            )}
            {folder !== 'trash' && folder !== 'drafts' && (
              <Tooltip title="휴지통">
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={e => handleTrash(e, row.id)} style={{ height: 22, width: 22, minWidth: 22 }} />
              </Tooltip>
            )}
          </>
        }
      />
    );
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', background: token.colorBgLayout }}>
      {/* ── 폴더 사이드바 ── */}
      <div style={{
        width: 200, background: token.colorBgContainer,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex', flexDirection: 'column', padding: '16px 0', flexShrink: 0, overflowY: 'auto',
      }}>
        <div style={{ padding: '0 12px 16px' }}>
          <Button type="primary" icon={<PlusOutlined />} block onClick={() => { setEditDraft(null); setComposeMode(null); setComposeOpen(true); }}>
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
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', cursor: 'pointer',
                background: active ? token.colorPrimaryBg : 'transparent',
                color: active ? token.colorPrimary : token.colorText,
                fontWeight: active ? 600 : 400, fontSize: 13, transition: 'all 0.14s',
                borderRight: active ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 15, color: active ? token.colorPrimary : token.colorTextSecondary }}>{f.icon}</span>
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.key === 'inbox' && unread > 0 && <Badge count={unread} size="small" style={{ backgroundColor: token.colorPrimary }} />}
            </div>
          );
        })}

        {/* 라벨 섹션 */}
        <div style={{ marginTop: 16, padding: '8px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>라벨</Text>
          <Tooltip title="라벨 관리">
            <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => setLabelMgrOpen(true)} style={{ height: 20, width: 20, minWidth: 20 }} />
          </Tooltip>
        </div>
        {labels.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 13, padding: '4px 16px' }}>
            <a onClick={() => setLabelMgrOpen(true)}>+ 라벨 추가</a>
          </Text>
        ) : labels.map(lb => {
          const active = activeLabelId === lb.id;
          return (
            <div
              key={lb.id}
              onClick={() => handleLabelClick(lb.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', cursor: 'pointer',
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

      {/* ── 메인 영역 (명령바 + 목록/읽기) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 명령바 */}
        <CommandBar
          left={
            <>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditDraft(null); setComposeMode(null); setComposeOpen(true); }}>
                새 메일
              </Button>
              <Button type="text" icon={<ReloadOutlined />} onClick={load} loading={loading}>새로고침</Button>
              {folder === 'trash' && mails.length > 0 && (
                <Popconfirm title="휴지통을 비우시겠습니까?" onConfirm={handleEmptyTrash} okText="비우기" cancelText="취소">
                  <Button danger type="text" icon={<DeleteOutlined />}>휴지통 비우기</Button>
                </Popconfirm>
              )}
            </>
          }
          right={
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onPressEnter={handleSearch}
              placeholder="제목·내용·보낸사람 검색"
              prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
              allowClear
              onClear={clearSearch}
              style={{ width: 260 }}
            />
          }
        />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* ── 목록 패널 ── */}
          <div style={{
            width: 380, borderRight: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex', flexDirection: 'column', background: token.colorBgContainer, flexShrink: 0, overflow: 'hidden',
          }}>
            {/* 목록 헤더 */}
            <div style={{
              padding: '10px 14px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {isRecipientFolder && mails.length > 0 && (
                <Checkbox checked={allSelected} indeterminate={selectedKeys.length > 0 && !allSelected} onChange={toggleSelectAll} />
              )}
              {activeLabelId
                ? <TagOutlined style={{ color: labels.find(l => l.id === activeLabelId)?.color }} />
                : <MailOutlined style={{ color: token.colorPrimary }} />}
              <Text strong style={{ fontSize: 13 }}>{folderTitle}</Text>
              {searchQuery && <Tag closable onClose={clearSearch} style={{ fontSize: 13 }}>"{searchQuery}"</Tag>}
              <div style={{ flex: 1 }} />
              {total > 0 && (
                folder === 'inbox' && !activeLabelId && !searchQuery && unread > 0
                  ? <Tag color="red" style={{ fontSize: 13, margin: 0, padding: '0 6px', lineHeight: '18px' }}>미열람 {unread}</Tag>
                  : <Text type="secondary" style={{ fontSize: 13 }}>{total}</Text>
              )}
            </div>

            {/* 일괄 처리 툴바 */}
            {selectedKeys.length > 0 && (
              <div style={{
                padding: '8px 14px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorPrimaryBg, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              }}>
                <Text strong style={{ fontSize: 13, color: token.colorPrimary }}>{selectedKeys.length}건</Text>
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
                <Button size="small" type="text" onClick={() => setSelectedKeys([])}>해제</Button>
              </div>
            )}

            {/* 목록 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><Spin /></div>
              ) : mails.length === 0 ? (
                <Empty description={searchQuery ? '검색 결과가 없습니다.' : '메일이 없습니다.'} style={{ marginTop: 60 }} />
              ) : (
                mails.map(renderRow)
              )}
            </div>

            {/* 페이지네이션 */}
            {total > 30 && (
              <div style={{ padding: '8px 14px', borderTop: `1px solid ${token.colorBorderSecondary}`, textAlign: 'center' }}>
                <Pagination current={page} pageSize={30} total={total} onChange={setPage} showSizeChanger={false} size="small" simple />
              </div>
            )}
          </div>

          {/* ── 읽기 패널 (상시 표시) ── */}
          <div style={{ flex: 1, overflow: 'hidden', background: token.colorBgContainer }}>
            {selectedId ? (
              <MailDetail
                mailId={selectedId}
                folder={folder}
                labels={labels}
                onBack={() => setSelectedId(null)}
                onRefresh={load}
                onLabelsChanged={loadLabels}
              />
            ) : (
              <DetailEmpty icon={<MailOutlined />} title="읽을 메일을 선택하세요" hint="왼쪽 목록에서 메일을 클릭하면 여기에 표시됩니다." />
            )}
          </div>
        </div>
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
