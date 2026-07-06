import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Popconfirm,
  message, Typography, Tag, Row, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, StopOutlined, CheckCircleOutlined,
  KeyOutlined, CrownOutlined, UserOutlined, LockOutlined, UnlockOutlined, SafetyOutlined,
} from '@ant-design/icons';
import { getUsers, createUser, updateUser, deactivateUser, activateUser, resetUserPassword } from '../../api/users';
import { unlockUser, getPermissions } from '../../api/admin';
import { getDepartments } from '../../api/org';

const { Option } = Select;

export default function UsersAdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [permissionOptions, setPermissionOptions] = useState([]); // 부여 가능한 권한 그룹
  const selectedDeptId = Form.useWatch('departmentId', form);
  const teamOptions = (departments.find((d) => d.id === selectedDeptId)?.teams || [])
    .map((t) => ({ label: t.name, value: t.id }));

  /* 비밀번호 초기화 결과 모달 */
  const [resetResult, setResetResult] = useState(null); // { username, tempPassword }

  const load = () => {
    setLoading(true);
    getUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getDepartments().then(setDepartments).catch(() => {});
    getPermissions().then(setPermissionOptions).catch(() => {});
  }, []);

  const handleOpen = (user = null) => {
    setEditTarget(user);
    if (user) {
      form.setFieldsValue({
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        password: '',
        departmentId: user.departmentId ?? undefined,
        teamId: user.teamId ?? undefined,
        position: user.position ?? undefined,
        jobGrade: user.jobGrade ?? undefined,
        permissions: user.permissions ?? [],
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ role: 'member', permissions: [] });
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editTarget) {
        const data = {
          displayName: values.displayName,
          role: values.role,
          departmentId: values.departmentId ?? null,
          teamId: values.teamId ?? null,
          position: values.position ?? null,
          jobGrade: values.jobGrade ?? null,
          permissions: values.permissions ?? [],
        };
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

  const handleUnlock = async (record) => {
    try {
      await unlockUser(record.id);
      message.success(`"${record.displayName}" 계정 잠금이 해제되었습니다.`);
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || '잠금 해제에 실패했습니다.');
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
      title: '부서 / 팀',
      key: 'org',
      width: 200,
      render: (_, r) => {
        const dept = r.department?.name;
        const team = r.team?.name;
        if (!dept && !team) return <Typography.Text type="secondary">-</Typography.Text>;
        return (
          <Space size={4} wrap>
            {dept && <Tag color="blue">{dept}</Tag>}
            {team && <Tag color="green">{team}</Tag>}
          </Space>
        );
      },
    },
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
      title: '추가 권한',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 140,
      render: (perms) => {
        if (!perms || perms.length === 0) return <Typography.Text type="secondary">-</Typography.Text>;
        return (
          <Space size={4} wrap>
            {perms.map((k) => {
              const p = permissionOptions.find((x) => x.key === k);
              return <Tag color="purple" key={k}>{p?.label || k}</Tag>;
            })}
          </Space>
        );
      },
    },
    {
      title: '상태',
      key: 'status',
      width: 130,
      render: (_, r) => {
        const isLocked = r.lockedUntil && new Date(r.lockedUntil) > new Date();
        return (
          <Space size={4} wrap>
            <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '활성' : '비활성'}</Tag>
            {isLocked && <Tag color="red" icon={<LockOutlined />}>잠김</Tag>}
            {r.totpEnabled && <Tag color="geekblue" icon={<SafetyOutlined />}>OTP</Tag>}
          </Space>
        );
      },
    },
    {
      title: '최근 로그인',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 150,
      render: (d) =>
        d ? (
          new Date(d).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
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
      width: 170,
      render: (_, record) => {
        const isLocked = record.lockedUntil && new Date(record.lockedUntil) > new Date();
        return (
        <Space>
          {/* 계정 잠금 해제 (잠긴 경우만) */}
          {isLocked && (
            <Popconfirm
              title={`"${record.displayName}" 계정의 잠금을 해제하시겠습니까?`}
              description="로그인 실패 횟수가 초기화됩니다."
              onConfirm={() => handleUnlock(record)}
              okText="잠금 해제"
              cancelText="취소"
            >
              <Button type="text" size="small" icon={<UnlockOutlined />} title="잠금 해제" style={{ color: '#fa8c16' }} />
            </Popconfirm>
          )}
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
        );
      },
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
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={(changed) => {
            // 부서를 바꾸면 기존 팀 선택을 해제한다
            if ('departmentId' in changed) form.setFieldValue('teamId', undefined);
          }}
        >
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
          <Form.Item
            name="permissions"
            label="추가 권한 (감사권한 등)"
            tooltip="role(관리자/일반)과 별개로 부여하는 권한입니다. 예: 일반사용자 + 개인정보 감사권한"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="부여할 권한 그룹 선택 (선택)"
              options={permissionOptions.map((p) => ({ label: p.label, value: p.key }))}
              optionRender={(opt) => {
                const p = permissionOptions.find((x) => x.key === opt.value);
                return (
                  <Space direction="vertical" size={0}>
                    <span>{p?.label}</span>
                    {p?.desc && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{p.desc}</Typography.Text>}
                  </Space>
                );
              }}
            />
          </Form.Item>
          <Form.Item name="departmentId" label="부서">
            <Select
              placeholder="부서 선택 (선택)"
              allowClear
              options={departments.map((d) => ({ label: d.name, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="teamId" label="팀">
            <Select
              placeholder={selectedDeptId ? '팀 선택 (선택)' : '먼저 부서를 선택하세요'}
              allowClear
              disabled={!selectedDeptId}
              options={teamOptions}
            />
          </Form.Item>
          <Form.Item
            name="position"
            label="직책"
            tooltip="전자결재 결재선 프리셋(직급 규칙)에 사용됩니다. 예) 팀장, 매니저"
            rules={[{ max: 100, message: '100자 이하로 입력하세요.' }]}
          >
            <Input placeholder="예) 팀장 / 매니저 (선택)" allowClear />
          </Form.Item>
          <Form.Item
            name="jobGrade"
            label="직급"
            rules={[{ max: 100, message: '100자 이하로 입력하세요.' }]}
          >
            <Input placeholder="예) 차장 / 대리 (선택)" allowClear />
          </Form.Item>
          {form.getFieldValue('role') === 'admin' && (
            <Alert
              type="warning"
              showIcon
              message="관리자 권한 부여 시 사용자 관리, 부서·팀 관리, 비밀번호 초기화 등 모든 관리 기능이 활성화됩니다."
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
