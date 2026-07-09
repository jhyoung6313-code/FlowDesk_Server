import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Card, Tag, Space, Typography, Spin, Tabs, Timeline,
  Avatar, Tooltip, Input, message, Descriptions, Popconfirm,
  Divider, Empty, Select, Progress, Badge, Modal, Alert, Dropdown,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleFilled, PlayCircleOutlined,
  PauseCircleFilled, UserAddOutlined, SendOutlined,
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  BranchesOutlined, LikeOutlined, InfoCircleOutlined,
  CheckSquareOutlined, WarningOutlined, InboxOutlined,
  FilePdfOutlined, DeleteOutlined, PlusOutlined as PlusOutlinedIcon,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as pbApi from '../../api/playbook';
import { getUsers } from '../../api/users';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';
import useAuthStore from '../../store/authStore';
import { exportRunReportPdf } from '../../utils/pdf';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ── 상수 ──────────────────────────────────────────────────────

const SEVERITY_MAP = {
  p1:   { label: 'P1 긴급', color: 'red'     },
  p2:   { label: 'P2 높음', color: 'orange'  },
  p3:   { label: 'P3 보통', color: 'blue'    },
  none: { label: null,       color: 'default' },
};

const STATUS_MAP = {
  active:   { label: '진행 중', color: 'processing' },
  paused:   { label: '일시정지', color: 'warning'   },
  finished: { label: '완료',    color: 'success'   },
  archived: { label: '보관됨',  color: 'default'   },
};

const STEP_STATUS_MAP = {
  pending:     { label: '대기',    color: '#d9d9d9', dot: null              },
  in_progress: { label: '진행 중', color: '#1677ff', dot: <PlayCircleOutlined style={{ color: '#1677ff' }} /> },
  done:        { label: '완료',    color: '#52c41a', dot: <CheckCircleFilled style={{ color: '#52c41a' }} /> },
  skipped:     { label: '건너뜀', color: '#faad14', dot: <CloseCircleOutlined style={{ color: '#faad14' }} /> },
  blocked:     { label: '차단됨', color: '#ff4d4f', dot: <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> },
  rejected:    { label: '거절됨', color: '#ff4d4f', dot: <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> },
};

const STEP_TYPE_ICON = {
  task:     <CheckSquareOutlined />,
  approval: <LikeOutlined />,
  note:     <InfoCircleOutlined />,
  decision: <BranchesOutlined />,
};

const TIMELINE_LABELS = {
  run_started:       'Run 시작',
  run_finished:      'Run 완료',
  run_paused:        'Run 일시정지',
  run_resumed:       'Run 재개',
  run_archived:      'Run 보관',
  run_auto_finished: 'Run 자동 완료',
  participant_added: '참여자 추가',
  participant_removed: '참여자 제거',
};

// ── SLA 경고 계산 ─────────────────────────────────────────────

function useSlaWarning(step) {
  if (!step.slaMins || !step.startedAt) return null;
  const elapsed = dayjs().diff(dayjs(step.startedAt), 'minute');
  if (elapsed >= step.slaMins) return `SLA 초과 (${elapsed}분 경과)`;
  const remaining = step.slaMins - elapsed;
  if (remaining <= 5) return `SLA ${remaining}분 남음`;
  return null;
}

// ── StepCard ──────────────────────────────────────────────────

function StepCard({ step, runStatus, users, onAction, runId, onUpdate }) {
  const [evidenceInput, setEvidenceInput] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [checklists, setChecklists] = useState([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [showChecklist, setShowChecklist] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(step.title);
  const [instrInput, setInstrInput] = useState(step.instructions || '');
  const slaWarn = useSlaWarning(step);

  useEffect(() => {
    setTitleInput(step.title);
    setInstrInput(step.instructions || '');
  }, [step.id, step.title, step.instructions]);

  const handleTitleSave = async () => {
    setEditingTitle(false);
    const newTitle = titleInput.trim();
    if (!newTitle || newTitle === step.title) return;
    try { await pbApi.updateStep(runId, step.id, { title: newTitle }); onUpdate?.(); }
    catch { message.error('제목 저장 실패'); setTitleInput(step.title); }
  };

  const handleInstrSave = async () => {
    if (instrInput === (step.instructions || '')) return;
    try { await pbApi.updateStep(runId, step.id, { instructions: instrInput }); onUpdate?.(); }
    catch { message.error('내용 저장 실패'); setInstrInput(step.instructions || ''); }
  };
  const sm = STEP_STATUS_MAP[step.status] || STEP_STATUS_MAP.pending;
  const isActive = runStatus === 'active';
  const isDone = ['done', 'skipped', 'rejected'].includes(step.status);

  const loadChecklists = async () => {
    try { setChecklists(await pbApi.getChecklists(runId, step.id)); } catch { /* ignore */ }
  };

  useEffect(() => { if (showChecklist) loadChecklists(); }, [showChecklist]);

  const handleCheckToggle = async (item) => {
    try {
      const updated = await pbApi.updateChecklist(runId, step.id, item.id, { checked: !item.checked });
      setChecklists((prev) => prev.map((c) => c.id === item.id ? updated : c));
    } catch { message.error('체크 실패'); }
  };

  const handleAddChecklistItem = async () => {
    if (!checklistInput.trim()) return;
    try {
      const item = await pbApi.addChecklist(runId, step.id, { content: checklistInput });
      setChecklists((prev) => [...prev, item]);
      setChecklistInput('');
    } catch { message.error('추가 실패'); }
  };

  const handleDeleteChecklistItem = async (id) => {
    try {
      await pbApi.deleteChecklist(runId, step.id, id);
      setChecklists((prev) => prev.filter((c) => c.id !== id));
    } catch { message.error('삭제 실패'); }
  };

  const handleAction = async (status, extra = {}) => {
    setActionLoading(true);
    try {
      await onAction(step.id, { status, ...extra });
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (step.requireEvidence && !evidenceInput.trim()) {
      setShowEvidence(true);
      return;
    }
    await handleAction('done', evidenceInput ? { evidence: evidenceInput } : {});
    setShowEvidence(false);
    setEvidenceInput('');
  };

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        borderLeft: `4px solid ${sm.color}`,
        opacity: isDone ? 0.75 : 1,
      }}
      bodyStyle={{ padding: '10px 14px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* 유형 아이콘 */}
        <Tooltip title={step.type}>
          <span style={{ fontSize: 14, color: '#888', marginTop: 1 }}>{STEP_TYPE_ICON[step.type]}</span>
        </Tooltip>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 제목 + 상태 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            {editingTitle ? (
              <Input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSave}
                onPressEnter={handleTitleSave}
                size="small"
                autoFocus
                style={{ flex: 1 }}
              />
            ) : (
              <Text
                strong
                delete={isDone}
                style={{ fontSize: 15, flex: 1, cursor: isActive && !isDone ? 'text' : 'default' }}
                onDoubleClick={() => isActive && !isDone && setEditingTitle(true)}
                title={isActive && !isDone ? '더블클릭하여 제목 편집' : undefined}
              >
                {step.title || '(제목 없음)'}
              </Text>
            )}
            <Space size={4}>
              {isActive ? (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    selectedKeys: [step.status],
                    items: ['pending', 'in_progress', 'done', 'skipped'].map((k) => ({
                      key: k,
                      label: STEP_STATUS_MAP[k].label,
                    })),
                    onClick: ({ key }) => { if (key !== step.status) handleAction(key); },
                  }}
                >
                  <Tag color={sm.color} style={{ fontSize: 11, margin: 0, cursor: 'pointer' }}>
                    {sm.label} ▾
                  </Tag>
                </Dropdown>
              ) : (
                <Tag color={sm.color} style={{ fontSize: 11, margin: 0 }}>{sm.label}</Tag>
              )}
              {step.assignee && (
                <Tooltip title={step.assignee.displayName}>
                  <Avatar size="small" style={{ backgroundColor: step.assignee.avatarColor || '#1677ff', fontSize: 10 }}>
                    {step.assignee.displayName?.slice(0, 1)}
                  </Avatar>
                </Tooltip>
              )}
              {step.dueAt && (
                <Tag icon={<ClockCircleOutlined />} color="orange" style={{ fontSize: 11, margin: 0 }}>
                  {dayjs(step.dueAt).format('MM/DD HH:mm')}
                </Tag>
              )}
              {isActive && (
                <Popconfirm title="이 항목을 삭제하시겠습니까?" okText="삭제" cancelText="취소"
                  onConfirm={async () => {
                    try { await pbApi.deleteRunStep(runId, step.id); onUpdate?.(); }
                    catch { message.error('삭제 실패'); }
                  }}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} style={{ padding: '0 2px' }} />
                </Popconfirm>
              )}
            </Space>
          </div>

          {/* SLA 경고 */}
          {slaWarn && (
            <Alert message={slaWarn} type="warning" showIcon banner style={{ marginTop: 4, fontSize: 11 }} />
          )}

          {/* 지침 */}
          {/* 상세 내용 */}
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>상세 내용</Text>
            {isActive ? (
              <TextArea
                value={instrInput}
                onChange={(e) => setInstrInput(e.target.value)}
                onBlur={handleInstrSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleInstrSave();
                  }
                }}
                autoSize={{ minRows: 2, maxRows: 6 }}
                size="small"
                placeholder="상세 내용을 입력하세요 (Enter=저장, Shift+Enter=줄바꿈)"
              />
            ) : step.instructions ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', whiteSpace: 'pre-wrap' }}>
                {step.instructions}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12, color: '#bbb' }}>-</Text>
            )}
          </div>

          {/* 완료 증거 */}
          {step.evidence && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: '#f6ffed', borderRadius: 4 }}>
              <Text style={{ fontSize: 12 }}>
                <CheckCircleFilled style={{ color: '#52c41a', marginRight: 4 }} />
                {step.evidence}
              </Text>
            </div>
          )}

          {/* 완료자 정보 */}
          {isDone && step.completer && (
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              {step.completer.displayName} · {dayjs(step.completedAt).format('MM/DD HH:mm')}
            </Text>
          )}

          {/* Evidence 입력 폼 */}
          {showEvidence && (
            <div style={{ marginTop: 8 }}>
              <TextArea
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
                placeholder="완료 증거 또는 결과를 입력하세요 (필수)..."
                rows={2}
                size="small"
              />
            </div>
          )}

          {/* 액션 버튼 (task 유형은 시작/완료/건너뜀 미사용) */}
          {isActive && !isDone && step.type !== 'task' && (
            <div style={{ marginTop: 8 }}>
              <Space size={4} wrap>
                {step.status === 'pending' && (
                  <Button size="small" type="primary" onClick={() => handleAction('in_progress')} loading={actionLoading}
                    style={{ fontSize: 11, padding: '0 6px', height: 20, color: '#fff' }}>
                    시작
                  </Button>
                )}
                {(step.status === 'in_progress' || step.status === 'pending') && (
                  <>
                    {step.type === 'approval' ? (
                      <>
                        <Button size="small" type="primary" onClick={() => handleAction('done')} loading={actionLoading}>
                          승인
                        </Button>
                        <Button size="small" danger onClick={() => handleAction('rejected')} loading={actionLoading}>
                          거절
                        </Button>
                      </>
                    ) : step.type === 'note' ? (
                      <Button size="small" type="primary" onClick={() => handleAction('done')} loading={actionLoading}>
                        확인
                      </Button>
                    ) : step.type === 'decision' ? (
                      (() => {
                        let opts = [];
                        try {
                          if (step.step?.decisionOptions) {
                            const parsed = JSON.parse(step.step.decisionOptions);
                            if (Array.isArray(parsed)) {
                              opts = parsed.map((o) => (typeof o === 'string' ? { label: o, nextStepOrder: null } : o));
                            }
                          }
                        } catch { /* 파싱 오류 무시 */ }
                        return opts.length ? opts.map((opt) => (
                          <Button
                            key={opt.label}
                            size="small"
                            onClick={() => handleAction('done', { decisionChosen: opt.label })}
                            loading={actionLoading}
                          >
                            {opt.label}
                          </Button>
                        )) : (
                          <Button size="small" type="primary" onClick={() => handleAction('done')} loading={actionLoading}>완료</Button>
                        );
                      })()
                    ) : (
                      <Button size="small" type="primary" onClick={handleComplete} loading={actionLoading}
                        style={{ fontSize: 11, padding: '0 6px', height: 20 }}>
                        {step.requireEvidence && !showEvidence ? '완료 (증거 필요)' : '완료'}
                      </Button>
                    )}
                    {showEvidence && (
                      <Button size="small" onClick={handleComplete} loading={actionLoading}
                        style={{ fontSize: 11, padding: '0 6px', height: 20 }}>
                        제출
                      </Button>
                    )}
                    <Button size="small" onClick={() => handleAction('skipped')} loading={actionLoading}
                      style={{ fontSize: 11, padding: '0 6px', height: 20 }}>
                      건너뜀
                    </Button>
                  </>
                )}
                {step.status === 'done' || step.status === 'skipped' ? null : null}
              </Space>
            </div>
          )}

          {/* 분기 선택 결과 */}
          {step.decisionChosen && (
            <Tag color="purple" style={{ marginTop: 4, fontSize: 11 }}>선택: {step.decisionChosen}</Tag>
          )}

          {/* 체크리스트 토글 */}
          <div style={{ marginTop: 8 }}>
            <Button
              type="text"
              size="small"
              icon={<CheckSquareOutlined />}
              style={{ fontSize: 11, color: '#888', padding: 0 }}
              onClick={() => setShowChecklist((v) => !v)}
            >
              체크리스트 {showChecklist ? '▲' : '▼'}
            </Button>
          </div>

          {/* 체크리스트 패널 */}
          {showChecklist && (
            <div style={{ marginTop: 6, paddingLeft: 4 }}>
              {checklists.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => handleCheckToggle(item)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, fontSize: 12, textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? '#aaa' : 'inherit' }}>
                    {item.content}
                  </span>
                  {isActive && (
                    <Button type="text" size="small" danger onClick={() => handleDeleteChecklistItem(item.id)} style={{ padding: 0, fontSize: 11 }}>✕</Button>
                  )}
                </div>
              ))}
              {isActive && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <Input
                    value={checklistInput}
                    onChange={(e) => setChecklistInput(e.target.value)}
                    onPressEnter={handleAddChecklistItem}
                    placeholder="새 항목 추가..."
                    size="small"
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <Button size="small" onClick={handleAddChecklistItem}>추가</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── StepGroup (병렬 레인 지원) ────────────────────────────────

function StepGroup({ steps, runStatus, allUsers, handleStepAction, runId, onUpdate }) {
  const result = [];
  const visited = new Set();

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (visited.has(s.id)) continue;
    if (!s.parallelGroup) {
      result.push(
        <StepCard key={s.id} step={s} runStatus={runStatus} users={allUsers} onAction={handleStepAction} runId={runId} onUpdate={onUpdate} />
      );
    } else {
      const group = steps.filter((x) => x.parallelGroup === s.parallelGroup);
      group.forEach((x) => visited.add(x.id));
      result.push(
        <div key={`pg-${s.parallelGroup}-${i}`} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4, paddingLeft: 4 }}>
            ⊞ 병렬 그룹 {s.parallelGroup}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {group.map((x) => (
              <div key={x.id} style={{ flex: 1, minWidth: 240 }}>
                <StepCard step={x} runStatus={runStatus} users={allUsers} onAction={handleStepAction} runId={runId} onUpdate={onUpdate} />
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  return <>{result}</>;
}

// ── PhaseProgress ─────────────────────────────────────────────

function PhaseProgress({ phases, steps }) {
  if (!phases?.length) return null;

  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 6, overflow: 'hidden' }}>
      {phases.map((ph, i) => {
        const phSteps = steps.filter((s) => s.phaseId === ph.id);
        const done = phSteps.filter((s) => ['done', 'skipped', 'rejected'].includes(s.status)).length;
        const allDone = phSteps.length > 0 && done === phSteps.length;
        const inProg = phSteps.some((s) => s.status === 'in_progress');

        return (
          <Tooltip
            key={ph.id}
            title={`${ph.name} (${done}/${phSteps.length})`}
          >
            <div
              style={{
                flex: 1,
                padding: '6px 4px',
                textAlign: 'center',
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: allDone ? ph.color : inProg ? `${ph.color}44` : '#f5f5f5',
                color: allDone ? '#fff' : inProg ? ph.color : '#aaa',
                borderRight: i < phases.length - 1 ? '2px solid #fff' : 'none',
                transition: 'all 0.3s',
                cursor: 'default',
              }}
            >
              {ph.name}
              {allDone && <CheckCircleFilled style={{ marginLeft: 4 }} />}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ── UpdatesTab ────────────────────────────────────────────────

function UpdatesTab({ run, onRefresh }) {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isActive = run.status === 'active';

  const handleSend = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await pbApi.addUpdate(run.id, { message: msg });
      setMsg('');
      onRefresh();
    } catch {
      message.error('전송 실패');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (updateId) => {
    try {
      await pbApi.deleteUpdate(run.id, updateId);
      onRefresh();
    } catch {
      message.error('삭제 실패');
    }
  };

  return (
    <div>
      {isActive && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TextArea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="현재 상황을 업데이트하세요..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            style={{ flex: 1 }}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sending} style={{ alignSelf: 'flex-end' }}>
            전송
          </Button>
        </div>
      )}

      {!run.updates?.length ? (
        <Empty description="업데이트가 없습니다." />
      ) : (
        run.updates.map((u) => (
          <Card key={u.id} size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Avatar size="small" style={{ backgroundColor: u.creator?.avatarColor || '#1677ff', fontSize: 11, flexShrink: 0 }}>
                {u.creator?.displayName?.slice(0, 1)}
              </Avatar>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <Space size={4}>
                    <Text strong style={{ fontSize: 12 }}>{u.creator?.displayName}</Text>
                    {u.type === 'alert' && <Tag color="red" style={{ fontSize: 10 }}>경고</Tag>}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {dayjs(u.createdAt).format('MM/DD HH:mm')}
                  </Text>
                </div>
                <Text style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{u.message}</Text>
              </div>
              {(user?.role === 'admin' || u.createdBy === user?.id) && (
                <Popconfirm title="삭제?" onConfirm={() => handleDelete(u.id)}>
                  <Button type="text" size="small" danger style={{ fontSize: 11 }}>삭제</Button>
                </Popconfirm>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ── ParticipantsTab ───────────────────────────────────────────

function ParticipantsTab({ run, allUsers, onRefresh }) {
  const user = useAuthStore((s) => s.user);
  const [addUserId, setAddUserId] = useState(null);
  const isActive = run.status === 'active';
  const canManage = user?.role === 'admin' || run.ownerId === user?.id;

  const existingIds = new Set(run.participants?.map((p) => p.userId));
  const addableUsers = allUsers.filter((u) => !existingIds.has(u.id));

  const handleAdd = async () => {
    if (!addUserId) return;
    try {
      await pbApi.addParticipant(run.id, { userId: addUserId });
      setAddUserId(null);
      onRefresh();
    } catch {
      message.error('추가 실패');
    }
  };

  const handleRemove = async (uid) => {
    try {
      await pbApi.removeParticipant(run.id, uid);
      onRefresh();
    } catch {
      message.error('제거 실패');
    }
  };

  const ROLE_COLORS = { owner: 'gold', coordinator: 'cyan', participant: 'default' };
  const ROLE_LABELS = { owner: 'Owner', coordinator: '코디네이터', participant: '참여자' };

  return (
    <div>
      {isActive && canManage && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Select
            value={addUserId}
            onChange={setAddUserId}
            placeholder="팀원 선택 (이름·부서 검색)"
            style={{ flex: 1 }}
            showSearch
            filterOption={filterUserOption}
            options={buildUserOptions(addableUsers, getMyDepartment())}
          />
          <Button icon={<UserAddOutlined />} onClick={handleAdd} disabled={!addUserId}>추가</Button>
        </div>
      )}

      {!run.participants?.length ? (
        <Empty description="참여자가 없습니다." />
      ) : (
        run.participants.map((p) => (
          <Card key={p.id} size="small" style={{ marginBottom: 8 }} bodyStyle={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Avatar size="small" style={{ backgroundColor: p.user?.avatarColor || '#1677ff', fontSize: 11 }}>
                  {p.user?.displayName?.slice(0, 1)}
                </Avatar>
                <Text>{p.user?.displayName}</Text>
                <Tag color={ROLE_COLORS[p.role] || 'default'} style={{ fontSize: 11 }}>
                  {ROLE_LABELS[p.role] || p.role}
                </Tag>
              </Space>
              {isActive && canManage && p.role !== 'owner' && (
                <Popconfirm title="참여자를 제거하시겠습니까?" onConfirm={() => handleRemove(p.userId)}>
                  <Button size="small" danger>제거</Button>
                </Popconfirm>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ── TimelineTab ───────────────────────────────────────────────

function TimelineTab({ run }) {
  return !run.timeline?.length ? (
    <Empty description="이벤트가 없습니다." />
  ) : (
    <Timeline
      items={run.timeline.map((t) => {
        let label = TIMELINE_LABELS[t.eventType];
        if (!label) {
          if (t.eventType.startsWith('step_')) {
            const s = t.eventType.replace('step_', '');
            const stepStatus = STEP_STATUS_MAP[s];
            label = stepStatus ? `단계 ${stepStatus.label}` : t.eventType;
          } else {
            label = t.eventType;
          }
        }
        let extra = null;
        try {
          if (t.eventData) {
            const d = JSON.parse(t.eventData);
            extra = d.stepTitle || d.message || null;
          }
        } catch { /* ignore */ }

        return {
          color: 'blue',
          children: (
            <div>
              <Text strong style={{ fontSize: 12 }}>{label}</Text>
              {extra && <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>— {extra}</Text>}
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t.creator?.displayName && `${t.creator.displayName} · `}
                  {dayjs(t.createdAt).format('MM/DD HH:mm')}
                </Text>
              </div>
            </div>
          ),
        };
      })}
    />
  );
}

// ── Main ──────────────────────────────────────────────────────

export default function RunDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishSummary, setFinishSummary] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryInput, setSummaryInput] = useState('');
  const [addingStep, setAddingStep] = useState(null);
  const socketRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await pbApi.getRun(id);
      setRun(data);
      setSummaryInput(data.summary || '');
    } catch {
      message.error('Run을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleSummarySave = async () => {
    setEditingSummary(false);
    try { await pbApi.updateRun(id, { summary: summaryInput }); load(); }
    catch { message.error('요약 저장 실패'); }
  };

  const handleAddStep = async () => {
    if (!addingStep) return;
    const title = addingStep.title.trim();
    setAddingStep(null);
    if (!title) return;
    try { await pbApi.addRunStep(run.id, { title, phaseId: addingStep.phaseId ?? null }); load(); }
    catch { message.error('항목 추가 실패'); }
  };

  // Socket.IO 실시간 협업
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !id) return;

    const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.emit('join-run', id);

    socket.on('run-step-updated', () => load());
    socket.on('run-status-changed', () => load());

    return () => {
      socket.emit('leave-run', id);
      socket.disconnect();
    };
  }, [id]);

  useEffect(() => {
    load();
    getUsers().then((u) => setAllUsers(u.filter((x) => x.isActive)));
  }, [load]);

  const handleFinish = async () => {
    setActionLoading(true);
    try {
      await pbApi.finishRun(id, { summary: finishSummary });
      message.success('Run이 완료되었습니다.');
      setFinishModalOpen(false);
      load();
    } catch {
      message.error('오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      if (run.status === 'paused') {
        await pbApi.resumeRun(id);
        message.success('재개되었습니다.');
      } else {
        await pbApi.pauseRun(id);
        message.success('일시정지되었습니다.');
      }
      load();
    } catch {
      message.error('오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    try {
      await pbApi.archiveRun(id);
      message.success('보관 처리되었습니다.');
      load();
    } catch {
      message.error('오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStepAction = async (stepId, data) => {
    try {
      await pbApi.updateStep(id, stepId, data);
      load();
    } catch {
      message.error('처리 실패');
    }
  };

  const handleExportPdf = () => exportRunReportPdf(run);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  if (!run) return null;

  const totalSteps = run.steps?.length || 0;
  const doneSteps = run.steps?.filter((s) => ['done', 'skipped', 'rejected'].includes(s.status)).length || 0;
  const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const severity = SEVERITY_MAP[run.severity] || SEVERITY_MAP.none;
  const runStatus = STATUS_MAP[run.status] || STATUS_MAP.active;

  // 페이즈 정보: playbook.phases 사용
  const phases = run.playbook?.phases || [];
  const phaseMap = Object.fromEntries(phases.map((p) => [p.id, p]));

  // 스텝을 phaseId 기준으로 그룹화
  const stepsWithPhase = run.steps?.filter((s) => s.phaseId) || [];
  const stepsWithoutPhase = run.steps?.filter((s) => !s.phaseId) || [];

  const tabItems = [
    {
      key: 'steps',
      label: (
        <span>
          단계 <Badge count={`${doneSteps}/${totalSteps}`} style={{ backgroundColor: pct === 100 ? '#52c41a' : '#1677ff' }} />
        </span>
      ),
      children: (
        <div>
          {/* 페이즈별 그룹 */}
          {phases.map((ph) => {
            const pSteps = stepsWithPhase.filter((s) => s.phaseId === ph.id);
            const isAddingHere = addingStep?.phaseId === ph.id;
            return (
              <div key={ph.id}>
                <Divider orientation="left" orientationMargin={0} style={{ fontSize: 19.5, margin: '12px 0 8px' }}>
                  <span style={{ color: ph.color || '#1677ff' }}>■</span>{' '}
                  {ph.name}
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#aaa', fontWeight: 400 }}>
                    {pSteps.filter((s) => ['done','skipped','rejected'].includes(s.status)).length}/{pSteps.length} 완료
                  </span>
                </Divider>
                {pSteps.length > 0 && (
                  <StepGroup steps={pSteps} runStatus={run.status} allUsers={allUsers} handleStepAction={handleStepAction} runId={run.id} onUpdate={load} />
                )}
                {run.status === 'active' && (
                  isAddingHere ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <TextArea
                        placeholder="새 항목 제목 (Enter=추가, Shift+Enter=줄바꿈)"
                        size="small"
                        autoFocus
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        value={addingStep.title}
                        onChange={(e) => setAddingStep((p) => ({ ...p, title: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddStep();
                          }
                        }}
                        onBlur={() => { if (!addingStep.title.trim()) setAddingStep(null); }}
                        style={{ flex: 1 }}
                      />
                      <Button size="small" type="primary" onClick={handleAddStep}>추가</Button>
                      <Button size="small" onClick={() => setAddingStep(null)}>취소</Button>
                    </div>
                  ) : (
                    <Button
                      type="dashed"
                      size="small"
                      icon={<PlusOutlinedIcon />}
                      onClick={() => setAddingStep({ phaseId: ph.id, title: '' })}
                      style={{ width: '100%', marginTop: 4, color: '#aaa', borderColor: 'var(--fd-border)' }}
                    >
                      할 일 추가
                    </Button>
                  )
                )}
              </div>
            );
          })}

          {/* 페이즈 미지정 스텝 */}
          {(stepsWithoutPhase.length > 0 || (run.status === 'active' && addingStep?.phaseId === null)) && (
            <>
              {phases.length > 0 && <Divider orientation="left" style={{ fontSize: 13 }}>기타 항목</Divider>}
              {stepsWithoutPhase.length > 0 && (
                <StepGroup steps={stepsWithoutPhase} runStatus={run.status} allUsers={allUsers} handleStepAction={handleStepAction} runId={run.id} onUpdate={load} />
              )}
            </>
          )}

          {/* 임시 항목 추가 (페이즈 없음) */}
          {run.status === 'active' && (
            addingStep?.phaseId === null ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <Input
                  placeholder="새 항목 제목 입력 후 Enter..."
                  size="small"
                  autoFocus
                  value={addingStep.title}
                  onChange={(e) => setAddingStep((p) => ({ ...p, title: e.target.value }))}
                  onPressEnter={handleAddStep}
                  onBlur={() => { if (!addingStep.title.trim()) setAddingStep(null); }}
                  style={{ flex: 1 }}
                />
                <Button size="small" type="primary" onClick={handleAddStep}>추가</Button>
                <Button size="small" onClick={() => setAddingStep(null)}>취소</Button>
              </div>
            ) : (
              <Button
                type="dashed"
                icon={<PlusOutlinedIcon />}
                onClick={() => setAddingStep({ phaseId: null, title: '' })}
                style={{ width: '100%', marginTop: 8 }}
              >
                임시 항목 추가
              </Button>
            )
          )}

          {totalSteps === 0 && !addingStep && <Empty description="단계가 없습니다." />}
        </div>
      ),
    },
    {
      key: 'updates',
      label: `업데이트 (${run.updates?.length || 0})`,
      children: <UpdatesTab run={run} onRefresh={load} />,
    },
    {
      key: 'participants',
      label: `참여자 (${run.participants?.length || 0})`,
      children: <ParticipantsTab run={run} allUsers={allUsers} onRefresh={load} />,
    },
    {
      key: 'timeline',
      label: `타임라인 (${run.timeline?.length || 0})`,
      children: <TimelineTab run={run} />,
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/runs')} style={{ marginBottom: 16 }}>
        목록으로
      </Button>

      {/* 헤더 카드 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <Space style={{ marginBottom: 6 }} wrap>
              {severity.label && <Tag color={severity.color}>{severity.label}</Tag>}
              <Badge status={runStatus.color} text={runStatus.label} />
              {run.playbook && <Tag>{run.playbook.name}</Tag>}
            </Space>
            <Title level={4} style={{ margin: 0 }}>{run.name}</Title>
            {editingSummary ? (
              <TextArea
                value={summaryInput}
                onChange={(e) => setSummaryInput(e.target.value)}
                onBlur={handleSummarySave}
                rows={4}
                size="small"
                autoFocus
                style={{ marginTop: 6 }}
              />
            ) : (
              <div
                onClick={() => { setSummaryInput(run.summary || ''); setEditingSummary(true); }}
                style={{ marginTop: 4, cursor: 'pointer', borderRadius: 4, padding: '2px 4px' }}
                title="클릭하여 요약 편집"
              >
                {run.summary ? (
                  <Text type="secondary" style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{run.summary}</Text>
                ) : (
                  <Text type="secondary" style={{ color: '#bbb' }}>요약 추가... (클릭)</Text>
                )}
              </div>
            )}
          </div>

          <Space wrap>
            <Button icon={<FilePdfOutlined />} onClick={handleExportPdf}>PDF</Button>
            {(run.status === 'active' || run.status === 'paused') && (
              <Button
                icon={run.status === 'paused' ? <PlayCircleOutlined /> : <PauseCircleFilled />}
                onClick={handlePause}
                loading={actionLoading}
              >
                {run.status === 'paused' ? '재개' : '일시정지'}
              </Button>
            )}
            {run.status === 'active' && (
              <Popconfirm title="Run을 완료 처리하시겠습니까?" onConfirm={() => setFinishModalOpen(true)}>
                <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading}>
                  완료
                </Button>
              </Popconfirm>
            )}
            {run.status === 'finished' && (
              <Popconfirm title="보관 처리하시겠습니까?" onConfirm={handleArchive}>
                <Button icon={<InboxOutlined />} loading={actionLoading}>보관</Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Owner">
            {run.owner && (
              <Space size={4}>
                <Avatar size="small" style={{ backgroundColor: run.owner.avatarColor || '#1677ff', fontSize: 10 }}>
                  {run.owner.displayName?.slice(0, 1)}
                </Avatar>
                {run.owner.displayName}
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="시작">{dayjs(run.startedAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="마감">
            {run.dueAt ? (
              <span style={{ color: dayjs(run.dueAt).isBefore(dayjs()) && run.status === 'active' ? '#ff4d4f' : 'inherit' }}>
                {dayjs(run.dueAt).format('MM/DD HH:mm')}
              </span>
            ) : '-'}
          </Descriptions.Item>
        </Descriptions>

        {phases.length > 0 && (
          <PhaseProgress phases={phases} steps={run.steps || []} />
        )}
        {totalSteps > 0 && (
          <Progress
            percent={pct}
            format={() => `${doneSteps}/${totalSteps} 완료`}
            size="small"
            status={pct === 100 ? 'success' : run.status === 'paused' ? 'exception' : 'active'}
            style={{ marginTop: phases.length ? 4 : 12 }}
          />
        )}
      </Card>

      <Tabs items={tabItems} />

      {/* 완료 모달 */}
      <Modal
        title="Run 완료"
        open={finishModalOpen}
        onOk={handleFinish}
        onCancel={() => setFinishModalOpen(false)}
        okText="완료 처리"
        confirmLoading={actionLoading}
      >
        <TextArea
          value={finishSummary}
          onChange={(e) => setFinishSummary(e.target.value)}
          placeholder="완료 요약 / 결과를 입력하세요 (선택)"
          rows={4}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </div>
  );
}
