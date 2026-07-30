import { useState, useEffect } from 'react';
import { Modal, Button, Input, Spin, message, Typography, Tag, Space, Empty } from 'antd';
import { RobotOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getAiStatus, askAi } from '../../api/ai';
import MarkdownLite from './MarkdownLite';

const SOURCE_COLOR = { 업무: 'blue', 위키: 'geekblue', 회의: 'purple', 게시판: 'gold', 보드카드: 'cyan', 메모: 'green' };

// AI 질의응답(RAG) — 자연어로 사내 데이터(업무·위키·회의·게시판·보드·메모)에 질문
export default function AiAsk({ compact = false }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { answer, sources }
  const navigate = useNavigate();

  useEffect(() => {
    getAiStatus().then((s) => setEnabled(!!s.enabled)).catch(() => {});
  }, []);

  const submit = async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await askAi(q));
    } catch (err) {
      message.error(err.response?.data?.error || 'AI 검색에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) return null;

  return (
    <>
      <Button size={compact ? 'small' : 'middle'} icon={<RobotOutlined />} onClick={() => setOpen(true)}>
        AI에게 질문
      </Button>
      <Modal
        title={<span><RobotOutlined style={{ color: '#722ed1', marginRight: 8 }} />AI 질의응답 (사내 지식 검색)</span>}
        open={open}
        onCancel={() => setOpen(false)}
        width={680}
        footer={<Button onClick={() => setOpen(false)}>닫기</Button>}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          업무·위키·회의록·게시판·보드·내 메모를 근거로 답하고 출처를 인용합니다. (자연어로 질문하세요)
        </Typography.Paragraph>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="예: 지난달 배포 지연 관련 결정사항 알려줘"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onPressEnter={submit}
            maxLength={1000}
            disabled={loading}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={submit} loading={loading}>질문</Button>
        </Space.Compact>

        {loading && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin /> <Typography.Text type="secondary" style={{ marginLeft: 8 }}>AI가 사내 데이터를 검색·정리하는 중…</Typography.Text>
          </div>
        )}

        {!loading && result && (
          <>
            <MarkdownLite text={result.answer} />
            {result.sources?.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--fd-border)', paddingTop: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>출처</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  {result.sources.map((s) => (
                    <div key={s.n} style={{ marginBottom: 4 }}>
                      <Tag color={SOURCE_COLOR[s.source] || 'default'}>[{s.n}] {s.source}</Tag>
                      <a onClick={() => { setOpen(false); navigate(s.path); }}>{s.title}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {!loading && result && !result.answer && <Empty description="답변이 비어 있습니다." />}
      </Modal>
    </>
  );
}
