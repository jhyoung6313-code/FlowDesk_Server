import { useState } from 'react';
import {
  Modal, Input, Button, List, Checkbox, Select, DatePicker, Tag, Space, Typography, message, Empty, Spin, Alert,
} from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { generateTasks } from '../../api/ai';
import useTaskStore from '../../store/taskStore';

const PRIORITY_OPTIONS = [
  { value: 'high', label: '높음' },
  { value: 'normal', label: '보통' },
  { value: 'low', label: '낮음' },
];

// 자연어 요청을 업무 초안으로 변환 → 검토·편집 후 일괄 생성
export default function AiTaskGenerator({ open, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState(null); // null=미생성, []=결과 없음
  const [creating, setCreating] = useState(false);
  const addTask = useTaskStore((s) => s.addTask);

  const reset = () => { setPrompt(''); setDrafts(null); setLoading(false); setCreating(false); };
  const handleClose = () => { reset(); onClose(); };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const { tasks } = await generateTasks(prompt.trim());
      setDrafts(tasks.map((t) => ({ ...t, _selected: true })));
    } catch (err) {
      message.error(err.response?.data?.error || 'AI 업무 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const patch = (idx, field, val) =>
    setDrafts((ds) => ds.map((d, i) => (i === idx ? { ...d, [field]: val } : d)));

  const handleCreate = async () => {
    const selected = drafts.filter((d) => d._selected && d.title.trim());
    if (!selected.length) { message.warning('생성할 업무를 선택하세요.'); return; }
    setCreating(true);
    let ok = 0;
    for (const d of selected) {
      try {
        await addTask({
          title: d.title.trim(),
          description: d.description || '',
          priority: d.priority,
          dueDate: d.dueDate || null,
          assigneeIds: d.assigneeIds || [],
        });
        ok += 1;
      } catch { /* 개별 실패는 건너뜀 */ }
    }
    setCreating(false);
    if (ok) message.success(`${ok}건의 업무를 생성했습니다.`);
    if (ok < selected.length) message.warning(`${selected.length - ok}건은 생성하지 못했습니다.`);
    handleClose();
  };

  const selectedCount = drafts?.filter((d) => d._selected).length || 0;

  return (
    <Modal
      title={<Space><ThunderboltOutlined style={{ color: '#722ed1' }} />AI 업무 자동 생성</Space>}
      open={open}
      onCancel={handleClose}
      width={720}
      footer={
        drafts && drafts.length ? [
          <Button key="back" onClick={() => setDrafts(null)}>다시 작성</Button>,
          <Button key="create" type="primary" loading={creating} onClick={handleCreate}>
            선택한 {selectedCount}건 생성
          </Button>,
        ] : [
          <Button key="cancel" onClick={handleClose}>취소</Button>,
          <Button key="gen" type="primary" loading={loading} disabled={!prompt.trim()} onClick={handleGenerate}>
            초안 생성
          </Button>,
        ]
      }
    >
      {drafts === null && (
        <>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            하고 싶은 일을 자연어로 입력하면 AI가 실행 가능한 업무 항목으로 분해합니다.
            생성 후 검토·수정하여 등록할 수 있습니다.
          </Typography.Paragraph>
          <Input.TextArea
            rows={5}
            value={prompt}
            maxLength={2000}
            showCount
            placeholder={'예) 다음 주 금요일까지 신제품 출시 준비 — 보도자료 작성, 홈페이지 배너 교체, 사내 공지, 고객사 안내메일 발송'}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
          />
          {loading && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin /> <Typography.Text type="secondary" style={{ marginLeft: 8 }}>AI가 업무를 분해하는 중…</Typography.Text>
            </div>
          )}
        </>
      )}

      {drafts !== null && drafts.length === 0 && (
        <Empty description="생성된 업무 초안이 없습니다. 요청을 더 구체적으로 작성해보세요." />
      )}

      {drafts !== null && drafts.length > 0 && (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="AI가 생성한 초안입니다. 담당자·기한·우선순위를 검토·수정한 뒤 등록하세요."
          />
          <List
            dataSource={drafts}
            renderItem={(d, idx) => (
              <List.Item key={idx} style={{ alignItems: 'flex-start', gap: 8 }}>
                <Checkbox
                  checked={d._selected}
                  onChange={(e) => patch(idx, '_selected', e.target.checked)}
                  style={{ marginTop: 6 }}
                />
                <div style={{ flex: 1 }}>
                  <Input
                    value={d.title}
                    onChange={(e) => patch(idx, 'title', e.target.value)}
                    style={{ fontWeight: 600, marginBottom: 6 }}
                  />
                  <Input.TextArea
                    value={d.description}
                    onChange={(e) => patch(idx, 'description', e.target.value)}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    style={{ marginBottom: 6 }}
                  />
                  <Space wrap>
                    <Select
                      size="small"
                      value={d.priority}
                      options={PRIORITY_OPTIONS}
                      onChange={(v) => patch(idx, 'priority', v)}
                      style={{ width: 90 }}
                    />
                    <DatePicker
                      size="small"
                      value={d.dueDate ? dayjs(d.dueDate) : null}
                      onChange={(v) => patch(idx, 'dueDate', v ? v.format('YYYY-MM-DD') : null)}
                      placeholder="마감일"
                    />
                    {d.assigneeHints?.length > 0 && (
                      <span>
                        {d.assigneeHints.map((h) => (
                          <Tag key={h} color={d.assigneeIds?.length ? 'blue' : 'default'}>{h}</Tag>
                        ))}
                        {!d.assigneeIds?.length && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>(미매칭)</Typography.Text>
                        )}
                      </span>
                    )}
                  </Space>
                </div>
              </List.Item>
            )}
          />
        </>
      )}
    </Modal>
  );
}
