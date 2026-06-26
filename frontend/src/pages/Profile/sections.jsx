import React, { useState } from 'react';
import {
  Card, Form, Input, Button, Typography, message, Divider, Descriptions, Tag,
  Avatar, Space, Tooltip, Select,
} from 'antd';
import {
  LockOutlined, UserOutlined, SafetyOutlined, QrcodeOutlined, CheckCircleOutlined,
  BgColorsOutlined, FieldTimeOutlined, IdcardOutlined,
} from '@ant-design/icons';
import { changePassword, setupOtp, verifySetupOtp, disableOtp, updateIdleTimeout, updateMyProfile } from '../../api/auth';
import { updateMyAvatarColor } from '../../api/users';
import { getAvatarColor, AVATAR_COLOR_PRESETS } from '../../utils/colors';

// 미사용 화면 잠금 시간 프리셋(분). 백엔드 ALLOWED_IDLE_TIMEOUTS와 일치해야 함
const IDLE_TIMEOUT_OPTIONS = [
  { value: 0, label: '사용 안 함' },
  { value: 10, label: '10분' },
  { value: 30, label: '30분' },
  { value: 60, label: '1시간' },
  { value: 120, label: '2시간' },
  { value: 240, label: '4시간' },
];
const DEFAULT_IDLE_TIMEOUT = 60;
const PROFILE_FIELD_MAX_LEN = 100;

/* ── 계정 정보 카드 ─────────────────────────────────────── */
export function AccountInfoSection({ user }) {
  return (
    <Card style={{ marginBottom: 24, borderRadius: 8 }}>
      <Descriptions title={<span><UserOutlined style={{ marginRight: 8 }} />계정 정보</span>} column={1} size="small">
        <Descriptions.Item label="아이디">{user?.username}</Descriptions.Item>
        <Descriptions.Item label="이름">{user?.displayName}</Descriptions.Item>
        <Descriptions.Item label="권한">
          {user?.role === 'admin'
            ? <Tag color="red">관리자</Tag>
            : <Tag color="blue">일반 사용자</Tag>}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

/* ── 조직 정보(관리부서·직책·직급) 편집 카드 ────────────── */
export function ProfileFieldsSection({ user, onChange }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const saved = await updateMyProfile({
        department: values.department,
        position: values.position,
        jobGrade: values.jobGrade,
      });
      message.success('프로필 정보가 저장되었습니다.');
      onChange?.(saved);
    } catch (err) {
      message.error(err?.response?.data?.error || '프로필 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={<span><IdcardOutlined style={{ marginRight: 8 }} />조직 정보</span>}
      style={{ borderRadius: 8, marginBottom: 24 }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          department: user?.department || '',
          position: user?.position || '',
          jobGrade: user?.jobGrade || '',
        }}
      >
        <Form.Item name="department" label="관리부서" rules={[{ max: PROFILE_FIELD_MAX_LEN, message: `${PROFILE_FIELD_MAX_LEN}자 이하로 입력하세요.` }]}>
          <Input placeholder="예) 경영지원팀" allowClear />
        </Form.Item>
        <Form.Item name="position" label="직책" rules={[{ max: PROFILE_FIELD_MAX_LEN, message: `${PROFILE_FIELD_MAX_LEN}자 이하로 입력하세요.` }]}>
          <Input placeholder="예) 팀장 / 파트장" allowClear />
        </Form.Item>
        <Form.Item name="jobGrade" label="직급" rules={[{ max: PROFILE_FIELD_MAX_LEN, message: `${PROFILE_FIELD_MAX_LEN}자 이하로 입력하세요.` }]}>
          <Input placeholder="예) 차장 / 대리" allowClear />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            저장
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

/* ── 미사용 화면 잠금 카드 ─────────────────────────────── */
export function IdleTimeoutSection({ user, onChange }) {
  const [saving, setSaving] = useState(false);
  const value = user?.idleTimeoutMin ?? DEFAULT_IDLE_TIMEOUT;

  const handleSelect = async (next) => {
    setSaving(true);
    try {
      await updateIdleTimeout(next);
      message.success('미사용 잠금 시간이 변경되었습니다.');
      onChange(next);
    } catch (err) {
      message.error(err?.response?.data?.error || '설정 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={<span><FieldTimeOutlined style={{ marginRight: 8 }} />미사용 화면 잠금</span>}
      style={{ borderRadius: 8, marginBottom: 24 }}
    >
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        설정한 시간 동안 활동이 없으면 화면이 자동으로 잠깁니다. 잠금 해제는 비밀번호로 합니다.
        <br />(자정이 지나면 일자 전환을 위해 자동 로그아웃됩니다.)
      </Typography.Text>
      <Select
        value={value}
        onChange={handleSelect}
        loading={saving}
        disabled={saving}
        options={IDLE_TIMEOUT_OPTIONS}
        style={{ width: 200 }}
      />
    </Card>
  );
}

/* ── OTP 설정 카드 ─────────────────────────────────────── */
export function OtpSection({ totpEnabled: initialEnabled }) {
  const [step, setStep] = useState('idle');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);

  const handleSetupStart = async () => {
    setLoading(true);
    try {
      const data = await setupOtp();
      setQrDataUrl(data.qrDataUrl);
      setOtpCode('');
      setStep('qr');
    } catch (err) {
      message.error(err?.response?.data?.error || 'QR 코드 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otpCode || otpCode.length !== 6) {
      message.warning('6자리 OTP 코드를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      await verifySetupOtp(otpCode);
      message.success('OTP가 활성화되었습니다.');
      setEnabled(true);
      setStep('idle');
      setOtpCode('');
    } catch (err) {
      message.error(err?.response?.data?.error || 'OTP 코드가 올바르지 않습니다.');
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!otpCode || otpCode.length !== 6) {
      message.warning('6자리 OTP 코드를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      await disableOtp(otpCode);
      message.success('OTP가 해제되었습니다.');
      setEnabled(false);
      setStep('idle');
      setOtpCode('');
    } catch (err) {
      message.error(err?.response?.data?.error || 'OTP 코드가 올바르지 않습니다.');
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setStep('idle');
    setOtpCode('');
    setQrDataUrl('');
  };

  return (
    <Card
      title={<span><SafetyOutlined style={{ marginRight: 8 }} />2단계 인증 (OTP)</span>}
      style={{ borderRadius: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: step === 'idle' ? 0 : 20 }}>
        {enabled ? (
          <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 14, padding: '4px 10px' }}>
            활성화됨
          </Tag>
        ) : (
          <Tag color="default" style={{ fontSize: 14, padding: '4px 10px' }}>
            비활성화됨
          </Tag>
        )}
        {step === 'idle' && (
          enabled ? (
            <Button danger size="small" onClick={() => { setStep('disable'); setOtpCode(''); }}>
              OTP 해제
            </Button>
          ) : (
            <Button type="primary" size="small" icon={<QrcodeOutlined />} loading={loading} onClick={handleSetupStart}>
              OTP 설정
            </Button>
          )
        )}
      </div>

      {step === 'qr' && (
        <div style={{ textAlign: 'center' }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Google Authenticator 앱으로 아래 QR 코드를 스캔하세요.
          </Typography.Text>
          <img
            src={qrDataUrl}
            alt="OTP QR Code"
            style={{ width: 180, height: 180, border: '1px solid var(--fd-border)', borderRadius: 8, marginBottom: 16 }}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            스캔 후 앱에 표시된 6자리 코드를 입력하세요.
          </Typography.Text>
          <Input
            size="large" maxLength={6} placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            onPressEnter={handleVerify}
            style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20, maxWidth: 200 }}
            autoFocus
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Button onClick={handleCancel}>취소</Button>
            <Button type="primary" loading={loading} onClick={handleVerify}>인증 완료</Button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div style={{ textAlign: 'center' }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            OTP를 해제하려면 현재 앱의 6자리 코드를 입력하세요.
          </Typography.Text>
          <Input
            size="large" maxLength={6} placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            onPressEnter={handleDisable}
            style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20, maxWidth: 200 }}
            autoFocus
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Button onClick={handleCancel}>취소</Button>
            <Button danger loading={loading} onClick={handleDisable}>OTP 해제</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── 아바타 색상 카드 ───────────────────────────────────── */
export function AvatarColorSection({ user, onColorChange }) {
  const [saving, setSaving] = useState(false);
  const currentColor = getAvatarColor(user?.id, user?.avatarColor);

  const handleSelect = async (color) => {
    setSaving(true);
    try {
      await updateMyAvatarColor(color);
      message.success('아바타 색상이 변경되었습니다.');
      onColorChange(color);
    } catch (err) {
      message.error(err?.response?.data?.error || '색상 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={<span><BgColorsOutlined style={{ marginRight: 8 }} />아바타 색상</span>}
      style={{ borderRadius: 8, marginBottom: 24 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Avatar
          size={52}
          style={{ backgroundColor: currentColor, fontSize: 22, fontWeight: 700, flexShrink: 0 }}
        >
          {user?.displayName?.slice(0, 1)}
        </Avatar>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          색상을 선택하면 모든 화면의 아바타에 즉시 반영됩니다.
        </Typography.Text>
      </div>
      <Space wrap>
        {AVATAR_COLOR_PRESETS.map((color) => (
          <Tooltip key={color} title={color}>
            <div
              onClick={() => !saving && handleSelect(color)}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: color,
                cursor: saving ? 'not-allowed' : 'pointer',
                border: currentColor === color ? '3px solid #000' : '2px solid transparent',
                boxShadow: currentColor === color ? '0 0 0 2px #fff inset' : undefined,
                transition: 'transform 0.15s',
              }}
              onMouseEnter={(e) => { if (!saving) e.currentTarget.style.transform = 'scale(1.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            />
          </Tooltip>
        ))}
      </Space>
    </Card>
  );
}

/* ── 비밀번호 변경 폼 ───────────────────────────────────── */
export function ChangePasswordForm({ onSuccess, footer }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      message.success('비밀번호가 성공적으로 변경되었습니다.');
      form.resetFields();
      onSuccess?.();
    } catch (err) {
      message.error(err?.response?.data?.error || '비밀번호 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item
        name="currentPassword"
        label="현재 비밀번호"
        rules={[{ required: true, message: '현재 비밀번호를 입력하세요.' }]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="현재 비밀번호"
          autoComplete="current-password"
        />
      </Form.Item>

      <Divider style={{ margin: '8px 0 16px' }} />

      <Form.Item
        name="newPassword"
        label="새 비밀번호"
        rules={[
          { required: true, message: '새 비밀번호를 입력하세요.' },
          { min: 9, message: '비밀번호는 9자 이상이어야 합니다.' },
          {
            validator: (_, value) => {
              if (!value) return Promise.resolve();
              const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
              return classes >= 3
                ? Promise.resolve()
                : Promise.reject(new Error('영대문자·영소문자·숫자·특수문자 중 3종류 이상 포함해야 합니다.'));
            },
          },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="새 비밀번호 (9자 이상, 영문·숫자·특수문자 조합)"
          autoComplete="new-password"
        />
      </Form.Item>

      <Form.Item
        name="confirmPassword"
        label="새 비밀번호 확인"
        rules={[{ required: true, message: '새 비밀번호를 다시 입력하세요.' }]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="새 비밀번호 확인"
          autoComplete="new-password"
        />
      </Form.Item>

      <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
        {footer || (
          <Button type="primary" htmlType="submit" loading={loading}>
            비밀번호 변경
          </Button>
        )}
      </Form.Item>
    </Form>
  );
}
