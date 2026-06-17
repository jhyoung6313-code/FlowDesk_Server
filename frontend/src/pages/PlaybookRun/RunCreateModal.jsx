import { useState, useEffect } from 'react';
import {
  Modal, Form, Input, Select, DatePicker, Typography, Divider, message, Tag,
} from 'antd';
import { getUsers } from '../../api/users';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../utils/userOptions';
import * as pbApi from '../../api/playbook';
import dayjs from 'dayjs';

const { Text } = Typography;

const SEVERITY_OPTIONS = [
  { value: 'none', label: '없음',      color: 'default' },
  { value: 'p3',   label: 'P3 보통',   color: 'blue'    },
  { value: 'p2',   label: 'P2 높음',   color: 'orange'  },
  { value: 'p1',   label: 'P1 긴급',   color: 'red'     },
];

export default function RunCreateModal({ open, onClose, onCreated, defaultPlaybookId }) {
  const [form] = Form.useForm();
  const [playbooks, setPlaybooks] = useState([]);
  const [users, setUsers] = useState([]);
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      pbApi.getPlaybooks().then(setPlaybooks);
      getUsers().then((u) => setUsers(u.filter((x) => x.isActive)));
      form.resetFields();
      setVariables([]);
      if (defaultPlaybookId) {
        form.setFieldValue('playbookId', Number(defaultPlaybookId));
        loadPlaybookVars(Number(defaultPlaybookId));
      }
    }
  }, [open]);

  const loadPlaybookVars = async (pbId) => {
    if (!pbId) { setVariables([]); return; }
    try {
      const pb = await pbApi.getPlaybook(pbId);
      setVariables(pb.variables || []);
      if (!form.getFieldValue('name')) {
        form.setFieldValue('name', `${pb.name} Run`);
      }
      if (pb.defaultParticipants?.length) {
        form.setFieldValue('participantIds', pb.defaultParticipants);
      }
    } catch { /* ignore */ }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const varValues = {};
      variables.forEach((v) => {
        const val = values[`var_${v.key}`];
        if (val) varValues[v.key] = val;
      });

      const run = await pbApi.createRun({
        playbookId: values.playbookId || null,
        name: values.name,
        severity: values.severity || 'none',
        dueAt: values.dueAt ? values.dueAt.toISOString() : null,
        participantIds: values.participantIds || [],
        variableValues: Object.keys(varValues).length ? varValues : null,
      });

      message.success('Run이 시작되었습니다!');
      onCreated(run);
    } catch (err) {
      if (!err?.errorFields) message.error('Run 시작 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="새 Run 시작"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="시작"
      cancelText="취소"
      confirmLoading={loading}
      width={560}
    >
      <Form form={form} layout="vertical" size="small" style={{ marginTop: 12 }}>
        <Form.Item name="playbookId" label="Playbook (선택)">
          <Select
            placeholder="Playbook을 선택하거나 빈 Run으로 시작"
            allowClear
            onChange={loadPlaybookVars}
            showSearch
            optionFilterProp="label"
            options={playbooks.map((pb) => ({ value: pb.id, label: pb.name }))}
          />
        </Form.Item>

        <Form.Item name="name" label="Run 이름" rules={[{ required: true, message: '필수 항목입니다.' }]}>
          <Input placeholder="예: 2026-05-18 서비스 장애 대응" />
        </Form.Item>

        <Form.Item name="severity" label="심각도" initialValue="none">
          <Select>
            {SEVERITY_OPTIONS.map((s) => (
              <Select.Option key={s.value} value={s.value}>
                <Tag color={s.color} style={{ minWidth: 70 }}>{s.label}</Tag>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="dueAt" label="마감 기한">
          <DatePicker showTime style={{ width: '100%' }} placeholder="선택 (선택사항)" />
        </Form.Item>

        <Form.Item name="participantIds" label="참여자 추가">
          <Select
            mode="multiple"
            placeholder="팀원 선택 (이름·부서 검색)"
            showSearch
            filterOption={filterUserOption}
            options={buildUserOptions(users, getMyDepartment())}
          />
        </Form.Item>

        {variables.length > 0 && (
          <>
            <Divider style={{ margin: '12px 0' }}>변수 입력</Divider>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              단계 내용에서 {'{{변수키}}'} 로 자동 치환됩니다.
            </Text>
            {variables.map((v) => (
              <Form.Item
                key={v.key}
                name={`var_${v.key}`}
                label={v.label || v.key}
                rules={v.required ? [{ required: true, message: `${v.label}은(는) 필수입니다.` }] : []}
              >
                {v.type === 'user' ? (
                  <Select
                    placeholder={`${v.label} 선택`}
                    showSearch
                    filterOption={filterUserOption}
                    options={buildUserOptions(users, getMyDepartment(), { valueKey: 'displayName' })}
                  />
                ) : (
                  <Input placeholder={v.label || v.key} />
                )}
              </Form.Item>
            ))}
          </>
        )}
      </Form>
    </Modal>
  );
}
