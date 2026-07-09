import React from 'react';
import { Modal } from 'antd';
import { ChangePasswordForm } from '../../pages/Profile/sections';

/* ── 비밀번호 변경 팝업 ─────────────────────────────────── */
export default function ChangePasswordModal({ open, onClose }) {
  return (
    <Modal
      title="비밀번호 변경"
      open={open}
      onCancel={onClose}
      footer={null}
      width={460}
      destroyOnHidden
    >
      <div style={{ marginTop: 12 }}>
        <ChangePasswordForm onSuccess={onClose} />
      </div>
    </Modal>
  );
}
