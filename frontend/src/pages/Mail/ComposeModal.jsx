import { useState, useEffect } from 'react';
import { Form, Select, Input, Button, Upload, Space, Typography, message, Spin, Tooltip, theme as antTheme } from 'antd';
import { PaperClipOutlined, SendOutlined, SaveOutlined, DeleteOutlined, CloseOutlined, ThunderboltFilled } from '@ant-design/icons';
import { composeMail, updateDraft, sendDraft, uploadMailAttachment, deleteMailAttachment } from '../../api/mail';
import { getUsers } from '../../api/users';
import useAuthStore from '../../store/authStore';
import RichEditor from '../../components/RichEditor';
import ResizableDrawer from '../../components/common/ResizableDrawer';
import dayjs from 'dayjs';

const { useToken } = antTheme;

// 답장/전달 시 원문 인용 HTML 생성
function makeQuote(mail) {
  if (!mail) return '';
  const from = mail.from?.displayName || '';
  const date = dayjs(mail.createdAt).format('YYYY년 MM월 DD일 HH:mm');
  return `<p></p><blockquote><p><strong>${from}</strong> (${date}) 작성:</p>${mail.body || ''}</blockquote>`;
}

// mode별 초기 제목
function makeSubject(mode, subject = '') {
  if (mode === 'reply' || mode === 'replyAll') return subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  if (mode === 'forward') return subject.startsWith('Fw:') ? subject : `Fw: ${subject}`;
  return subject;
}

export default function ComposeModal({
  open,
  onClose,
  onSent,
  // 일반 작성: mode=null, sourceMail=null
  // 답장: mode='reply', sourceMail={...}
  // 전체답장: mode='replyAll', sourceMail={...}
  // 전달: mode='forward', sourceMail={...}
  // 임시저장 편집: mode='draft', sourceMail={draft object}
  mode = null,
  sourceMail = null,
}) {
  const { token } = useToken();
  const [form] = Form.useForm();
  const user = useAuthStore(s => s.user);
  const [users, setUsers] = useState([]);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    getUsers().then(data => {
      setUsers(Array.isArray(data) ? data : (data.users || []));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setAttachments([]);
    setDraftId(null);
    setShowCc(false);
    setShowBcc(false);
    setUrgent(sourceMail?.priority === 'urgent');

    if (mode === 'draft' && sourceMail) {
      // 임시저장 편집
      const toIds = sourceMail.recipients?.filter(r => r.type === 'to').map(r => r.userId) || [];
      const ccIds = sourceMail.recipients?.filter(r => r.type === 'cc').map(r => r.userId) || [];
      const bccIds = sourceMail.recipients?.filter(r => r.type === 'bcc').map(r => r.userId) || [];
      form.setFieldsValue({ to: toIds, cc: ccIds, bcc: bccIds, subject: sourceMail.subject });
      setBody(sourceMail.body || '');
      setDraftId(sourceMail.id);
      if (ccIds.length) setShowCc(true);
      if (bccIds.length) setShowBcc(true);
      setAttachments(sourceMail.attachments || []);
    } else if (mode === 'reply' && sourceMail) {
      form.setFieldsValue({
        to: [sourceMail.from?.id].filter(Boolean),
        subject: makeSubject('reply', sourceMail.subject),
      });
      setBody(makeQuote(sourceMail));
    } else if (mode === 'replyAll' && sourceMail) {
      const myId = user?.id;
      const allRecipients = sourceMail.recipients || [];
      const ccIds = allRecipients
        .filter(r => (r.type === 'to' || r.type === 'cc') && r.userId !== myId && r.userId !== sourceMail.from?.id)
        .map(r => r.userId);
      form.setFieldsValue({
        to: [sourceMail.from?.id].filter(Boolean),
        cc: ccIds,
        subject: makeSubject('replyAll', sourceMail.subject),
      });
      if (ccIds.length) setShowCc(true);
      setBody(makeQuote(sourceMail));
    } else if (mode === 'forward' && sourceMail) {
      form.setFieldsValue({
        to: [],
        subject: makeSubject('forward', sourceMail.subject),
      });
      setBody(makeQuote(sourceMail));
    } else {
      // 새 메일
      setBody('');
    }
  }, [open, mode, sourceMail]);

  const userOptions = users.map(u => ({ label: u.displayName || u.loginId || u.username, value: u.id }));

  const getParentId = () => {
    if ((mode === 'reply' || mode === 'replyAll') && sourceMail) return sourceMail.id;
    return undefined;
  };
  const getForwardedFrom = () => {
    if (mode === 'forward' && sourceMail) return sourceMail.id;
    return undefined;
  };

  const buildPayload = (isDraft) => ({
    ...(form.getFieldsValue()),
    body,
    isDraft,
    priority: urgent ? 'urgent' : 'normal',
    parentId: getParentId(),
    forwardedFrom: getForwardedFrom(),
  });

  const handleSaveDraft = async () => {
    setSubmitting(true);
    try {
      if (draftId) {
        await updateDraft(draftId, buildPayload(true));
      } else {
        const m = await composeMail(buildPayload(true));
        setDraftId(m.id);
      }
      message.success('임시저장 되었습니다.');
    } catch { message.error('임시저장 실패'); }
    finally { setSubmitting(false); }
  };

  const handleSend = async () => {
    try { await form.validateFields(); } catch { return; }
    if (!body.trim() || body === '<p></p>') {
      // 빈 본문도 허용 (경고 없이 발송)
    }
    setSubmitting(true);
    try {
      if (draftId) {
        await updateDraft(draftId, buildPayload(true));
        await sendDraft(draftId);
      } else {
        await composeMail(buildPayload(false));
      }
      message.success('메일을 발송했습니다.');
      onSent?.();
      onClose();
    } catch (e) { message.error(e.response?.data?.error || '발송 실패'); }
    finally { setSubmitting(false); }
  };

  const handleFileUpload = async ({ file }) => {
    let id = draftId;
    if (!id) {
      try {
        const m = await composeMail(buildPayload(true));
        setDraftId(m.id);
        id = m.id;
      } catch { message.error('첨부파일 업로드를 위해 임시저장에 실패했습니다.'); return false; }
    }
    try {
      const att = await uploadMailAttachment(id, file);
      setAttachments(prev => [...prev, att]);
    } catch { message.error('파일 업로드 실패'); }
    return false;
  };

  const handleRemoveAtt = async (att) => {
    if (att.id && draftId) await deleteMailAttachment(draftId, att.id).catch(() => {});
    setAttachments(prev => prev.filter(a => a.id !== att.id));
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const modeLabel = {
    reply: '답장',
    replyAll: '전체 답장',
    forward: '전달',
    draft: '임시저장 편집',
  }[mode] || '새 메일 작성';

  return (
    <ResizableDrawer
      open={open}
      onClose={onClose}
      placement="right"
      width={680}
      minWidth={460}
      title={
        <Space>
          <SendOutlined style={{ color: token.colorPrimary }} />
          {modeLabel}
        </Space>
      }
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Upload beforeUpload={() => false} showUploadList={false} customRequest={handleFileUpload}>
            <Button icon={<PaperClipOutlined />} size="small">첨부파일</Button>
          </Upload>
          <Space>
            <Button icon={<SaveOutlined />} onClick={handleSaveDraft} loading={submitting} size="small">임시저장</Button>
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={submitting}>발송</Button>
          </Space>
        </div>
      }
      styles={{ body: { paddingTop: 16 } }}
    >
      <Spin spinning={submitting}>
        <Form form={form} layout="vertical" size="small">
          <Form.Item label="받는 사람" name="to" rules={[{ required: true, message: '수신자를 선택하세요.' }]}>
            <Select mode="multiple" options={userOptions} placeholder="수신자 선택..."
              filterOption={(input, opt) => opt.label?.toLowerCase().includes(input.toLowerCase())} showSearch />
          </Form.Item>

          <div style={{ display: 'flex', gap: 8, marginTop: -8, marginBottom: 8 }}>
            {!showCc && <Typography.Link style={{ fontSize: 12 }} onClick={() => setShowCc(true)}>참조 추가</Typography.Link>}
            {!showBcc && <Typography.Link style={{ fontSize: 12 }} onClick={() => setShowBcc(true)}>숨은참조 추가</Typography.Link>}
          </div>

          {showCc && (
            <Form.Item label="참조" name="cc">
              <Select mode="multiple" options={userOptions} placeholder="참조 선택..." showSearch
                filterOption={(input, opt) => opt.label?.toLowerCase().includes(input.toLowerCase())} />
            </Form.Item>
          )}
          {showBcc && (
            <Form.Item label="숨은참조" name="bcc">
              <Select mode="multiple" options={userOptions} placeholder="숨은참조 선택..." showSearch
                filterOption={(input, opt) => opt.label?.toLowerCase().includes(input.toLowerCase())} />
            </Form.Item>
          )}

          <Form.Item label="제목" name="subject" rules={[{ required: true, message: '제목을 입력하세요.' }]} style={{ marginBottom: 8 }}>
            <Input
              placeholder="제목을 입력하세요"
              addonBefore={
                <Tooltip title={urgent ? '긴급 해제' : '긴급으로 표시'}>
                  <span
                    onClick={() => setUrgent(v => !v)}
                    style={{
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      color: urgent ? '#ff4d4f' : token.colorTextSecondary, fontWeight: urgent ? 700 : 400,
                    }}
                  >
                    <ThunderboltFilled />긴급
                  </span>
                </Tooltip>
              }
            />
          </Form.Item>
        </Form>

        {/* 리치 에디터 — Form 외부에서 별도 state로 관리 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>내용</div>
          <RichEditor
            key={`${mode}-${sourceMail?.id}-${open}`}
            defaultValue={body}
            onChange={setBody}
            placeholder="내용을 입력하세요"
            minHeight={220}
          />
        </div>

        {/* 첨부파일 목록 */}
        {attachments.length > 0 && (
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 10 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
              첨부파일 ({attachments.length})
            </Typography.Text>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              {attachments.map(att => (
                <div key={att.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 8px', background: token.colorFillAlter, borderRadius: 6,
                }}>
                  <Space size={6}>
                    <PaperClipOutlined style={{ color: token.colorTextSecondary }} />
                    <Typography.Text style={{ fontSize: 12 }}>{att.originalName}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatSize(att.size)}</Typography.Text>
                  </Space>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveAtt(att)} />
                </div>
              ))}
            </Space>
          </div>
        )}
      </Spin>
    </ResizableDrawer>
  );
}
