import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Popconfirm,
  message, Typography, Tag, Row, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, StopOutlined, CheckCircleOutlined,
  KeyOutlined, CrownOutlined, UserOutlined,
} from '@ant-design/icons';
import { getUsers, createUser, updateUser, deactivateUser, activateUser, resetUserPassword } from '../../api/users';

const { Option } = Select;

export default function UsersAdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  /* 비밀번호 초기화 결과 모달 */
  const [resetResult, setResetResult] = useState(null); // { username, tempPassword }

  const load = () => {
    setLoading(true);
    getUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleOpen = (user = null) => {
    setEditTarget(user);
    if (user) {
      form.setFieldsValue({
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        password: '',
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ role: 'member' });
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editTarget) {
        const data = { displayName: values.displayName, role: values.role };
        if (values.password) data.password = values.password;
        await updateUser(editTarget.id, data);
        message.success('사용자가 수정되었습니다.');
      } else {
        await createUser(values);
        message.success('사용자가 생성되었습니다.');
      }

      setModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await deactivateUser(id);
      message.success('계정이 비활성화되었습니다.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || '비활성화에 실패했습니다.');
    }
  };

  const handleActivate = async (id) => {
    try {
      await activateUser(id);
      message.success('계정이 활성화되었습니다.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || '활성화에 실패했습니다.');
    }
  };

  const handleResetPassword = async (record) => {
    try {
      const { tempPassword } = await resetUserPassword(record.id);
      setResetResult({ username: record.username, displayName: record.displayName, tempPassword });
    } catch (err) {
      message.error(err?.response?.data?.error || '비밀번호 초기화에 실패했습니다.');
    }
  };

  const columns = [
    { title: '아이디', dataIndex: 'username', key: 'username', width: 130 },
    { title: '이름', dataIndex: 'displayName', key: 'displayName' },
    {
      title: '권한',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (r) => (
        r === 'admin'
          ? <Tag color="volcano" icon={<CrownOutlined />}>관리자</Tag>
          : <Tag color="blue" icon={<UserOutlined />}>일반사용자</Tag>
      ),
    },
    {
      title: '상태',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (a) => <Tag color={a ? 'green' : 'default'}>{a ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '가입일',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (d) => new Date(d).toLocaleDateString('ko-KR'),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          {/* 수정 */}
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            title="수정"
            onClick={() => handleOpen(record)}
          />
          {/* 비밀번호 초기화 */}
          <Popconfirm
            title={`"${record.displayName}" 의 비밀번호를 초기화하시겠습니까?`}
            description="임시 비밀번호가 생성됩니다. 해당 사용자에게 전달해 주세요."
            onConfirm={() => handleResetPassword(record)}
            okText="초기화"
            cancelText="취소"
          >
            <Button type="text" size="small" icon={<KeyOutlined />} title="비밀번호 초기화" />
          </Popconfirm>
          {/* 활성/비활성 토글 */}
          {record.isActive ? (
            <Popconfirm
              title="계정을 비활성화하시겠습니까?"
              onConfirm={() => handleDeactivate(record.id)}
              okText="비활성화"
              cancelText="취소"
            >
              <Button type="text" size="small" danger icon={<StopOutlined />} title="비활성화" />
            </Popconfirm>
          ) : (
            <Popconfirm
              title="계정을 다시 활성화하시겠습니까?"
              onConfirm={() => handleActivate(record.id)}
              okText="활성화"
              cancelText="취소"
            >
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined />}
                title="활성화"
                style={{ color: '#52c41a' }}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>사용자 관리</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpen()}>
          사용자 추가
        </Button>
      </Row>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={false}
      />

      {/* 사용자 추가/수정 모달 */}
      <Modal
        title={
          <Space>
            {editTarget
              ? <><EditOutlined /> 사용자 수정</>
              : <><PlusOutlined /> 사용자 추가</>}
          </Space>
        }
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="아이디"
            rules={[{ required: true, message: '아이디를 입력하세요.' }]}
          >
            <Input disabled={!!editTarget} placeholder="로그인에 사용할 아이디" />
          </Form.Item>
          <Form.Item
            name="displayName"
            label="이름"
            rules={[{ required: true, message: '이름을 입력하세요.' }]}
          >
            <Input placeholder="화면에 표시될 이름" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editTarget ? '비밀번호 (변경 시에만 입력)' : '비밀번호'}
            rules={[
              ...(!editTarget ? [{ required: true, message: '비밀번호를 입력하세요.' }] : []),
              {
                validator(_, value) {
                  if (!value) return Promise.resolve();
                  if (value.length < 8) return Promise.reject(new Error('비밀번호는 최소 8자리 이상이어야 합니다.'));
                  if (!/[a-z]/.test(value)) return Promise.reject(new Error('소문자를 포함해야 합니다.'));
                  if (!/[A-Z]/.test(value)) return Promise.reject(new Error('대문자를 포함해야 합니다.'));
                  if (!/[0-9]/.test(value)) return Promise.reject(new Error('숫자를 포함해야 합니다.'));
                  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) return Promise.reject(new Error('특수문자를 포함해야 합니다.'));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password placeholder="대/소문자·숫자·특수문자 포함 8자 이상" />
          </Form.Item>
          <Form.Item
            name="role"
            label="권한"
            rules={[{ required: true, message: '권한을 선택하세요.' }]}
          >
            <Select placeholder="권한 선택">
              <Option value="member">
                <Space><UserOutlined />일반사용자</Space>
              </Option>
              <Option value="admin">
                <Space><CrownOutlined />관리자</Space>
              </Option>
            </Select>
          </Form.Item>
          {form.getFieldValue('role') === 'admin' && (
            <Alert
              type="warning"
              showIcon
              message="관리자 권한 부여 시 사용자 관리, 파트 관리, 비밀번호 초기화 등 모든 관리 기능이 활성화됩니다."
              style={{ marginBottom: 0 }}
            />
          )}
        </Form>
      </Modal>

      {/* 비밀번호 초기화 결과 모달 */}
      <Modal
        title={<Space><KeyOutlined />비밀번호 초기화 완료</Space>}
        open={!!resetResult}
        onOk={() => setResetResult(null)}
        onCancel={() => setResetResult(null)}
        okText="확인"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {resetResult && (
          <div style={{ padding: '8px 0' }}>
            <Alert
              type="success"
              showIcon
              message={`"${resetResult.displayName}" (${resetResult.username}) 의 비밀번호가 초기화되었습니다.`}
              style={{ marginBottom: 16 }}
            />
            <Typography.Text>임시 비밀번호</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Typography.Text
                copyable
                code
                style={{ fontSize: 18, letterSpacing: 2 }}
              >
                {resetResult.tempPassword}
              </Typography.Text>
            </div>
            <Alert
              type="warning"
              showIcon
              message="이 임시 비밀번호를 해당 사용자에게 안전하게 전달하고, 로그인 후 즉시 변경하도록 안내하세요."
              style={{ marginTop: 16 }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
