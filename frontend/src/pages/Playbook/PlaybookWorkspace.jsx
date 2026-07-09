import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Tooltip, Spin, message, Tag } from 'antd';
import ResizableDrawer from '../../components/common/ResizableDrawer';
import {
  PlusOutlined, BookOutlined, SearchOutlined, RightOutlined, DownOutlined,
  PlayCircleOutlined, EyeOutlined, EditOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import * as pbApi from '../../api/playbook';
import useAuthStore from '../../store/authStore';
import RunCreateModal from '../PlaybookRun/RunCreateModal';
import PlaybookListPage from './index';
import PlaybookEditor from './PlaybookEditor';

const RUN_STATUS = {
  active:   { label: '진행 중',  color: '#1677ff' },
  paused:   { label: '일시정지', color: '#faad14' },
  finished: { label: '완료',     color: '#52c41a' },
  archived: { label: '보관됨',   color: '#bfbfbf' },
};

export default function PlaybookWorkspace() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [expanded, setExpanded] = useState(new Set());
  const [runsMap, setRunsMap] = useState({});      // { [pbId]: runs[] }
  const [runsLoading, setRunsLoading] = useState(new Set());

  const [runModal, setRunModal] = useState({ open: false, playbookId: null });

  // 새 Playbook 드로어 + 우측 개요 새로고침 키
  const [editorDrawer, setEditorDrawer] = useState(false);
  const [listRefresh, setListRefresh] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      setPlaybooks(await pbApi.getPlaybooks({}));
    } catch {
      message.error('Playbook 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadRuns = async (pbId) => {
    setRunsLoading((prev) => new Set(prev).add(pbId));
    try {
      const runs = await pbApi.getRuns({ playbookId: pbId });
      setRunsMap((prev) => ({ ...prev, [pbId]: runs }));
    } catch {
      message.error('Run 목록을 불러오지 못했습니다.');
    } finally {
      setRunsLoading((prev) => { const n = new Set(prev); n.delete(pbId); return n; });
    }
  };

  const toggleExpand = (pbId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pbId)) {
        next.delete(pbId);
      } else {
        next.add(pbId);
        if (!runsMap[pbId]) loadRuns(pbId);
      }
      return next;
    });
  };

  const openRunModal = (e, pbId) => {
    e?.stopPropagation?.();
    setRunModal({ open: true, playbookId: pbId });
  };

  const filtered = playbooks.filter((pb) => !search || pb.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--fd-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--fd-border)' }}>
      {/* ── 좌측 트리: 플레이북 → Run ── */}
      <div style={{ width: 290, flexShrink: 0, borderRight: '1px solid var(--fd-border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700 }}>
              <BookOutlined /> Playbook
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              <Tooltip title="전체 Run 목록 · 통계">
                <Button type="text" size="small" icon={<UnorderedListOutlined style={{ fontSize: 17 }} />} onClick={() => navigate('/runs')} />
              </Tooltip>
              <Tooltip title="새 Playbook">
                <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 18 }} />} onClick={() => setEditorDrawer(true)} />
              </Tooltip>
            </div>
          </div>
          <Input
            size="small"
            placeholder="Playbook 검색..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {loading ? (
            <Spin style={{ display: 'block', margin: '40px auto' }} />
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 13 }}>
              <BookOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
              Playbook이 없습니다.<br />새로 만들어 보세요.
            </div>
          ) : (
            filtered.map((pb) => {
              const isOpen = expanded.has(pb.id);
              const runs = runsMap[pb.id] || [];
              const isRunsLoading = runsLoading.has(pb.id);
              const runCount = pb._count?.runs ?? 0;
              const canEdit = isAdmin || pb.createdBy === user?.id;

              return (
                <div key={pb.id} style={{ marginBottom: 2 }}>
                  {/* 플레이북(카테고리) 헤더 */}
                  <div
                    className="fd-pb-row"
                    onClick={() => toggleExpand(pb.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      padding: '6px 8px', borderRadius: 6, userSelect: 'none',
                    }}
                  >
                    {isOpen ? <DownOutlined style={{ fontSize: 12, color: '#8c8c8c' }} /> : <RightOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />}
                    <BookOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--fd-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pb.name}>
                      {pb.name}
                    </span>
                    <span style={{ fontSize: 12, color: '#bfbfbf' }}>{runCount}</span>
                    <span className="fd-pb-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="새 Run 시작">
                        <PlayCircleOutlined style={{ color: '#52c41a', fontSize: 15 }} onClick={(e) => openRunModal(e, pb.id)} />
                      </Tooltip>
                      <Tooltip title="보기">
                        <EyeOutlined style={{ color: '#8c8c8c', fontSize: 14 }} onClick={() => navigate(`/playbooks/${pb.id}`)} />
                      </Tooltip>
                      {canEdit && (
                        <Tooltip title="편집">
                          <EditOutlined style={{ color: '#8c8c8c', fontSize: 14 }} onClick={() => navigate(`/playbooks/${pb.id}/edit`)} />
                        </Tooltip>
                      )}
                    </span>
                  </div>

                  {/* 하위: Run 목록 */}
                  {isOpen && (
                    <div style={{ paddingLeft: 8 }}>
                      {isRunsLoading ? (
                        <div style={{ padding: '6px 0 6px 26px' }}><Spin size="small" /></div>
                      ) : (
                        <>
                          {runs.length === 0 ? (
                            <div style={{ padding: '4px 8px 4px 30px', fontSize: 13, color: '#bfbfbf' }}>Run 없음</div>
                          ) : runs.map((run) => {
                            const st = RUN_STATUS[run.status] || RUN_STATUS.active;
                            return (
                              <div
                                key={run.id}
                                className="fd-run-row"
                                onClick={() => navigate(`/runs/${run.id}`)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                                  padding: '5px 8px 5px 30px', borderRadius: 6, fontSize: 13,
                                }}
                              >
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fd-text-primary)' }} title={run.name}>
                                  {run.name}
                                </span>
                                <Tag color={st.color === '#bfbfbf' ? 'default' : undefined} style={{ fontSize: 10, margin: 0, padding: '0 6px', lineHeight: '16px', color: st.color, borderColor: st.color, background: 'transparent' }}>
                                  {st.label}
                                </Tag>
                              </div>
                            );
                          })}
                          {/* 새 Run 추가 */}
                          <div
                            className="fd-run-row"
                            onClick={(e) => openRunModal(e, pb.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                              padding: '5px 8px 5px 30px', borderRadius: 6, fontSize: 13, color: '#52c41a',
                            }}
                          >
                            <PlusOutlined style={{ fontSize: 11 }} /> 새 Run
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── 우측: 플레이북 개요 (카드) ── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
        <PlaybookListPage key={listRefresh} onNew={() => setEditorDrawer(true)} />
      </div>

      {/* ── 새 Run 모달 ── */}
      <RunCreateModal
        open={runModal.open}
        onClose={() => setRunModal({ open: false, playbookId: null })}
        onCreated={(run) => { setRunModal({ open: false, playbookId: null }); navigate(`/runs/${run.id}`); }}
        defaultPlaybookId={runModal.playbookId}
      />

      {/* ── 새 Playbook 드로어 (오른쪽 슬라이드) ── */}
      <ResizableDrawer
        title={null}
        open={editorDrawer}
        onClose={() => setEditorDrawer(false)}
        placement="right"
        width={920}
        destroyOnClose
        styles={{ body: { padding: 20 } }}
      >
        <PlaybookEditor
          embedded
          embeddedId="new"
          onClose={() => setEditorDrawer(false)}
          onSaved={() => { load(); setListRefresh((v) => v + 1); }}
        />
      </ResizableDrawer>

      <style>{`
        .fd-pb-row .fd-pb-actions { opacity: 0; transition: opacity .12s; }
        .fd-pb-row:hover .fd-pb-actions { opacity: 1; }
        .fd-pb-row:hover, .fd-run-row:hover { background: #f5f7fa; }
      `}</style>
    </div>
  );
}
