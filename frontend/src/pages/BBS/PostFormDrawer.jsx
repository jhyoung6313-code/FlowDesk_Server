import { useEffect, useState } from 'react';
import { Form, Input, Select, Button, Space, Upload, message, Typography, DatePicker, Row, Col } from 'antd';
import { PaperClipOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getBbsCategories, createBbsPost, updateBbsPost, getBbsPost,
  uploadBbsAttachment, deleteBbsAttachment, downloadBbsAttachmentUrl,
} from '../../api/bbs';
import { getDepartments } from '../../api/org';
import RichEditor from '../../components/RichEditor';
import ResizableDrawer from '../../components/common/ResizableDrawer';
import useAuthStore from '../../store/authStore';

const { Text } = Typography;

/**
 * 게시글 작성/수정 드로어.
 * @param {boolean} open
 * @param {number|null} postId  - null이면 신규 작성
 * @param {number|null} categoryId - 신규 작성 시 기본 선택 게시판
 * @param {function} onClose
 * @param {function} onSaved - 저장 후 호출 (savedPost 전달)
 */
export default function PostFormDrawer({ open, postId = null, categoryId = null, onClose, onSaved }) {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const isEdit = !!postId;

  const [form] = Form.useForm();
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);

  // 드로어가 열릴 때마다 초기화 + 데이터 로드
  useEffect(() => {
    if (!open) return;
    setPendingFiles([]);
    getBbsCategories().then(data => {
      setCategories(data.filter(c => c.writeRole === 'all' || isAdmin));
    }).catch(() => message.error('카테고리를 불러오지 못했습니다.'));
    getDepartments().then(setDepartments).catch(() => {});

    if (isEdit) {
      getBbsPost(postId).then(data => {
        form.setFieldsValue({
          categoryId: data.categoryId,
          title: data.title,
          senderOrg: data.senderOrg || undefined,
          officialDueDate: data.officialDueDate ? dayjs(data.officialDueDate) : undefined,
          recipientDepts: data.recipientDepts || [],
        });
        setContent(data.content || '');
        setExistingAttachments(data.attachments || []);
      }).catch(() => message.error('게시글을 불러오지 못했습니다.'));
    } else {
      form.resetFields();
      setContent('');
      setExistingAttachments([]);
      if (categoryId) form.setFieldValue('categoryId', Number(categoryId));
    }
  }, [open, postId, categoryId, isAdmin]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!content.trim()) return message.warning('내용을 입력하세요.');
      setSaving(true);

      const payload = {
        ...values,
        content,
        senderOrg: values.senderOrg || null,
        officialDueDate: values.officialDueDate ? values.officialDueDate.format('YYYY-MM-DD') : null,
        recipientDepts: values.recipientDepts || [],
      };

      let savedPost;
      if (isEdit) {
        savedPost = await updateBbsPost(postId, payload);
      } else {
        savedPost = await createBbsPost(payload);
      }

      for (const file of pendingFiles) {
        await uploadBbsAttachment(savedPost.id, file);
      }

      message.success(isEdit ? '수정되었습니다.' : '게시글이 등록되었습니다.');
      onSaved?.(savedPost);
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExisting = async (aid) => {
    try {
      await deleteBbsAttachment(postId, aid);
      setExistingAttachments(prev => prev.filter(a => a.id !== aid));
    } catch {
      message.error('첨부파일 삭제 실패');
    }
  };

  return (
    <ResizableDrawer
      title={isEdit ? '게시글 수정' : '글쓰기'}
      open={open}
      onClose={onClose}
      width={760}
      footer={
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose}>취소</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            {isEdit ? '수정 완료' : '등록'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="categoryId" label="게시판" rules={[{ required: true, message: '게시판을 선택하세요.' }]}>
          <Select placeholder="게시판 선택">
            {categories.map(c => (
              <Select.Option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력하세요.' }]}>
          <Input placeholder="제목 입력" maxLength={200} />
        </Form.Item>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="senderOrg" label="발신처">
              <Input placeholder="발신처 (선택)" maxLength={200} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="officialDueDate" label="공문 처리기한">
              <DatePicker style={{ width: '100%' }} placeholder="기한 선택 (선택)" format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="recipientDepts" label="수신부서">
          <Select
            mode="multiple"
            allowClear
            placeholder="수신부서 선택 (선택, 여러 개 가능)"
            optionFilterProp="label"
            options={departments.map(d => ({ label: d.name, value: d.name }))}
          />
        </Form.Item>
      </Form>

      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>내용</Text>
        <RichEditor
          defaultValue={content}
          onChange={setContent}
          placeholder="내용을 입력하세요"
          minHeight={300}
        />
      </div>

      {/* 기존 첨부파일 (수정 시) */}
      {existingAttachments.length > 0 && (
        <div style={{ background: 'var(--fd-surface-sunken)', border: '1px solid var(--fd-border)', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
          <Text strong style={{ fontSize: 13 }}>기존 첨부파일</Text>
          {existingAttachments.map(att => (
            <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
              <a href={downloadBbsAttachmentUrl(postId, att.id)} download={att.originalName} style={{ fontSize: 13 }}>
                <PaperClipOutlined style={{ marginRight: 6 }} />{att.originalName}
              </a>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteExisting(att.id)} />
            </div>
          ))}
        </div>
      )}

      {/* 새 첨부파일 */}
      <div>
        <Upload
          multiple
          beforeUpload={file => { setPendingFiles(prev => [...prev, file]); return false; }}
          onRemove={file => setPendingFiles(prev => prev.filter(f => f.uid !== file.uid))}
          fileList={pendingFiles.map(f => ({ uid: f.uid || f.name, name: f.name, status: 'done' }))}
        >
          <Button icon={<PaperClipOutlined />} size="small">파일 첨부 (최대 20MB)</Button>
        </Upload>
      </div>
    </ResizableDrawer>
  );
}
