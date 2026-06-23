import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card, Button, Tabs, Space, message,
  Tooltip, Typography, Spin, DatePicker, Tag, Modal, Input,
  Popover, List,
} from 'antd';
import {
  EditOutlined, ProjectOutlined, UserOutlined, CalendarOutlined,
  DownloadOutlined, UploadOutlined, ApartmentOutlined, FilePdfOutlined,
  CameraOutlined, HistoryOutlined, DeleteOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as wbsApi from '../../api/wbs';
import { exportWbsPdf, exportIssuesPdf, exportWbsReportPdf } from '../../utils/pdf';
import WbsSheet from './WbsSheet';
import IssueSheet from './IssueSheet';
import GanttView from './GanttView';
import WbsSummaryCards from './WbsSummaryCards';
import useAuthStore from '../../store/authStore';

const { Title, Text } = Typography;

// ─── 트리 flatten ─────────────────────────────────────
function flattenTree(nodes) {
  const result = [];
  function walk(arr) {
    arr.forEach((n) => {
      result.push(n);
      if (n.children?.length) walk(n.children);
    });
  }
  walk(nodes || []);
  return result;
}

// ─── 트리에 번호(_num) 부여 ───────────────────────────
function assignNumbers(nodes, prefix = '') {
  return nodes.map((node, i) => {
    const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    return {
      ...node,
      _num: num,
      children: node.children?.length ? assignNumbers(node.children, num) : undefined,
    };
  });
}

// ─── 전체 진척률 (최상위 평균) ────────────────────────
function calcOverallProgress(rootTasks, field) {
  if (!rootTasks || rootTasks.length === 0) return 0;
  return Math.round(rootTasks.reduce((s, t) => s + (Number(t[field]) || 0), 0) / rootTasks.length);
}

// ─── 스냅샷 localStorage 유틸 ─────────────────────────
const SNAP_KEY = (projectId) => `wbs_snapshots_${projectId}`;

function loadSnapshots(projectId) {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY(projectId)) || '[]'); } catch { return []; }
}

function saveSnapshots(projectId, snaps) {
  localStorage.setItem(SNAP_KEY(projectId), JSON.stringify(snaps));
}

export default function WbsPage() {
  const { projectId } = useParams();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('wbs');

  // 기준일자 (기본: 오늘)
  const [refDate, setRefDate] = useState(null);

  // 스냅샷
  const [snapshots, setSnapshots] = useState([]);
  const [snapModalOpen, setSnapModalOpen] = useState(false);
  const [snapName, setSnapName] = useState('');
  const [compareSnap, setCompareSnap] = useState(null);

  // Excel 상태
  const [excelExporting, setExcelExporting] = useState(false);
  const [excelImporting, setExcelImporting] = useState(false);

  // ─── 프로젝트 상세 로드 ──────────────────────────────
  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const [proj, taskTree, issueList] = await Promise.all([
        wbsApi.getProject(id),
        wbsApi.getTasks(id),
        wbsApi.getIssues(id),
      ]);
      setProject(proj);
      setTasks(taskTree);
      setIssues(issueList);
    } catch {
      message.error('프로젝트 상세 로드 실패');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      loadDetail(projectId);
      setSnapshots(loadSnapshots(projectId));
      setCompareSnap(null);
      setRefDate(null);
    } else {
      setProject(null);
      setTasks([]);
      setIssues([]);
    }
  }, [projectId, loadDetail]);

  // ─── 스냅샷 저장 ────────────────────────────────────
  const handleSaveSnap = () => {
    const flatAll = flattenTree(tasks);
    const snap = {
      id: Date.now(),
      name: snapName || `기준선 ${dayjs().format('YYYY-MM-DD HH:mm')}`,
      createdAt: new Date().toISOString(),
      data: flatAll.map((t) => ({
        id: t.id,
        name: t.name,
        plannedProgress: Number(t.plannedProgress) || 0,
        actualProgress: Number(t.actualProgress) || 0,
      })),
    };
    const updated = [snap, ...snapshots].slice(0, 10);
    setSnapshots(updated);
    saveSnapshots(projectId, updated);
    setSnapModalOpen(false);
    setSnapName('');
    message.success('기준선이 저장되었습니다.');
  };

  const handleDeleteSnap = (snapId) => {
    const updated = snapshots.filter((s) => s.id !== snapId);
    setSnapshots(updated);
    saveSnapshots(projectId, updated);
    if (compareSnap?.id === snapId) setCompareSnap(null);
  };

  // ─── Excel 내보내기 ──────────────────────────────────
  const handleExcelExport = useCallback(async (type) => {
    if (!project) return;
    setExcelExporting(true);
    try {
      if (type === 'wbs') await wbsApi.exportTasksExcel(project.id, project.name);
      else await wbsApi.exportIssuesExcel(project.id, project.name);
    } catch {
      message.error('Excel 내보내기에 실패했습니다.');
    } finally {
      setExcelExporting(false);
    }
  }, [project]);

  const handleExcelImport = useCallback((type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file || !project) return;
      setExcelImporting(true);
      try {
        const result = type === 'wbs'
          ? await wbsApi.importTasksExcel(project.id, file)
          : await wbsApi.importIssuesExcel(project.id, file);
        message.success(result.message);
        loadDetail(project.id);
      } catch (err) {
        message.error(err?.response?.data?.error || err?.response?.data?.message || 'Excel 가져오기에 실패했습니다.');
      } finally {
        setExcelImporting(false);
      }
    };
    input.click();
  }, [project, loadDetail]);

  // ─── 진척률 요약 ─────────────────────────────────────
  const rootTasks = tasks;
  const overallPlanned = calcOverallProgress(rootTasks, 'plannedProgress');
  const overallActual = calcOverallProgress(rootTasks, 'actualProgress');
  const compliance = overallPlanned > 0
    ? Math.min(Math.round((overallActual / overallPlanned) * 100), 100)
    : 0;

  const numberedTasks = useMemo(() => assignNumbers(tasks), [tasks]);
  const flatTasks = useMemo(() => flattenTree(numberedTasks), [numberedTasks]);

  // ─── 스냅샷 비교 데이터 (비교 모드일 때) ─────────────
  const snapCompareMap = useMemo(() => {
    if (!compareSnap) return null;
    const map = {};
    compareSnap.data.forEach((d) => { map[d.id] = d; });
    return map;
  }, [compareSnap]);

  // ─── 탭 아이템 ──────────────────────────────────────
  const tabItems = [
    {
      key: 'wbs',
      label: 'WBS',
      children: (
        <WbsSheet
          projectId={projectId}
          tasks={tasks}
          issues={issues}
          onRefresh={() => loadDetail(projectId)}
          refDate={refDate}
        />
      ),
    },
    {
      key: 'gantt',
      label: (
        <span>
          간트차트
          {flatTasks.some((t) => t.startDate && t.endDate) && (
            <span style={{ marginLeft: 4, fontSize: 10, color: '#52c41a' }}>●</span>
          )}
        </span>
      ),
      children: <GanttView tasks={tasks} project={project} />,
    },
    {
      key: 'issues',
      label: `이슈사항 (${issues.length})`,
      children: (
        <IssueSheet
          projectId={projectId}
          issues={issues}
          onRefresh={() => loadDetail(projectId)}
          wbsTasks={flatTasks}
        />
      ),
    },
  ];

  // ─── 탭 우측 버튼 ────────────────────────────────────
  const tabExtraButtons = project ? (
    <Space size={4} wrap>
      {/* 기준일자 */}
      <Tooltip title="기준일자: 이 날짜 기준으로 지연 계산">
        <Space size={4}>
          <CalendarOutlined style={{ color: '#1890ff' }} />
          <DatePicker
            size="small"
            placeholder="기준일자"
            value={refDate ? dayjs(refDate) : null}
            onChange={(d) => setRefDate(d ? d.format('YYYY-MM-DD') : null)}
            allowClear
            style={{ width: 110 }}
          />
          {refDate && (
            <Tag color="blue" style={{ margin: 0 }}>
              {dayjs(refDate).format('MM/DD')} 기준
            </Tag>
          )}
        </Space>
      </Tooltip>

      {/* 스냅샷 */}
      <Tooltip title="현재 진척률을 기준선으로 저장">
        <Button
          size="small" icon={<CameraOutlined />}
          onClick={() => setSnapModalOpen(true)}
          style={{ borderColor: '#722ed1', color: '#722ed1' }}
        >
          기준선 저장
        </Button>
      </Tooltip>
      {snapshots.length > 0 && (
        <Popover
          trigger="click"
          title="저장된 기준선"
          content={
            <List
              size="small"
              dataSource={snapshots}
              style={{ width: 280 }}
              renderItem={(snap) => (
                <List.Item
                  actions={[
                    <Button
                      type="link" size="small"
                      onClick={() => setCompareSnap(compareSnap?.id === snap.id ? null : snap)}
                      style={{ color: compareSnap?.id === snap.id ? '#ff4d4f' : '#1890ff', padding: 0 }}
                    >
                      {compareSnap?.id === snap.id ? '비교 해제' : '비교'}
                    </Button>,
                    <Button
                      type="link" danger size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteSnap(snap.id)}
                      style={{ padding: 0 }}
                    />,
                  ]}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{snap.name}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>
                      {dayjs(snap.createdAt).format('YYYY-MM-DD HH:mm')}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          }
        >
          <Button
            size="small" icon={<HistoryOutlined />}
            style={{ borderColor: compareSnap ? '#722ed1' : undefined, color: compareSnap ? '#722ed1' : undefined }}
          >
            기준선 {snapshots.length}개{compareSnap ? ` · 비교중` : ''}
          </Button>
        </Popover>
      )}

      <Tooltip title="Excel 내보내기">
        <Button size="small" icon={<DownloadOutlined />} loading={excelExporting}
          onClick={() => handleExcelExport(activeTab === 'wbs' || activeTab === 'gantt' ? 'wbs' : 'issues')}>
          Excel
        </Button>
      </Tooltip>
      <Tooltip title="PDF 보고서 출력">
        <Button size="small" icon={<FilePdfOutlined />}
          onClick={() => {
            if (activeTab === 'wbs' || activeTab === 'gantt') {
              exportWbsReportPdf(project, tasks, issues, refDate);
            } else {
              exportIssuesPdf(project.name, issues);
            }
          }}>
          PDF
        </Button>
      </Tooltip>
      {isAdmin && (
        <Tooltip title="Excel 가져오기 (기존 데이터를 덮어씁니다)">
          <Button size="small" icon={<UploadOutlined />} loading={excelImporting}
            onClick={() => handleExcelImport(activeTab === 'wbs' || activeTab === 'gantt' ? 'wbs' : 'issues')}>
            가져오기
          </Button>
        </Tooltip>
      )}
    </Space>
  ) : null;

  // 프로젝트 미선택
  if (!projectId || !project) {
    return (
      <Spin spinning={detailLoading}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 400, color: '#aaa', gap: 16 }}>
          <ApartmentOutlined style={{ fontSize: 64, color: '#c8e6c9' }} />
          <div style={{ textAlign: 'center' }}>
            <Title level={4} style={{ color: '#9e9e9e', marginBottom: 8 }}>WBS 프로젝트를 선택하세요</Title>
            <Text type="secondary">왼쪽 목록에서 프로젝트를 선택하세요.</Text>
            {isAdmin && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary">새 프로젝트는 왼쪽 상단의 <b>＋</b> 버튼으로 추가할 수 있습니다.</Text>
              </div>
            )}
          </div>
        </div>
      </Spin>
    );
  }

  return (
    <Spin spinning={detailLoading}>
      {/* 프로젝트 헤더 */}
      <Card
        size="small"
        style={{ marginBottom: 12, borderColor: '#c8e6c9' }}
        styles={{ body: { padding: '10px 16px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={4} style={{ margin: 0, color: '#1b5e20' }}>{project.name}</Title>
              {isAdmin && (
                <Tooltip title="사이드 메뉴에서 수정·삭제할 수 있습니다">
                  <EditOutlined style={{ color: '#9e9e9e', fontSize: 14 }} />
                </Tooltip>
              )}
              {compareSnap && (
                <Tag color="purple" icon={<HistoryOutlined />}>
                  「{compareSnap.name}」 기준선 비교중
                </Tag>
              )}
            </div>
            {(project.startDate || project.endDate) && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                <CalendarOutlined style={{ marginRight: 4 }} />
                {project.startDate ? dayjs(project.startDate).format('YYYY.MM.DD') : ''}
                {' ~ '}
                {project.endDate ? dayjs(project.endDate).format('YYYY.MM.DD') : ''}
                {project.endDate && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: dayjs().isAfter(dayjs(project.endDate)) ? '#ff4d4f' : '#52c41a' }}>
                    (D{dayjs().isAfter(dayjs(project.endDate))
                      ? `+${dayjs().diff(dayjs(project.endDate), 'day')}`
                      : `-${dayjs(project.endDate).diff(dayjs(), 'day')}`})
                  </span>
                )}
              </Text>
            )}
            {project.members?.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {project.members.map((m, i) => (
                  <Tag key={i} icon={<UserOutlined />} color="green">{m.role}: {m.memberName}</Tag>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 요약 대시보드 카드 */}
      <WbsSummaryCards tasks={tasks} issues={issues} refDate={refDate} />

      {/* 기준선 비교 배너 */}
      {compareSnap && (
        <Card
          size="small"
          style={{ marginBottom: 12, borderColor: '#d3adf7', background: '#f9f0ff' }}
          styles={{ body: { padding: '8px 16px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <HistoryOutlined style={{ color: '#722ed1' }} />
            <span style={{ fontWeight: 600, color: '#722ed1' }}>기준선 비교: {compareSnap.name}</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>{dayjs(compareSnap.createdAt).format('YYYY-MM-DD HH:mm')} 저장</span>
            <div style={{ flex: 1 }} />
            {flatTasks.slice(0, 5).map((t) => {
              const snap = compareSnap.data.find((d) => d.id === t.id);
              if (!snap) return null;
              const delta = (Number(t.actualProgress) || 0) - snap.actualProgress;
              if (delta === 0) return null;
              return (
                <Tag key={t.id} color={delta > 0 ? 'green' : 'red'} style={{ fontSize: 11 }}>
                  {t.name}: {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
                </Tag>
              );
            })}
            <Button type="link" size="small" onClick={() => setCompareSnap(null)} style={{ color: '#aaa', padding: 0 }}>
              닫기
            </Button>
          </div>
        </Card>
      )}

      {/* 시트 탭 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        type="card"
        size="small"
        tabBarExtraContent={tabExtraButtons}
      />

      {/* 스냅샷 저장 모달 */}
      <Modal
        title={<><CameraOutlined style={{ marginRight: 8, color: '#722ed1' }} />기준선 저장</>}
        open={snapModalOpen}
        onOk={handleSaveSnap}
        onCancel={() => { setSnapModalOpen(false); setSnapName(''); }}
        okText="저장"
        cancelText="취소"
        okButtonProps={{ style: { background: '#722ed1', borderColor: '#722ed1' } }}
      >
        <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
          현재 모든 항목의 계획/실적 진척률을 기준선으로 저장합니다.
          나중에 비교하여 진척 변화를 확인할 수 있습니다.
        </p>
        <Input
          placeholder={`기준선 ${dayjs().format('YYYY-MM-DD HH:mm')}`}
          value={snapName}
          onChange={(e) => setSnapName(e.target.value)}
          onPressEnter={handleSaveSnap}
          prefix={<HistoryOutlined style={{ color: '#aaa' }} />}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#aaa' }}>
          최대 10개까지 저장 (브라우저 로컬 저장)
        </div>
      </Modal>

      <style>{`
        .ant-table-tbody > tr:hover > td { background: inherit !important; }
        .ant-table-row-expand-icon-cell { background: inherit !important; }
      `}</style>
    </Spin>
  );
}
