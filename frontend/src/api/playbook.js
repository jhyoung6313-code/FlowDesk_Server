import api from './axios';

// ─── Playbook 템플릿 ───

export const getPlaybooks = (params) => api.get('/playbooks', { params }).then((r) => r.data);
export const getPlaybook = (id) => api.get(`/playbooks/${id}`).then((r) => r.data);
export const createPlaybook = (data) => api.post('/playbooks', data).then((r) => r.data);
export const updatePlaybook = (id, data) => api.put(`/playbooks/${id}`, data).then((r) => r.data);
export const deletePlaybook = (id) => api.delete(`/playbooks/${id}`).then((r) => r.data);
export const clonePlaybook = (id) => api.post(`/playbooks/${id}/clone`).then((r) => r.data);

// ─── Run ───

export const getRuns = (params) => api.get('/runs', { params }).then((r) => r.data);
export const getRunUnreadCount = () => api.get('/runs/unread-count').then((r) => r.data);
export const markRunsRead = () => api.post('/runs/read').then((r) => r.data);
export const getRun = (id) => api.get(`/runs/${id}`).then((r) => r.data);
export const createRun = (data) => api.post('/runs', data).then((r) => r.data);
export const updateRun = (id, data) => api.put(`/runs/${id}`, data).then((r) => r.data);
export const finishRun = (id, data) => api.post(`/runs/${id}/finish`, data).then((r) => r.data);
export const pauseRun = (id) => api.post(`/runs/${id}/pause`).then((r) => r.data);
export const resumeRun = (id) => api.post(`/runs/${id}/resume`).then((r) => r.data);
export const archiveRun = (id) => api.post(`/runs/${id}/archive`).then((r) => r.data);
export const deleteRun = (id) => api.delete(`/runs/${id}`).then((r) => r.data);

// ─── 스텝 실행 ───

export const updateStep = (runId, stepId, data) =>
  api.patch(`/runs/${runId}/steps/${stepId}`, data).then((r) => r.data);

export const addRunStep = (runId, data) =>
  api.post(`/runs/${runId}/steps`, data).then((r) => r.data);

export const deleteRunStep = (runId, stepId) =>
  api.delete(`/runs/${runId}/steps/${stepId}`).then((r) => r.data);

// ─── 참여자 ───

export const addParticipant = (runId, data) =>
  api.post(`/runs/${runId}/participants`, data).then((r) => r.data);

export const removeParticipant = (runId, userId) =>
  api.delete(`/runs/${runId}/participants/${userId}`).then((r) => r.data);

// ─── 업데이트(댓글) ───

export const addUpdate = (runId, data) =>
  api.post(`/runs/${runId}/updates`, data).then((r) => r.data);

export const deleteUpdate = (runId, updateId) =>
  api.delete(`/runs/${runId}/updates/${updateId}`).then((r) => r.data);

// ─── 스텝 체크리스트 ───

export const getChecklists = (runId, stepId) =>
  api.get(`/runs/${runId}/steps/${stepId}/checklists`).then((r) => r.data);

export const addChecklist = (runId, stepId, data) =>
  api.post(`/runs/${runId}/steps/${stepId}/checklists`, data).then((r) => r.data);

export const updateChecklist = (runId, stepId, checkId, data) =>
  api.patch(`/runs/${runId}/steps/${stepId}/checklists/${checkId}`, data).then((r) => r.data);

export const deleteChecklist = (runId, stepId, checkId) =>
  api.delete(`/runs/${runId}/steps/${stepId}/checklists/${checkId}`).then((r) => r.data);

// ─── 통계 ───

export const getRunStats = () =>
  api.get('/runs/stats').then((r) => r.data);

// ─── 버전 이력 ───

export const getPlaybookVersions = (id) =>
  api.get(`/playbooks/${id}/versions`).then((r) => r.data);

export const restorePlaybookVersion = (id, versionId) =>
  api.post(`/playbooks/${id}/versions/${versionId}/restore`).then((r) => r.data);

// ─── 웹훅 ───

export const getWebhooks = (playbookId) =>
  api.get(`/playbooks/${playbookId}/webhooks`).then((r) => r.data);

export const createWebhook = (playbookId, data) =>
  api.post(`/playbooks/${playbookId}/webhooks`, data).then((r) => r.data);

export const deleteWebhook = (playbookId, hookId) =>
  api.delete(`/playbooks/${playbookId}/webhooks/${hookId}`).then((r) => r.data);

// ─── 자동 실행 스케줄 ───

export const getSchedules = (playbookId) =>
  api.get(`/playbooks/${playbookId}/schedules`).then((r) => r.data);

export const createSchedule = (playbookId, data) =>
  api.post(`/playbooks/${playbookId}/schedules`, data).then((r) => r.data);

export const updateSchedule = (playbookId, scheduleId, data) =>
  api.put(`/playbooks/${playbookId}/schedules/${scheduleId}`, data).then((r) => r.data);

export const deleteSchedule = (playbookId, scheduleId) =>
  api.delete(`/playbooks/${playbookId}/schedules/${scheduleId}`).then((r) => r.data);

export const runScheduleNow = (playbookId, scheduleId) =>
  api.post(`/playbooks/${playbookId}/schedules/${scheduleId}/run`).then((r) => r.data);
