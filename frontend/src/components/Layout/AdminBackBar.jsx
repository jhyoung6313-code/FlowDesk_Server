import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined, SettingOutlined } from '@ant-design/icons';
import useThemeStore from '../../store/themeStore';

/* 관리자 하위 화면 상단에 표시되는 "관리자 콘솔로 돌아가기" 바 */
export default function AdminBackBar() {
  const navigate = useNavigate();
  const isDark = useThemeStore((s) => s.isDark);

  return (
    <div style={{ marginBottom: 16 }}>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/admin')}
        style={{
          paddingLeft: 8,
          paddingRight: 12,
          color: isDark ? 'rgba(255,255,255,0.65)' : '#64748b',
          fontWeight: 500,
        }}
      >
        <SettingOutlined style={{ marginInlineEnd: 4 }} />
        관리자 콘솔로 돌아가기
      </Button>
    </div>
  );
}
