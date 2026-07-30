import React, { useEffect, useState } from 'react';
import {
  Table, Button, Input, Space, Popconfirm, message, Typography, Row, Form, Modal, Tag, Select,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined, TeamOutlined,
} from '@ant-design/icons';
import {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  createTeam, updateTeam, deleteTeam,
} from '../../api/org';

export default function DepartmentsAdminPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // 부서 모달
  const [deptModal, setDeptModal] = useState(false);
  const [deptTarget, setDeptTarget] = useState(null);
  const [deptForm] = Form.useForm();

  // 팀 모달
  const [teamModal, setTeamModal] = useState(false);
  const [teamTarget, setTeamTarget] = useState(null); // 편집 대상 팀
  const [teamDeptId, setTeamDeptId] = useState(null); // 신규 팀 소속 부서
  const [teamForm] = Form.useForm();

  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getDepartments().then(setDepartments).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  /* ── 부서 ─────────────────────────────── */
  const openDept = (dept = null) => {
    setDeptTarget(dept);
    deptForm.resetFields();
    if (dept) deptForm.setFieldsValue({ name: dept.name, description: dept.description });
    setDeptModal(true);
  };

  const submitDept = async () => {
    try {
      const values = await deptForm.validateFields();
      setSaving(true);
      if (deptTarget) {
        await updateDepartment(deptTarget.id, values);
        message.success('부서가 수정되었습니다.');
      } else {
        await createDepartment(values);
        message.success('부서가 등록되었습니다.');
      }
      setDeptModal(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const removeDept = async (id) => {
    try {
      await deleteDepartment(id);
      message.success('부서가 삭제되었습니다.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || '삭제에 실패했습니다.');
    }
  };

  /* ── 팀 ───────────────────────────────── */
  const openTeam = (deptId, team = null) => {
    setTeamTarget(team);
    setTeamDeptId(deptId);
    teamForm.resetFields();
    teamForm.setFieldsValue({
      departmentId: team ? team.departmentId : deptId,
      name: team?.name,
      description: team?.description,
    });
    setTeamModal(true);
  };

  const submitTeam = async () => {
    try {
      const values = await teamForm.validateFields();
      setSaving(true);
      if (teamTarget) {
        await updateTeam(teamTarget.id, values);
        message.success('팀이 수정되었습니다.');
      } else {
        await createTeam(values);
        message.success('팀이 등록되었습니다.');
      }
      setTeamModal(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const removeTeam = async (id) => {
    try {
      await deleteTeam(id);
      message.success('팀이 삭제되었습니다.');
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || '삭제에 실패했습니다.');
    }
  };

  /* ── 컬럼 ─────────────────────────────── */
  const columns = [
    {
      title: '부서명', dataIndex: 'name', key: 'name', width: 200,
      render: (v) => <Space><ApartmentOutlined style={{ color: '#1677ff' }} /><strong>{v}</strong></Space>,
    },
    { title: '설명', dataIndex: 'description', key: 'description', render: (v) => v || <Typography.Text type="secondary">-</Typography.Text> },
    { title: '팀 수', key: 'teamCount', width: 70, align: 'center', render: (_, r) => r.teams?.length ?? 0 },
    { title: '인원', key: 'userCount', width: 70, align: 'center', render: (_, r) => r._count?.users ?? 0 },
    {
      title: '', key: 'actions', width: 150,
      render: (_, record) => (
        <Space>
          <Button type="text" size="small" icon={<TeamOutlined />} onClick={() => openTeam(record.id)}>팀 추가</Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openDept(record)} />
          <Popconfirm
            title="부서를 삭제하시겠습니까?"
            description="소속 팀도 함께 삭제되며, 연결된 업무·사용자의 팀 정보는 해제됩니다."
            onConfirm={() => removeDept(record.id)}
            okText="삭제" cancelText="취소"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const expandedRow = (dept) => {
    if (!dept.teams?.length) {
      return <Typography.Text type="secondary" style={{ paddingLeft: 8 }}>등록된 팀이 없습니다.</Typography.Text>;
    }
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        {dept.teams.map((t) => (
          <Row key={t.id} align="middle" justify="space-between" style={{ paddingLeft: 8 }}>
            <Space>
              <TeamOutlined style={{ color: '#52c41a' }} />
              <span>{t.name}</span>
              {t.description && <Typography.Text type="secondary" style={{ fontSize: 13 }}>{t.description}</Typography.Text>}
              <Tag>업무 {t._count?.tasks ?? 0}</Tag>
              <Tag>인원 {t._count?.users ?? 0}</Tag>
            </Space>
            <Space>
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openTeam(dept.id, t)} />
              <Popconfirm
                title="팀을 삭제하시겠습니까?"
                description="연결된 업무·사용자의 팀 정보는 해제됩니다."
                onConfirm={() => removeTeam(t.id)}
                okText="삭제" cancelText="취소"
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          </Row>
        ))}
      </Space>
    );
  };

  return (
    <div>
      <Row align="middle" justify="space-between" className="fd-toolbar" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>부서 · 팀 관리</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openDept()}>부서 추가</Button>
      </Row>

      <Table
        dataSource={departments}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={false}
        expandable={{ expandedRowRender: expandedRow, defaultExpandAllRows: true }}
      />

      {/* 부서 모달 */}
      <Modal
        title={deptTarget ? '부서 수정' : '부서 추가'}
        open={deptModal}
        onOk={submitDept}
        onCancel={() => setDeptModal(false)}
        okText="저장" cancelText="취소"
        confirmLoading={saving}
      >
        <Form form={deptForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="부서명" rules={[{ required: true, message: '부서명을 입력하세요.' }]}>
            <Input placeholder="예: 경영지원부, 개발부" />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 팀 모달 */}
      <Modal
        title={teamTarget ? '팀 수정' : '팀 추가'}
        open={teamModal}
        onOk={submitTeam}
        onCancel={() => setTeamModal(false)}
        okText="저장" cancelText="취소"
        confirmLoading={saving}
      >
        <Form form={teamForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="departmentId" label="소속 부서" rules={[{ required: true, message: '부서를 선택하세요.' }]}>
            <Select placeholder="부서 선택"
              options={departments.map((d) => ({ label: d.name, value: d.id }))} />
          </Form.Item>
          <Form.Item name="name" label="팀명" rules={[{ required: true, message: '팀명을 입력하세요.' }]}>
            <Input placeholder="예: 개발1팀, 회계팀" />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
