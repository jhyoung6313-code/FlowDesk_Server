import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 항상 로드되는 vendor를 논리 단위로 분리해 캐시 효율을 높인다.
        // (페이지 전용 무거운 라이브러리—캘린더/간트/차트/PDF—는 라우트 lazy 로딩으로
        //  각 페이지 청크에 자동 분리되므로 여기서 별도 지정하지 않는다.)
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // 'gantt-task-react' 등 react 문자열을 포함하는 패키지보다 먼저 검사
          if (id.includes('gantt-task-react')) return 'vendor-gantt';
          if (id.includes('@fullcalendar')) return 'vendor-calendar';
          if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-charts';
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'vendor-pdf';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          // 채팅 전용 대용량 라이브러리 — 전역 vendor와 분리해 해당 페이지에서만 로드
          if (id.includes('highlight.js')) return 'vendor-highlight';
          if (id.includes('emoji-mart')) return 'vendor-emoji';
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'vendor-antd';
          // react/react-dom/router/zustand 등은 상호 참조가 많아 분리 시 순환 청크가 발생.
          // 항상 함께 로드되므로 catch-all vendor에 그대로 둔다.
          return 'vendor';
        },
      },
    },
  },
  server: {
    host: true, // IPv4(127.0.0.1)·IPv6 모두 바인딩 — localhost 접속 실패 방지
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/components/**'],
    },
  },
});
