import React from 'react';
import { Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Card } from 'antd';
import useAuthStore from '../../store/authStore';
import {
  AccountInfoSection, ProfileFieldsSection, AvatarColorSection,
  IdleTimeoutSection, OtpSection, ChangePasswordForm,
} from './sections';

/* ── 프로필 페이지 (비밀번호 강제 변경 플로우 등에서 사용) ── */
export default function ProfilePage() {
  const { user, setUser } = useAuthStore();

  const patchUser = (patch) => {
    if (setUser) setUser({ ...user, ...patch });
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>
        내 프로필
      </Typography.Title>

      <AccountInfoSection user={user} />
      <ProfileFieldsSection user={user} onChange={patchUser} />
      <AvatarColorSection user={user} onColorChange={(avatarColor) => patchUser({ avatarColor })} />
      <IdleTimeoutSection user={user} onChange={(idleTimeoutMin) => patchUser({ idleTimeoutMin })} />

      <div style={{ marginBottom: 24 }}>
        <OtpSection totpEnabled={user?.totpEnabled ?? false} />
      </div>

      <Card
        title={<span><LockOutlined style={{ marginRight: 8 }} />비밀번호 변경</span>}
        style={{ borderRadius: 8 }}
      >
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
