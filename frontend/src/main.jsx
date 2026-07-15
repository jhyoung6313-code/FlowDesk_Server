// react-grid-layout(내부 react-draggable)이 process.env.NODE_ENV 를 참조하는데
// Vite 브라우저 환경엔 process 전역이 없어 드래그/리사이즈 핸들러가 예외로 죽는다.
// 최소 폴리필로 process 전역을 정의해 이를 방지한다.
if (typeof window !== 'undefined' && typeof window.process === 'undefined') {
  window.process = { env: { NODE_ENV: import.meta.env.MODE } };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

dayjs.locale('ko');

function Root() {
  return (
    <ConfigProvider
      locale={koKR}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontSize: 17,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Malgun Gothic', 'Apple Gothic', 'Noto Sans KR', sans-serif",
        },
      }}
    >
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
