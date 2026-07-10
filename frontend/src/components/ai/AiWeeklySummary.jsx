import { useState, useEffect } from 'react';
import { Modal, Button, Segmented, Spin, Empty, message, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { getAiStatus, getWeeklySummary } from '../../api/ai';
import useAuthStore from '../../store/authStore';

// 마크다운 경량 렌더러(React 요소 기반 — dangerouslySetInnerHTML 미사용, XSS 안전)
function renderInline(text, keyBase) {
  // **굵게** 만 처리
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>;
    }
    return <span key={`${keyBase}-${i}`}>{p}</span>;
  });
}

function MarkdownLite({ text }) {
  const lines = String(text).split('\n');
  const out = [];
  let list = [];
  const flush = (k) => {
    if (list.length) {
      out.push(<ul key={`ul-${k}`} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{list}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,3}\s/.test(line)) {
      flush(i);
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#+\s/, '');
      const size = level === 1 ? 17 : level === 2 ? 15 : 14;
      out.push(<div key={i} style={{ fontWeight: 700, fontSize: size, margin: '10px 0 4px' }}>{renderInline(content, i)}</div>);
    } else if (/^[-*]\s/.test(line)) {
      list.push(<li key={i} style={{ marginBottom: 2 }}>{renderInline(line.replace(/^[-*]\s/, ''), i)}</li>);
    } else if (line === '') {
      flush(i);
    } else {
      flush(i);
      out.push(<p key={i} style={{ margin: '2px 0' }}>{renderInline(line, i)}</p>);
    }
  });
  flush('end');
  return <div style={{ lineHeight: 1.6 }}>{out}</div>;
}

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
