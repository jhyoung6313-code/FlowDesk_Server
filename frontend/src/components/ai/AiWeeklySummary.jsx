import { useState, useEffect } from 'react';
import { Modal, Button, Segmented, Spin, Empty, message, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { getAiStatus, getWeeklySummary } from '../../api/ai';
import useAuthStore from '../../store/authStore';
import MarkdownLite from './MarkdownLite';

// AI 주간 업무 요약 — 버튼 + 결과 모달
export default function AiWeeklySummary({ compact = false }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('me');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { summary, period, empty }
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  useEffect(() => {
    getAiStatus().then((s) => setEnabled(!!s.enabled)).catch(() => {});
  }, []);

  const load = async (sc) => {
    setLoading(true);
    setResult(null);
    try {
      const data = await getWeeklySummary(sc);
      setResult(data);
    } catch (err) {
      message.error(err.response?.data?.error || '요약 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => { setOpen(true); load(scope); };
  const changeScope = (sc) => { setScope(sc); load(sc); };

  if (!enabled) return null;

  return (
    <>
      <Button size={compact ? 'small' : 'middle'} icon={<FileTextOutlined />} onClick={openModal}>
        AI 주간 요약
      </Button>
      <Modal
        title="AI 주간 업무 요약"
        open={open}
        onCancel={() => setOpen(false)}
        width={680}
        footer={<Button onClick={() => setOpen(false)}>닫기</Button>}
      >
        {isAdmin && (
          <Segmented
            style={{ marginBottom: 12 }}
            value={scope}
            onChange={changeScope}
            options={[{ label: '내 업무', value: 'me' }, { label: '팀 전체', value: 'all' }]}
            disabled={loading}
          />
        )}
        {loading && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin /> <Typography.Text type="secondary" style={{ marginLeft: 8 }}>AI가 요약하는 중…</Typography.Text>
          </div>
        )}
        {!loading && result?.empty && (
          <Empty description="요약할 최근 업무가 없습니다." />
        )}
        {!loading && result && !result.empty && (
          <>
            {result.period && (
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                기간: {result.period}
              </Typography.Text>
            )}
            <MarkdownLite text={result.summary} />
          </>
        )}
      </Modal>
    </>
  );
}
