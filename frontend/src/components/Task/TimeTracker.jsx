import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Button, Space, Typography, List, Spin, Popconfirm, message, Input, Tag, Tooltip,
} from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined,
  ClockCircleOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import {
  getTimeEntries, getRunningTimer, startTimer, stopTimer, deleteTimeEntry,
} from '../../api/timeTracking';

dayjs.extend(duration);

const { Text } = Typography;

function formatSeconds(secs) {
  if (!secs && secs !== 0) return '-';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}시간 ${String(m).padStart(2, '0')}분`;
  if (m > 0) return `${m}분 ${String(s).padStart(2, '0')}초`;
  return `${s}초`;
}

function formatElapsed(startTime) {
  const secs = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  return formatSeconds(secs);
}

export default function TimeTracker({ taskId, currentUser }) {
  const [entries, setEntries]           = useState([]);
  const [running, setRunning]           = useState(null); // 실행 중인 타임 엔트리
  const [loading, setLoading]           = useState(false);
  const [starting, setStarting]         = useState(false);
  const [stopping, setStopping]         = useState(false);
  const [stopNote, setStopNote]         = useState('');
  const [elapsed, setElapsed]           = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const [list, r] = await Promise.all([
        getTimeEntries(taskId),
        getRunningTimer(taskId),
      ]);
      setEntries(list);
      setRunning(r);
    } catch {
      // 조용히 실패
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  // 실행 중 타이머 경과 시간 갱신
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (running) {
      setElapsed(formatElapsed(running.startTime));
      timerRef.current = setInterval(() => {
        setElapsed(formatElapsed(running.startTime));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [running]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const entry = await startTimer(taskId);
      setRunning(entry);
      message.success('타이머가 시작되었습니다.');
    } catch (err) {
      message.error(err?.response?.data?.error || '타이머 시작에 실패했습니다.');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!running) return;
    setStopping(true);
    try {
      await stopTimer(running.id, stopNote);
      setRunning(null);
      setStopNote('');
      message.success('타이머가 종료되었습니다.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || '타이머 종료에 실패했습니다.');
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTimeEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      message.success('삭제되었습니다.');
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  // 전체 소요 시간 합산 (완료된 엔트리만)
  const totalSeconds = entries
    .filter((e) => e.duration != null)
    .reduce((sum, e) => sum + e.duration, 0);

  if (loading) return <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>;

  return (
    <div>
      {/* 합계 표시 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, background: 'var(--fd-surface-sunken)', borderRadius: 6, padding: '8px 12px',
      }}>
        <Space>
          <ClockCircleOutlined style={{ color: '#1677ff' }} />
          <Text strong>총 소요시간</Text>
        </Space>
        <Text strong style={{ color: '#1677ff', fontSize: 15 }}>
          {formatSeconds(totalSeconds)}
        </Text>
      </div>

      {/* 타이머 컨트롤 */}
      {running ? (
        <div style={{
          background: '#e6f4ff', borderRadius: 8, padding: '12px 16px',
          marginBottom: 12, border: '1px solid #91caff',
        }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <span style={{ width: 8, height: 8, background: '#ff4d4f', borderRadius: '50%', display: 'inline-block', animation: 'pulse 1s infinite' }} />
              <Text strong style={{ color: '#1677ff' }}>타이머 실행 중</Text>
              <Tag color="blue">{elapsed}</Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              시작: {dayjs(running.startTime).format('HH:mm:ss')}
            </Text>
            <Input
              placeholder="메모 (선택)"
              value={stopNote}
              onChange={(e) => setStopNote(e.target.value)}
              onPressEnter={handleStop}
              size="small"
            />
            <Button
              type="primary"
              danger
              icon={<PauseCircleOutlined />}
              onClick={handleStop}
              loading={stopping}
              block
            >
              정지
            </Button>
          </Space>
        </div>
      ) : (
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleStart}
          loading={starting}
          block
          style={{ marginBottom: 12 }}
        >
          타이머 시작
        </Button>
      )}

      {/* 기록 목록 */}
      {entries.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 13 }}>기록된 시간이 없습니다.</Text>
      ) : (
        <List
          size="small"
          dataSource={entries}
          renderItem={(entry) => {
            const canDelete = currentUser?.id === entry.userId || currentUser?.role === 'admin';
            return (
              <List.Item
                style={{ padding: '6px 0', alignItems: 'flex-start' }}
                extra={
                  canDelete ? (
                    <Popconfirm
                      title="삭제하시겠습니까?"
                      onConfirm={() => handleDelete(entry.id)}
                      okText="삭제"
                      cancelText="취소"
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ) : null
                }
              >
                <List.Item.Meta
                  avatar={
                    entry.endTime
                      ? <CheckCircleOutlined style={{ color: '#52c41a', marginTop: 2 }} />
                      : <ClockCircleOutlined style={{ color: '#1677ff', marginTop: 2 }} />
                  }
                  title={
                    <Space>
                      <Text style={{ fontSize: 12 }}>
                        {dayjs(entry.startTime).format('MM/DD HH:mm')}
                        {entry.endTime && ` ~ ${dayjs(entry.endTime).format('HH:mm')}`}
                      </Text>
                      {entry.duration != null && (
                        <Tag color="blue" style={{ fontSize: 11 }}>
                          {formatSeconds(entry.duration)}
                        </Tag>
                      )}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {entry.user?.displayName}
                      </Text>
                      {entry.note && (
                        <Text style={{ fontSize: 11 }}>{entry.note}</Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
