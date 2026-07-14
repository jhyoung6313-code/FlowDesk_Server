import api from './axios';

// AI 호출은 모델 추론 시간이 길 수 있어 별도의 넉넉한 타임아웃 사용(기본 10s → 90s)
const AI_TIMEOUT = 90000;

// AI 기능 설정 여부(키 미설정 시 버튼 숨김)
export const getAiStatus = () => api.get('/ai/status').then((r) => r.data);

// 자연어 → 업무 초안 배열
export const generateTasks = (prompt) =>
  api.post('/ai/tasks/generate', { prompt }, { timeout: AI_TIMEOUT }).then((r) => r.data);

// 주간 요약 (scope: 'me' | 'all')
export const getWeeklySummary = (scope = 'me', range = {}) =>
  api.post('/ai/summary', { scope, ...range }, { timeout: AI_TIMEOUT }).then((r) => r.data);

// RAG 질의응답 (F-63): 자연어 질문 → { answer, sources }
export const askAi = (question) =>
  api.post('/ai/ask', { question }, { timeout: AI_TIMEOUT }).then((r) => r.data);

// 채팅방/스레드 요약 (F-63): roomId → { summary }
export const summarizeChatRoom = (roomId) =>
  api.post('/ai/chat-summary', { roomId }, { timeout: AI_TIMEOUT }).then((r) => r.data);
