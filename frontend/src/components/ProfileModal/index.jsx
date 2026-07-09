import React from 'react';
import { Modal } from 'antd';
import useAuthStore from '../../store/authStore';
import {
  AccountInfoSection, ProfileFieldsSection, AvatarColorSection,
  IdleTimeoutSection, OtpSection,
} from '../../pages/Profile/sections';

/* ── 내 프로필 팝업 ───────────────────────────────────────
   계정 정보 + 조직 정보(관리부서/직책/직급) + 아바타 색상
   + 미사용 화면 잠금 + 2단계 인증(OTP) */
export default function ProfileModal({ open, onClose }) {
  const { user, setUser } = useAuthStore();

  const patchUser = (patch) => {
    if (setUser) setUser({ ...user, ...patch });
  };

  return (
    <Modal
      title="내 프로필"
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden
    >
      <div style={{ marginTop: 12 }}>
        <AccountInfoSection user={user} />
        <ProfileFieldsSection user={user} onChange={patchUser} />
        <AvatarColorSection user={user} onColorChange={(avatarColor) => patchUser({ avatarColor })} />
        <IdleTimeoutSection user={user} onChange={(idleTimeoutMin) => patchUser({ idleTimeoutMin })} />
        <OtpSection totpEnabled={user?.totpEnabled ?? false} />
      </div>
    </Modal>
  );
}
