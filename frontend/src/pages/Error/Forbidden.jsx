import React from 'react';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function Forbidden() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <Result
        status="403"
        title="403"
        subTitle="이 페이지에 접근할 권한이 없습니다. 관리자에게 문의하세요."
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            대시보드로 이동
          </Button>
        }
      />
    </div>
  );
}
