import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Input, Modal, Form, DatePicker, Tag, Space, message, Tooltip, Spin,
} from 'antd';
import ResizableDrawer from '../../components/common/ResizableDrawer';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined,
  FolderOutlined, SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as wbsApi from '../../api/wbs';
import useAuthStore from '../../store/authStore';
import WbsPage from './index';

const { RangePicker } = DatePicker;

/* ── 역할 담당자 편집기 ── */
function MemberEditor({ members, onChange }) {
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState('');
  const [name, setName] = useState('');

  const handleAdd = () => {
    if (!role.trim() || !name.trim()) return;
    onChange([...members, { role: role.trim(), memberName: name.trim() }]);
    setRole(''); setName(''); setAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {members.map((m, i) => (
        <Tag key={i} closable onClose={() => onChange(members.filter((_, idx) => idx !== i))} style={{ fontSize: 12 }}>
          <span style={{ color: '#888', marginRight: 4 }}>{m.role}</span>
          <span style={{ fontWeight: 600 }}>{m.memberName}</span>
        </Tag>
      ))}
      {adding ? (
        <Space size={4}>
          <Input size="small" placeholder="역할 (PM/PL...)" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 100 }} />
          <Input size="small" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={handleAdd} style={{ width: 80 }} />
          <Button size="small" type="primary" onClick={handleAdd}>확인</Button>
          <Button size="small" onClick={() => setAdding(false)}>취소</Button>
        </Space>
      ) : (
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setAdding(true)}>담당자 추가</Button>
      )}
    </div>
  );
}

export default function WbsWorkspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const selectedId = projectId ? Number(projectId) : null;

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 생성/수정 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [members, setMembers] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      setProjects(await wbsApi.getProjects());
    } catch {
      message.error('프로젝트 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = (proj = null) => {
    setEditing(proj);
    if (proj) {
      form.setFieldsValue({
        name: proj.name,
        period: [proj.startDate ? dayjs(proj.startDate) : null, proj.endDate ? dayjs(proj.endDate) : null],
        description: proj.description,
      });
      setMembers(proj.members || []);
    } else {
      form.resetFields();
      setMembers([]);
    }
    setModalOpen(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        name: values.name,
        startDate: values.period?.[0]?.format('YYYY-MM-DD') || null,
        endDate: values.period?.[1]?.format('YYYY-MM-DD') || null,
        description: values.description || null,
        members,
      };
      if (editing) {
        await wbsApi.updateProject(editing.id, payload);
        message.success('프로젝트가 수정되었습니다.');
      } else {
        const created = await wbsApi.createProject(payload);
        message.success('프로젝트가 생성되었습니다.');
        navigate(`/wbs/${created.id}`);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      if (err?.errorFields) return;
      message.error('저장에 실패했습니다.');
    }
  };

  const handleDelete = (proj) => {
    Modal.confirm({
      title: `"${proj.name}" 프로젝트를 삭제할까요?`,
      content: '프로젝트의 모든 WBS·이슈가 함께 삭제됩니다.',
      okText: '삭제', cancelText: '취소', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await wbsApi.deleteProject(proj.id);
          message.success('삭제되었습니다.');
          if (selectedId === proj.id) navigate('/wbs');
          load();
        } catch {
          message.error('삭제에 실패했습니다.');
        }
      },
    });
  };

  const filtered = projects.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--fd-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--fd-border)' }}>
      {/* ── 좌측 프로젝트 목록 ── */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--fd-border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700 }}>
              <ApartmentOutlined /> 프로젝트
            </span>
            {isAdmin && (
              <Tooltip title="새 프로젝트">
                <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 18 }} />} onClick={() => openModal()} />
              </Tooltip>
            )}
          </div>
          <Input
            size="small"
            placeholder="프로젝트 검색..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {loading ? (
            <Spin style={{ display: 'block', margin: '40px auto' }} />
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 13 }}>
              <ApartmentOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
              프로젝트가 없습니다.
              {isAdmin && <><br />새 프로젝트를 만들어 보세요.</>}
            </div>
          ) : (
            filtered.map((proj) => {
              const active = proj.id === selectedId;
              return (
                <div
                  key={proj.id}
                  onClick={() => navigate(`/wbs/${proj.id}`)}
                  className="fd-wbs-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                    padding: '7px 8px', borderRadius: 6, fontSize: 14, marginBottom: 1,
                    background: active ? '#e6f4ff' : 'transparent',
                    color: active ? '#1677ff' : 'var(--fd-text-primary)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <FolderOutlined style={{ flexShrink: 0, color: active ? '#1677ff' : '#52c41a' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={proj.name}>
                    {proj.name}
                  </span>
                  {isAdmin && (
                    <span className="fd-wbs-actions" style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="수정">
                        <EditOutlined style={{ color: '#43a047', fontSize: 13 }} onClick={() => openModal(proj)} />
                      </Tooltip>
                      <Tooltip title="삭제">
                        <DeleteOutlined style={{ color: '#ff4d4f', fontSize: 13 }} onClick={() => handleDelete(proj)} />
                      </Tooltip>
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── 우측 WBS 내용 ── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        <WbsPage />
      </div>

      {/* ── 프로젝트 생성/수정 드로어 (오른쪽 슬라이드) ── */}
      <ResizableDrawer
        title={editing ? '프로젝트 수정' : '새 프로젝트'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        placement="right"
        width={480}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setModalOpen(false)}>취소</Button>
            <Button type="primary" onClick={handleOk}>저장</Button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="프로젝트명" rules={[{ required: true, message: '필수 항목입니다.' }]}>
            <Input placeholder="프로젝트명을 입력하세요" />
          </Form.Item>
          <Form.Item name="period" label="프로젝트 기간">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="프로젝트 설명 (선택)" />
          </Form.Item>
          <Form.Item label="역할 담당자">
            <MemberEditor members={members} onChange={setMembers} />
          </Form.Item>
        </Form>
      </ResizableDrawer>

      <style>{`
        .fd-wbs-row .fd-wbs-actions { opacity: 0; transition: opacity .12s; }
        .fd-wbs-row:hover .fd-wbs-actions { opacity: 1; }
        .fd-wbs-row:hover { background: #f5f7fa; }
      `}</style>
    </div>
  );
}
