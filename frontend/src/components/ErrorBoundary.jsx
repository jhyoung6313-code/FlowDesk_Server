import React from 'react';
import { Button, Result } from 'antd';

/**
 * React Error Boundary
 * 하위 컴포넌트에서 렌더링 중 예외 발생 시 폴백 UI를 표시합니다.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // 최상위로 이동
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--fd-surface-sunken)',
          }}
        >
          <Result
            status="500"
            title="오류가 발생했습니다"
            subTitle={
              this.state.error?.message
                ? `오류 내용: ${this.state.error.message}`
                : '예기치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            }
            extra={
              <Button type="primary" onClick={this.handleReset}>
                대시보드로 이동
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
