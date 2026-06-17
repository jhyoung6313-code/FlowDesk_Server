import { useEffect, useState } from 'react';
import {
  Card, Form, Input, InputNumber, Button, Switch, Space, Typography,
  Divider, message, Spin, Alert,
} from 'antd';
import { MailOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getEmailSettings, updateEmailSettings, testEmailSettings } from '../../api/settings';

const { Title, Text } = Typography;

export default function EmailSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [passSet, setPassSet]     = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, msg }

  useEffect(() => {
    getEmailSettings()
      .then((cfg) => {
        form.setFieldsValue({
          email_enabled: cfg.email_enabled === 'true',
          smtp_host: cfg.smtp_host || '',
          smtp_port: Number(cfg.smtp_port) || 587,
          smtp_user: cfg.smtp_user || '',
          smtp_from: cfg.smtp_from || '',
        });
        setPassSet(!!cfg.smtp_pass_set);
      })
      .catch(() => message.error('설정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        email_enabled: values.email_enabled,
        smtp_host: values.smtp_host,
        smtp_port: values.smtp_port,
        smtp_user: values.smtp_user,
        smtp_from: values.smtp_from,
      };
      if (values.smtp_pass) payload.smtp_pass = values.smtp_pass;
      await updateEmailSettings(payload);
      message.success('이메일 설정이 저장되었습니다.');
      if (values.smtp_pass) setPassSet(true);
      form.setFieldValue('smtp_pass', '');
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      const values = form.getFieldsValue();
      if (!values.smtp_host || !values.smtp_user) {
        message.warning('SMTP 호스트와 사용자를 먼저 입력하세요.');
        return;
      }
      if (!values.smtp_pass && !passSet) {
        message.warning('SMTP 비밀번호를 입력하세요.');
        return;
      }
      setTesting(true);
      setTestResult(null);
      const payload = {
        smtp_host: values.smtp_host,
        smtp_port: values.smtp_port,
        smtp_user: values.smtp_user,
        smtp_pass: values.smtp_pass || undefined,
      };
      await testEmailSettings(payload);
      setTestResult({ ok: true, msg: 'SMTP 연결 성공! 이메일 발송이 가능합니다.' });
    } catch (err) {
      setTestResult({ ok: false, msg: err?.response?.data?.error || 'SMTP 연결 실패' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>
        <MailOutlined style={{ marginRight: 8 }} />
        이메일 알림 설정
      </Title>

      <Card style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="email_enabled" label="이메일 알림 활성화" valuePropName="checked">
            <Switch checkedChildren="활성" unCheckedChildren="비활성" />
          </Form.Item>

          <Divider>SMTP 서버 설정</Divider>

          <Form.Item
            name="smtp_host"
            label="SMTP 호스트"
            rules={[{ required: true, message: 'SMTP 호스트를 입력하세요.' }]}
            extra="예: smtp.gmail.com, smtp.naver.com"
          >
            <Input placeholder="smtp.gmail.com" />
          </Form.Item>

          <Form.Item name="smtp_port" label="SMTP 포트" extra="일반적으로 587(TLS) 또는 465(SSL)">
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="smtp_user"
            label="SMTP 사용자 (이메일 주소)"
            rules={[{ required: true, message: 'SMTP 사용자를 입력하세요.' }]}
          >
            <Input placeholder="your@email.com" />
          </Form.Item>

          <Form.Item
            name="smtp_pass"
            label={
              <Space>
                <span>SMTP 비밀번호 / 앱 비밀번호</span>
                {passSet && (
                  <Text type="success" style={{ fontSize: 12 }}>
                    <CheckCircleOutlined /> 설정됨 (변경 시 입력)
                  </Text>
                )}
              </Space>
            }
            extra="Gmail 사용 시 앱 비밀번호를 사용하세요."
          >
            <Input.Password placeholder={passSet ? '변경하려면 입력하세요' : '비밀번호 입력'} autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="smtp_from"
            label="발신자 이름/주소"
            extra='예: Flowdesk &lt;noreply@yourcompany.com&gt;'
          >
            <Input placeholder="Flowdesk <noreply@yourcompany.com>" />
          </Form.Item>

          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              message={testResult.msg}
              style={{ marginBottom: 16 }}
              showIcon
            />
          )}

          <Space>
            <Button type="primary" onClick={handleSave} loading={saving}>
              저장
            </Button>
            <Button onClick={handleTest} loading={testing} icon={<MailOutlined />}>
              연결 테스트
            </Button>
          </Space>
        </Form>

        <Divider />
        <Alert
          type="info"
          showIcon
          message="이메일 알림 안내"
          description={
            <ul style={{ paddingLeft: 16, margin: 0 }}>
              <li>활성화 시 매일 오전 9시 마감 알림 스케줄 실행 시 이메일도 함께 발송됩니다.</li>
              <li>마감 3일 이내(due_soon), 당일(due_today), 초과(overdue) 업무 담당자에게 발송됩니다.</li>
              <li>Gmail 사용 시 2단계 인증 + 앱 비밀번호 설정이 필요합니다.</li>
              <li>Naver의 경우 SMTP 포트 587, SSL/TLS 사용을 권장합니다.</li>
            </ul>
          }
        />
      </Card>
    </div>
  );
}
