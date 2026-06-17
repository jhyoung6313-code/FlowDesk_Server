import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  message,
  Divider,
  Dropdown,
  Modal,
  Tag,
} from 'antd';
import { SaveOutlined, FileTextOutlined, DownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getParts } from '../../api/parts';
import { getUsers } from '../../api/users';
import { getTasks } from '../../api/tasks';
import { getTags, createTag } from '../../api/tags';
import { getTemplates, createTemplate } from '../../api/templates';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';

const { TextArea } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;

// 미리 정의된 태그 색상 옵션
const TAG_PRESET_COLORS = [
  '#f5222d', '#fa541c', '#fa8c16', '#fadb14',
  '#52c41a', '#13c2c2', '#1677ff', '#722ed1',
  '#eb2f96', '#8c8c8c',
];

export default function TaskForm({ open, task, onClose, onSubmit }) {
  const [form] = Form.useForm();
  const [parts, setParts]       = useState([]);
  const [users, setUsers]       = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [tags, setTags]         = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]   = useState(false);

  // 템플릿 저장 모달
  const [saveTemplateOpen, setSaveTemplateOpen]   = useState(false);
  const [templateName, setTemplateName]           = useState('');
  const [savingTemplate, setSavingTemplate]       = useState(false);

  useEffect(() => {
    if (open) {
      Promise.all([getParts(), getUsers(), getTasks(), getTags(), getTemplates()]).then(([p, u, t, tg, tmpl]) => {
        setParts(p);
        setUsers(u.filter((u) => u.isActive));
        setTasks(t);
        setTags(tg);
        setTemplates(tmpl);
      });

      if (task) {
        let dateRange = null;
        if (task.startDate || task.dueDate) {
          const start = task.startDate ? dayjs(task.startDate) : dayjs(task.dueDate);
          const end   = task.dueDate   ? dayjs(task.dueDate)   : dayjs(task.startDate);
          dateRange = [start, end];
        }
        const assigneeValues = [
          ...(task.assignees?.map((a) => `uid:${a.userId ?? a.user?.id}`).filter(Boolean) ?? []),
          ...(task.extraAssignees?.map((e) => e.name) ?? []),
        ];
        const tagIds = task.tags?.map((tt) => tt.tagId ?? tt.tag?.id).filter(Boolean) ?? [];

        form.setFieldsValue({
          title:          task.title,
          description:    task.description,
          partId:         task.partId ?? undefined,
          priority:       task.priority   || 'normal',
          status:         task.status     || 'pending',
          dateRange,
          assigneeValues,
          predecessorIds: task.predecessors?.map((p) => p.predecessorId).filter(Boolean),
          tagIds,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, task]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const allValues = values.assigneeValues || [];
      const assigneeIds = allValues
        .filter((v) => String(v).startsWith('uid:'))
        .map((v) => Number(String(v).replace('uid:', '')));
      const extraAssigneeNames = allValues
        .filter((v) => !String(v).startsWith('uid:'))
        .map((v) => String(v).trim())
        .filter(Boolean);

      const data = {
        title: values.title,
        description: values.description,
        partId: values.partId,
        priority: values.priority,
        status: values.status,
        startDate: values.dateRange?.[0]?.format('YYYY-MM-DD') || null,
        dueDate: values.dateRange?.[1]?.format('YYYY-MM-DD') || null,
        assigneeIds,
        extraAssigneeNames,
        predecessorIds: values.predecessorIds || [],
        tagIds: values.tagIds || [],
      };

      await onSubmit(data);
      form.resetFields();
      onClose();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 템플릿 불러오기
  const handleLoadTemplate = (tmpl) => {
    const assigneeValues = (tmpl.assigneeIds || []).map((id) => `uid:${id}`).concat(tmpl.extraNames || []);
    form.setFieldsValue({
      title: tmpl.title,
      description: tmpl.description,
      partId: tmpl.partId ?? undefined,
      priority: tmpl.priority,
      assigneeValues,
      dateRange: tmpl.durationDays
        ? [dayjs(), dayjs().add(tmpl.durationDays - 1, 'day')]
        : null,
    });
    message.success(`"${tmpl.name}" 템플릿을 불러왔습니다.`);
  };

  // 템플릿으로 저장
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      message.warning('템플릿명을 입력하세요.');
      return;
    }
    try {
      const values = form.getFieldsValue();
      setSavingTemplate(true);

      const allValues = values.assigneeValues || [];
      const assigneeIds = allValues.filter((v) => String(v).startsWith('uid:')).map((v) => Number(String(v).replace('uid:', '')));
      const extraNames  = allValues.filter((v) => !String(v).startsWith('uid:')).map((v) => String(v).trim()).filter(Boolean);

      let durationDays = null;
      if (values.dateRange?.[0] && values.dateRange?.[1]) {
        durationDays = values.dateRange[1].diff(values.dateRange[0], 'day') + 1;
      }

      await createTemplate({
        name: templateName.trim(),
        title: values.title || '',
        description: values.description,
        partId: values.partId,
        priority: values.priority || 'normal',
        durationDays,
        assigneeIds,
        extraNames,
      });
      message.success('템플릿으로 저장되었습니다.');
      setSaveTemplateOpen(false);
      setTemplateName('');
      // 템플릿 목록 갱신
      getTemplates().then(setTemplates);
    } catch (err) {
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const templateMenuItems = templates.map((t) => ({
    key: t.id,
    label: t.name,
    onClick: () => handleLoadTemplate(t),
  }));

  return (
    <Drawer
      title={task ? '업무 수정' : '업무 등록'}
      open={open}
      onClose={onClose}
      width={480}
      footer={
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            {/* 템플릿 불러오기 */}
            {templateMenuItems.length > 0 && (
              <Dropdown menu={{ items: templateMenuItems }} placement="topLeft">
                <Button icon={<FileTextOutlined />} size="small">
                  템플릿 불러오기 <DownOutlined />
                </Button>
              </Dropdown>
            )}
            {/* 템플릿으로 저장 */}
            <Button
              icon={<SaveOutlined />}
              size="small"
              onClick={() => { setTemplateName(''); setSaveTemplateOpen(true); }}
            >
              템플릿 저장
            </Button>
          </Space>
          <Space>
            <Button onClick={onClose}>취소</Button>
            <Button type="primary" onClick={handleSubmit} loading={loading}>
              저장
            </Button>
          </Space>
        </Space>
      }
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="title" label="업무 제목" rules={[{ required: true, message: '제목을 입력하세요.' }]}>
          <Input placeholder="업무 제목을 입력하세요" />
        </Form.Item>

        <Form.Item name="description" label="설명">
          <TextArea rows={3} placeholder="업무 내용을 입력하세요" />
        </Form.Item>

        <Form.Item name="partId" label="담당파트">
          <Select placeholder="파트 선택" allowClear>
            {parts.map((p) => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="assigneeValues"
          label="담당자"
          extra="목록에서 선택하거나 이름을 직접 입력 후 Enter"
        >
          <Select
            mode="tags"
            placeholder="담당자 선택 또는 이름 직접 입력"
            allowClear
            tokenSeparators={[',']}
            showSearch
            filterOption={filterUserOption}
            options={buildUserOptions(users, getMyDepartment(), { valuePrefix: 'uid:' })}
          />
        </Form.Item>

        <Form.Item name="dateRange" label="기간 (시작일 ~ 마감일)">
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="priority" label="우선순위" initialValue="normal">
          <Select>
            <Option value="high">높음</Option>
            <Option value="normal">보통</Option>
            <Option value="low">낮음</Option>
          </Select>
        </Form.Item>

        <Form.Item name="status" label="진행 상태" initialValue="pending">
          <Select>
            <Option value="pending">대기</Option>
            <Option value="in_progress">진행중</Option>
            <Option value="done">완료</Option>
            <Option value="hold">보류</Option>
          </Select>
        </Form.Item>

        <Form.Item name="predecessorIds" label="선행 업무 (의존관계)">
          <Select mode="multiple" placeholder="선행 업무 선택" allowClear>
            {tasks
              .filter((t) => !task || t.id !== task.id)
              .map((t) => (
                <Option key={t.id} value={t.id}>{t.title}</Option>
              ))}
          </Select>
        </Form.Item>

        <Form.Item name="tagIds" label="태그">
          <Select
            mode="multiple"
            placeholder="태그 선택"
            allowClear
            optionRender={(option) => (
              <Space size={4}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: option.data.color }} />
                {option.label}
              </Space>
            )}
          >
            {tags.map((t) => (
              <Option key={t.id} value={t.id} color={t.color}>
                <Space size={4}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: t.color }} />
                  {t.name}
                </Space>
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Form>

      {/* 템플릿 저장 모달 */}
      <Modal
        title="템플릿으로 저장"
        open={saveTemplateOpen}
        onOk={handleSaveAsTemplate}
        onCancel={() => setSaveTemplateOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={savingTemplate}
      >
        <Input
          placeholder="템플릿 이름을 입력하세요"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onPressEnter={handleSaveAsTemplate}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </Drawer>
  );
}
