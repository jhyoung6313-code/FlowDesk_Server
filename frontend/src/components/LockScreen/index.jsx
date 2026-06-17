import { useState, useCallback } from 'react';
import { Card, Input, Button, Avatar, Typography, message, Space } from 'antd';
import { LockOutlined, LogoutOutlined } from '@ant-design/icons';
import { verifyPassword } from '../../api/auth';
import { getAvatarColor } from '../../utils/colors';

const OVERLAY_Z_INDEX = 2000;

/**
 * 미사용 타임아웃으로 잠긴 화면.
 * 비밀번호 입력으로 해제하거나, 로그아웃을 선택할 수 있다.
 */
export default function LockScreen({ user, onUnlock, onLogout }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = useCallback(async () => {
    if (!password) {
      message.warning('비밀번호를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      await verifyPassword(password);
      setPassword('');
      onUnlock();
    } catch (err) {
      message.error(err?.response?.data?.error || '비밀번호가 올바르지 않습니다.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  }, [password, onUnlock]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: OVERLAY_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      <Card style={{ width: 360, borderRadius: 12, textAlign: 'center' }}>
        <Avatar
          size={64}
          style={{
            backgroundColor: getAvatarColor(user?.id, user?.avatarColor),
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {user?.displayName?.slice(0, 1)}
        </Avatar>
        <Typography.Title level={5} style={{ marginBottom: 4 }}>
          화면이 잠겼습니다
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
          {user?.displayName}님, 계속하려면 비밀번호를 입력하세요.
        </Typography.Text>

        <Input.Password
          size="large"
          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleUnlock}
          autoComplete="current-password"
          autoFocus
          style={{ marginBottom: 16 }}
        />

        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Button type="primary" size="large" block loading={loading} onClick={handleUnlock}>
            잠금 해제
          </Button>
          <Button type="text" icon={<LogoutOutlined />} onClick={onLogout}>
            로그아웃
          </Button>
        </Space>
      </Card>
    </div>
  );
}
