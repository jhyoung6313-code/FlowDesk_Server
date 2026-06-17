import React, { useState } from 'react';
import {
  Modal, Avatar, Tag, Select, Button, Space, Popconfirm, Typography, message, Input,
} from 'antd';
import { UserAddOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { addMember, removeMember } from '../../../api/boards';
import { buildUserOptions, filterUserOption, getMyDepartment } from '../../../utils/userOptions';

const { Text } = Typography;

const ROLE_OPTIONS = [
  { value: 'owner',     label: '소유자',    color: 'blue',    desc: '모든 권한' },
  { value: 'member',    label: '편집자',    color: 'green',   desc: '카드 생성/수정/삭제' },
  { value: 'commenter', label: '댓글 작성', color: 'orange',  desc: '카드 조회 + 댓글만' },
  { value: 'viewer',    label: '뷰어',      color: 'default', desc: '읽기 전용' },
];

function RoleTag({ role }) {
  const r = ROLE_OPTIONS.find(o => o.value === role) ?? { label: role, color: 'default' };
  return <Tag color={r.color} style={{ fontSize: 11 }}>{r.label}</Tag>;
}

export default function MemberManager({
  open, onClose, boardId, members, allUsers, currentUserId, isOwnerOrAdmin, onMembersChange,
}) {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('member');
  const [adding, setAdding] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const memberUserIds = members.map(m => m.userId);
  const nonMembers = allUsers.filter(u => !memberUserIds.includes(u.id));
  const filteredMembers = memberSearch.trim()
    ? members.filter(m => m.user?.displayName?.toLowerCase().includes(memberSearch.toLowerCase()))
    : members;

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      const m = await addMember(boardId, { userId: selectedUserId, role: selectedRole });
      onMembersChange([...members, m]);
      setSelectedUserId(null);
      setSelectedRole('member');
    } catch {
      message.error('멤버 추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setUpdatingId(userId);
    try {
      const m = await addMember(boardId, { userId, role: newRole });
      onMembersChange(members.map(mb => mb.userId === userId ? { ...mb, role: newRole } : mb));
    } catch {
      message.error('역할 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (userId) => {
    try {
      await removeMember(boardId, userId);
      onMembersChange(members.filter(m => m.userId !== userId));
    } catch {
      message.error('멤버 제거에 실패했습니다.');
    }
  };

  return (
    <Modal
      title="멤버 관리"
      open={open}
      onCancel={() => { setMemberSearch(''); onClose(); }}
      footer={null}
      width={480}
    >
      {members.length > 4 && (
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="멤버 이름 검색"
          value={memberSearch}
          onChange={e => setMemberSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
          size="small"
        />
      )}

      <div style={{ marginBottom: 16 }}>
        {filteredMembers.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#bbb', padding: '16px 0', fontSize: 13 }}>검색 결과 없음</div>
        ) : filteredMembers.map(m => (
          <div
            key={m.userId}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}
          >
            <Space>
              <Avatar style={{ backgroundColor: m.user?.avatarColor || '#1677ff', fontSize: 12 }} size="small">
                {m.user?.displayName?.[0]}
              </Avatar>
              <div>
                <Text>{m.user?.displayName}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {ROLE_OPTIONS.find(r => r.value === m.role)?.desc ?? m.role}
                </Text>
              </div>
            </Space>

            <Space>
              {/* owner가 아닌 멤버의 역할 변경 (isOwnerOrAdmin만 가능) */}
              {isOwnerOrAdmin && m.role !== 'owner' ? (
                <Select
                  size="small"
                  value={m.role}
                  style={{ width: 100 }}
                  loading={updatingId === m.userId}
                  onChange={v => handleRoleChange(m.userId, v)}
                >
                  {ROLE_OPTIONS.filter(r => r.value !== 'owner').map(r => (
                    <Select.Option key={r.value} value={r.value}>
                      <Tag color={r.color} style={{ fontSize: 11, margin: 0 }}>{r.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              ) : (
                <RoleTag role={m.role} />
              )}

              {isOwnerOrAdmin && m.role !== 'owner' && m.userId !== currentUserId && (
                <Popconfirm
                  title="멤버를 제거할까요?"
                  onConfirm={() => handleRemove(m.userId)}
                  okText="제거" cancelText="취소" okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          </div>
        ))}
      </div>

      {/* 역할 설명 */}
      <div style={{ background: '#f9f9f9', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600 }}>역할 안내</Text>
        {ROLE_OPTIONS.map(r => (
          <div key={r.value} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
            <Tag color={r.color} style={{ fontSize: 10, margin: 0 }}>{r.label}</Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.desc}</Text>
          </div>
        ))}
      </div>

      {isOwnerOrAdmin && nonMembers.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <Select
            style={{ flex: 1 }}
            placeholder="멤버 추가 (이름·부서 검색)"
            value={selectedUserId}
            onChange={setSelectedUserId}
            showSearch
            filterOption={filterUserOption}
            options={buildUserOptions(nonMembers, getMyDepartment())}
          />
          <Select value={selectedRole} onChange={setSelectedRole} style={{ width: 100 }}>
            {ROLE_OPTIONS.filter(r => r.value !== 'owner').map(r => (
              <Select.Option key={r.value} value={r.value}>{r.label}</Select.Option>
            ))}
          </Select>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            loading={adding}
            onClick={handleAdd}
            disabled={!selectedUserId}
          >
            추가
          </Button>
        </div>
      )}
    </Modal>
  );
}
