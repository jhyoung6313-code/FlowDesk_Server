import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, message, Tabs, Steps, Result } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import useAuthStore from '../../store/authStore';
import * as authApi from '../../api/auth';
import './login.css';

/* ── Flowdesk 로고 아이콘 ── */
function FlowdeskIcon({ size = 28, color = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 11 Q7.5 5 12 11 Q16.5 17 21 11" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M18.5 8.5 L21.5 11 L18.5 13.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="2" y="19" width="24" height="3.5" rx="1.75" fill={color} />
      <rect x="11.5" y="15.5" width="5" height="4.5" rx="1" fill={color} opacity="0.55" />
    </svg>
  );
}


/* ══════════════════════════════════════════════
   로그인 탭
══════════════════════════════════════════════ */
function LoginTab({ onSuccess }) {
  const { setAuth } = useAuthStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // step: 'login' | 'otp'(기존 OTP 검증) | 'otp-setup'(미등록 사용자 최초 등록)
  const [step, setStep] = useState('login');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // 로그인 성공 후처리: 비밀번호 변경 강제 여부 확인
  const finishLogin = (data) => {
    setAuth(data.token, data.user);
    if (data.mustChangePassword) {
      message.warning('보안 정책에 따라 비밀번호를 변경해야 합니다.');
      onSuccess('/profile');
    } else {
      onSuccess();
    }
  };

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const data = await authApi.login(values.username, values.password);
      if (data.requireTotpSetup) {
        // OTP 전사 강제인데 미등록 → 등록 단계로
        setPreAuthToken(data.preAuthToken);
        const setup = await authApi.setupLoginTotp(data.preAuthToken);
        setQrDataUrl(setup.qrDataUrl);
        setStep('otp-setup');
      } else if (data.requireTotp) {
        setPreAuthToken(data.preAuthToken);
        setStep('otp');
      } else {
        finishLogin(data);
      }
    } catch (err) {
      message.error(err?.response?.data?.error || '아이디 또는 비밀번호를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otpCode || otpCode.length !== 6) {
      message.warning('6자리 OTP 코드를 입력하세요.');
      return;
    }
    setOtpLoading(true);
    try {
      const data = step === 'otp-setup'
        ? await authApi.enrollLoginTotp(preAuthToken, otpCode)
        : await authApi.verifyLoginTotp(preAuthToken, otpCode);
      finishLogin(data);
    } catch (err) {
      message.error(err?.response?.data?.error || 'OTP 코드가 올바르지 않습니다.');
      setOtpCode('');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setStep('login');
    setPreAuthToken('');
    setOtpCode('');
    setQrDataUrl('');
    form.resetFields();
  };

  if (step === 'otp-setup') {
    return (
      <>
        <div className="login-heading">
          <div className="login-eyebrow">2FA 등록</div>
          <Typography.Title level={2} className="login-title">2단계 인증 등록</Typography.Title>
          <Typography.Text className="login-sub">보안 정책상 OTP 등록이 필요합니다</Typography.Text>
        </div>
        <div className="login-form">
          <Typography.Paragraph className="login-sub" style={{ marginBottom: 12 }}>
            Google Authenticator 등 OTP 앱으로 아래 QR을 스캔한 뒤, 표시되는 6자리 코드를 입력하세요.
          </Typography.Paragraph>
          {qrDataUrl && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img src={qrDataUrl} alt="OTP QR" style={{ width: 180, height: 180, background: '#fff', borderRadius: 8, padding: 8 }} />
            </div>
          )}
          <Input
            prefix={<SafetyOutlined className="input-icon" />}
            placeholder="6자리 코드 입력"
            className="login-input"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onPressEnter={handleOtpVerify}
            maxLength={6}
            autoFocus
            style={{ marginBottom: 12 }}
          />
          <Button block loading={otpLoading} className="login-btn" onClick={handleOtpVerify} style={{ marginBottom: 12 }}>
            등록 후 로그인
          </Button>
          <Button block type="text" icon={<ArrowLeftOutlined />} onClick={handleBackToLogin}
            style={{ color: 'rgba(255,255,255,0.35)' }}>
            돌아가기
          </Button>
        </div>
      </>
    );
  }

  if (step === 'otp') {
    return (
      <>
        <div className="login-heading">
          <div className="login-eyebrow">2FA</div>
          <Typography.Title level={2} className="login-title">2단계 인증</Typography.Title>
          <Typography.Text className="login-sub">OTP 앱의 6자리 코드를 입력하세요</Typography.Text>
        </div>
        <div className="login-form">
          <div style={{ marginBottom: 16 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>OTP 코드</label>
            <Input
              prefix={<SafetyOutlined className="input-icon" />}
              placeholder="6자리 코드 입력"
              className="login-input"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onPressEnter={handleOtpVerify}
              maxLength={6}
              autoFocus
            />
          </div>
          <Button block loading={otpLoading} className="login-btn" onClick={handleOtpVerify}
            style={{ marginBottom: 12 }}>
            인증 확인
          </Button>
          <Button block type="text" icon={<ArrowLeftOutlined />} onClick={handleBackToLogin}
            style={{ color: 'rgba(255,255,255,0.35)' }}>
            돌아가기
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="login-heading">
        <div className="login-eyebrow">Sign in</div>
        <Typography.Title level={2} className="login-title">반갑습니다</Typography.Title>
        <Typography.Text className="login-sub">아이디와 비밀번호를 입력해 주세요</Typography.Text>
      </div>
      <Form form={form} onFinish={handleLogin} layout="vertical" size="large" className="login-form">
        <Form.Item
          name="username"
          label={<span className="form-label">아이디</span>}
          rules={[{ required: true, message: '아이디를 입력하세요.' }]}
        >
          <Input
            prefix={<UserOutlined className="input-icon" />}
            placeholder="아이디를 입력하세요"
            className="login-input"
            autoComplete="username"
          />
        </Form.Item>
        <Form.Item
          name="password"
          label={<span className="form-label">비밀번호</span>}
          rules={[{ required: true, message: '비밀번호를 입력하세요.' }]}
        >
          <Input.Password
            prefix={<LockOutlined className="input-icon" />}
            placeholder="비밀번호를 입력하세요"
            className="login-input"
            autoComplete="current-password"
          />
        </Form.Item>
        <Form.Item style={{ marginTop: 8 }}>
          <Button htmlType="submit" block loading={loading} className="login-btn">
            로그인
          </Button>
        </Form.Item>
      </Form>
    </>
  );
}

/* ══════════════════════════════════════════════
   비밀번호 초기화 탭 (3단계)
══════════════════════════════════════════════ */
function ResetPasswordTab() {
  const [step, setStep] = useState(0);
  const [resetOtpToken, setResetOtpToken] = useState('');
  const [resetPwToken, setResetPwToken]   = useState('');
  const [otpCode, setOtpCode]             = useState('');
  const [otpLoading, setOtpLoading]       = useState(false);
  const [form0] = Form.useForm();
  const [form2] = Form.useForm();

  const handleRequestReset = async (values) => {
    setOtpLoading(true);
    try {
      const data = await authApi.requestPasswordReset(values.username);
      setResetOtpToken(data.resetOtpToken);
      setStep(1);
    } catch (err) {
      message.error(err?.response?.data?.error || '계정을 찾을 수 없습니다.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      message.warning('6자리 OTP 코드를 입력하세요.');
      return;
    }
    setOtpLoading(true);
    try {
      const data = await authApi.verifyResetOtp(resetOtpToken, otpCode);
      setResetPwToken(data.resetPwToken);
      setOtpCode('');
      setStep(2);
    } catch (err) {
      message.error(err?.response?.data?.error || 'OTP 코드가 올바르지 않습니다.');
      setOtpCode('');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleConfirmReset = async (values) => {
    setOtpLoading(true);
    try {
      await authApi.confirmPasswordReset(resetPwToken, values.newPassword);
      setStep('done');
    } catch (err) {
      message.error(err?.response?.data?.error || '비밀번호 변경에 실패했습니다.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleRestart = () => {
    setStep(0);
    setResetOtpToken('');
    setResetPwToken('');
    setOtpCode('');
    form0.resetFields();
    form2.resetFields();
  };

  if (step === 'done') {
    return (
      <Result
        status="success"
        title="비밀번호가 초기화되었습니다"
        subTitle="새 비밀번호로 로그인하세요."
        style={{ padding: '24px 0' }}
      />
    );
  }

  const stepItems = [
    { title: '계정 확인' },
    { title: 'OTP 인증' },
    { title: '비밀번호 설정' },
  ];

  return (
    <>
      <div className="login-heading">
        <div className="login-eyebrow">Reset</div>
        <Typography.Title level={2} className="login-title">비밀번호 초기화</Typography.Title>
        <Typography.Text className="login-sub">OTP 인증 후 새 비밀번호를 설정합니다</Typography.Text>
      </div>

      <Steps current={step} items={stepItems} size="small" style={{ marginBottom: 24 }} />

      {step === 0 && (
        <Form form={form0} onFinish={handleRequestReset} layout="vertical" size="large" className="login-form">
          <Form.Item
            name="username"
            label={<span className="form-label">아이디</span>}
            rules={[{ required: true, message: '아이디를 입력하세요.' }]}
          >
            <Input
              prefix={<UserOutlined className="input-icon" />}
              placeholder="가입한 아이디를 입력하세요"
              className="login-input"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item style={{ marginTop: 8 }}>
            <Button htmlType="submit" block loading={otpLoading} className="login-btn">
              다음 · OTP 인증
            </Button>
          </Form.Item>
        </Form>
      )}

      {step === 1 && (
        <div className="otp-step">
          <div className="otp-step-icon"><SafetyOutlined /></div>
          <Typography.Title level={4} className="otp-step-title">OTP 인증</Typography.Title>
          <Typography.Text className="otp-step-desc">
            Google Authenticator 앱의 6자리 코드를 입력하세요.
          </Typography.Text>
          <Input
            className="otp-input"
            size="large"
            maxLength={6}
            placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            onPressEnter={handleVerifyOtp}
            autoFocus
          />
          <Button block loading={otpLoading} className="login-btn" style={{ marginTop: 16 }} onClick={handleVerifyOtp}>
            인증 완료
          </Button>
          <button className="otp-back-btn" onClick={() => { setStep(0); setOtpCode(''); }}>
            <ArrowLeftOutlined /> 돌아가기
          </button>
        </div>
      )}

      {step === 2 && (
        <Form form={form2} onFinish={handleConfirmReset} layout="vertical" size="large" className="login-form">
          <Form.Item
            name="newPassword"
            label={<span className="form-label">새 비밀번호</span>}
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
              prefix={<LockOutlined className="input-icon" />}
              placeholder="9자 이상, 영문·숫자·특수문자 조합"
              className="login-input"
              autoComplete="new-password"
              autoFocus
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={<span className="form-label">새 비밀번호 확인</span>}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '비밀번호 확인을 입력하세요.' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('비밀번호가 일치하지 않습니다.'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="input-icon" />}
              placeholder="비밀번호를 다시 입력하세요"
              className="login-input"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item style={{ marginTop: 8 }}>
            <Button htmlType="submit" block loading={otpLoading} className="login-btn">
              비밀번호 변경 완료
            </Button>
          </Form.Item>
          <button className="otp-back-btn" onClick={handleRestart}>
            <ArrowLeftOutlined /> 처음으로
          </button>
        </Form>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════
   메인 로그인 페이지
══════════════════════════════════════════════ */
export default function LoginPage() {
  const navigate = useNavigate();
  const { user, setAuth } = useAuthStore();

  useEffect(() => { if (user) navigate('/'); }, [user]);

  const handleSuccess = (path = '/') => navigate(path);

  const tabItems = [
    {
      key: 'login',
      label: '로그인',
      children: <LoginTab onSuccess={handleSuccess} setAuth={setAuth} />,
    },
    {
      key: 'reset',
      label: '비밀번호 초기화',
      children: <ResetPasswordTab />,
    },
  ];

  return (
    <div className="login-root">
      <div className="login-container">
        {/* 왼쪽 브랜딩 패널 */}
        <div className="login-brand-panel">
          <div className="login-brand-logo">
            <div className="login-brand-logo-sq">
              <FlowdeskIcon size={28} color="rgba(255,255,255,0.85)" />
            </div>
            <span className="login-brand-name">Flowdesk</span>
            <span className="login-brand-tagline">소규모 팀을 위한<br />업무 관리 솔루션</span>
          </div>
          <div className="login-brand-features">
            <div className="login-brand-feat">
              <span className="login-brand-feat-icon">📋</span>
              <span className="login-brand-feat-text">칸반 보드</span>
            </div>
            <div className="login-brand-feat">
              <span className="login-brand-feat-icon">📅</span>
              <span className="login-brand-feat-text">캘린더 뷰</span>
            </div>
            <div className="login-brand-feat">
              <span className="login-brand-feat-icon">📊</span>
              <span className="login-brand-feat-text">간트 차트</span>
            </div>
            <div className="login-brand-feat">
              <span className="login-brand-feat-icon">⚡</span>
              <span className="login-brand-feat-text">자동화 알림</span>
            </div>
            <div className="login-brand-feat">
              <span className="login-brand-feat-icon">💬</span>
              <span className="login-brand-feat-text">팀 채팅</span>
            </div>
          </div>

          {/* 제작자 서명 */}
          <div className="login-brand-credit">
            <span className="login-brand-credit-line" />
            <span className="login-brand-credit-text">Crafted by Hong&rsquo;s</span>
          </div>
        </div>

        {/* 오른쪽 폼 패널 */}
        <div className="login-form-panel">
          <Tabs
            defaultActiveKey="login"
            items={tabItems}
            className="login-tabs"
          />
        </div>
      </div>
    </div>
  );
}
