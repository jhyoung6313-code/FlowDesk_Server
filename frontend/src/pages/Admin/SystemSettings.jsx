import React, { useEffect, useState } from 'react';
import {
  Card, Form, Input, InputNumber, Select, Switch, Button, Typography, Row, Col,
  Descriptions, Space, message, Spin, Alert, Divider,
} from 'antd';
import {
  SettingOutlined, SaveOutlined, SafetyCertificateOutlined, LockOutlined,
  KeyOutlined, ClockCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { getSystemSettings, updateSystemSettings } from '../../api/admin';

export default function SystemSettings() {
  const [form] = Form.useForm();
  const [readonly, setReadonly] = useState({});
  const [jwtOptions, setJwtOptions] = useState(['30m', '1h', '2h', '4h', '8h']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getSystemSettings()
      .then((data) => {
        const sec = data.security || {};
        form.setFieldsValue({
          app_name: data.general?.app_name,
          maxFailedAttempts: sec.maxFailedAttempts,
          lockDurationMinutes: sec.lockDurationMinutes,
          passwordMinLength: sec.passwordMinLength,
          passwordMinClasses: sec.passwordMinClasses,
          passwordExpireDays: sec.passwordExpireDays,
          passwordHistoryCount: sec.passwordHistoryCount,
          enforceOtp: sec.enforceOtp,
          jwtExpiresIn: sec.jwtExpiresIn,
        });
        setReadonly({
          bcryptRounds: sec.bcryptRounds,
          idleTimeoutMinutes: sec.idleTimeoutMinutes,
          auditLogDays: sec.auditLogDays,
        });
        if (Array.isArray(data.jwtOptions) && data.jwtOptions.length) setJwtOptions(data.jwtOptions);
      })
      .catch(() => message.error('설정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await updateSystemSettings(values);
      message.success('시스템 설정이 저장되었습니다. 즉시 적용됩니다.');
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  }

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <SettingOutlined style={{ marginRight: 8 }} />
          시스템 설정
        </Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>새로고침</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            저장
          </Button>
        </Space>
      </Row>

      <Form form={form} layout="vertical">
        <Row gutter={[16, 16]}>
          {/* ── 일반 설정 ── */}
          <Col xs={24} lg={12}>
            <Card title="일반 설정" size="small" style={{ borderRadius: 12 }}>
              <Form.Item
                name="app_name"
                label="애플리케이션 이름"
                tooltip="관리자 콘솔 등 화면에 표시되는 서비스 이름입니다."
                rules={[{ required: true, message: '이름을 입력하세요.' }, { max: 100, message: '100자 이내로 입력하세요.' }]}
              >
                <Input placeholder="예: FlowDesk" />
              </Form.Item>

              <Divider style={{ margin: '8px 0 16px' }} />

              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                아래 항목은 서버 환경변수(.env)로만 변경 가능한 참고 값입니다.
              </Typography.Text>
              <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }}
                labelStyle={{ width: 160, fontWeight: 600 }}
              >
                <Descriptions.Item label={<Space><KeyOutlined />비밀번호 해시 강도</Space>}>
                  bcrypt {readonly.bcryptRounds} rounds
                </Descriptions.Item>
                <Descriptions.Item label={<Space><ClockCircleOutlined />유휴 자동 로그아웃</Space>}>
                  {readonly.idleTimeoutMinutes}분
                </Descriptions.Item>
                <Descriptions.Item label={<Space><SafetyCertificateOutlined />감사로그 보관</Space>}>
                  {readonly.auditLogDays}일
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* ── 보안 정책 (편집 가능) ── */}
          <Col xs={24} lg={12}>
            <Card
              title={<Space><SafetyCertificateOutlined />보안 정책</Space>}
              size="small"
              style={{ borderRadius: 12 }}
            >
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="변경 시 즉시 적용됩니다."
                description="계정 잠금·비밀번호 정책은 저장 즉시 다음 로그인/비밀번호 변경부터 반영됩니다. 세션 만료 변경은 새로 발급되는 토큰부터 적용됩니다."
              />

              <Typography.Text strong style={{ fontSize: 13, color: '#94a3b8' }}>인증 · 세션</Typography.Text>
              <Row gutter={12} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Form.Item name="enforceOtp" label="2단계 인증(OTP) 강제" valuePropName="checked" tooltip="전사 강제 시 모든 사용자가 OTP를 등록·사용해야 합니다.">
                    <Switch checkedChildren="강제" unCheckedChildren="선택" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="jwtExpiresIn" label="세션 만료(JWT)">
                    <Select options={jwtOptions.map((v) => ({ label: v, value: v }))} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: '4px 0 12px' }} />
              <Typography.Text strong style={{ fontSize: 13, color: '#94a3b8' }}>계정 잠금</Typography.Text>
              <Row gutter={12} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Form.Item
                    name="maxFailedAttempts"
                    label={<Space size={4}><LockOutlined />로그인 실패 임계값</Space>}
                    rules={[{ required: true, type: 'number', min: 1, max: 20, message: '1~20' }]}
                  >
                    <InputNumber min={1} max={20} addonAfter="회" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="lockDurationMinutes"
                    label={<Space size={4}><ClockCircleOutlined />잠금 지속 시간</Space>}
                    rules={[{ required: true, type: 'number', min: 1, max: 1440, message: '1~1440' }]}
                  >
                    <InputNumber min={1} max={1440} addonAfter="분" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: '4px 0 12px' }} />
              <Typography.Text strong style={{ fontSize: 13, color: '#94a3b8' }}>비밀번호 정책</Typography.Text>
              <Row gutter={12} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Form.Item
                    name="passwordMinLength"
                    label="최소 길이"
                    rules={[{ required: true, type: 'number', min: 4, max: 64, message: '4~64' }]}
                  >
                    <InputNumber min={4} max={64} addonAfter="자" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="passwordMinClasses"
                    label="문자 종류 요구"
                    tooltip="영대문자·영소문자·숫자·특수문자 4종 중 최소 충족 수"
                    rules={[{ required: true, message: '선택하세요.' }]}
                  >
                    <Select
                      options={[1, 2, 3, 4].map((n) => ({ label: `4종 중 ${n}종 이상`, value: n }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="passwordExpireDays"
                    label="변경 주기"
                    tooltip="0 = 만료 없음"
                    rules={[{ required: true, type: 'number', min: 0, max: 3650, message: '0~3650' }]}
                  >
                    <InputNumber min={0} max={3650} addonAfter="일" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="passwordHistoryCount"
                    label="직전 재사용 금지"
                    tooltip="0 = 재사용 허용"
                    rules={[{ required: true, type: 'number', min: 0, max: 50, message: '0~50' }]}
                  >
                    <InputNumber min={0} max={50} addonAfter="개" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
