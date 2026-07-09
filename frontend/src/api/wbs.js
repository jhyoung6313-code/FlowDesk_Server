import api from './axios';

// ─── 프로젝트 ─────────────────────────────────────────
export const getProjects = () => api.get('/wbs/projects').then((r) => r.data);
export const createProject = (data) => api.post('/wbs/projects', data).then((r) => r.data);
export const getProject = (id) => api.get(`/wbs/projects/${id}`).then((r) => r.data);
export const updateProject = (id, data) => api.put(`/wbs/projects/${id}`, data).then((r) => r.data);
export const deleteProject = (id) => api.delete(`/wbs/projects/${id}`).then((r) => r.data);

// ─── WBS 항목 ─────────────────────────────────────────
export const getTasks = (projectId) =>
  api.get(`/wbs/projects/${projectId}/tasks`).then((r) => r.data);
export const createTask = (projectId, data) =>
  api.post(`/wbs/projects/${projectId}/tasks`, data).then((r) => r.data);
export const updateTask = (taskId, data) =>
  api.put(`/wbs/tasks/${taskId}`, data).then((r) => r.data);
export const deleteTask = (taskId) =>
  api.delete(`/wbs/tasks/${taskId}`).then((r) => r.data);
export const reorderTasks = (projectId, tasks) =>
  api.patch(`/wbs/projects/${projectId}/tasks/reorder`, { tasks }).then((r) => r.data);

// ─── 이슈사항 ─────────────────────────────────────────
export const getIssues = (projectId) =>
  api.get(`/wbs/projects/${projectId}/issues`).then((r) => r.data);
export const createIssue = (projectId, data) =>
  api.post(`/wbs/projects/${projectId}/issues`, data).then((r) => r.data);
export const updateIssue = (issueId, data) =>
  api.put(`/wbs/issues/${issueId}`, data).then((r) => r.data);
export const deleteIssue = (issueId) =>
  api.delete(`/wbs/issues/${issueId}`).then((r) => r.data);

// ─── Excel 내보내기 (Blob 다운로드) ──────────────────
const downloadExcel = async (url, filename) => {
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('export failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const exportTasksExcel = (projectId, projectName) =>
  downloadExcel(
    `/api/wbs/projects/${projectId}/tasks/export`,
    `WBS_${projectName}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );

export const exportIssuesExcel = (projectId, projectName) =>
  downloadExcel(
    `/api/wbs/projects/${projectId}/issues/export`,
    `이슈_${projectName}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );

// ─── 업로드용 샘플 양식 다운로드 ──────────────────────
export const downloadTasksTemplate = () =>
  downloadExcel('/api/wbs/tasks/template', 'WBS_업로드_양식.xlsx');

export const downloadIssuesTemplate = () =>
  downloadExcel('/api/wbs/issues/template', '이슈사항_업로드_양식.xlsx');

// ─── Excel 업로드 (가져오기) ──────────────────────────
export const importTasksExcel = (projectId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/wbs/projects/${projectId}/tasks/import`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const importIssuesExcel = (projectId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/wbs/projects/${projectId}/issues/import`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

// ─── 산출물 파일 ──────────────────────────────────────
export const uploadDeliverable = (taskId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/wbs/tasks/${taskId}/deliverable`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const downloadDeliverable = async (taskId, origName) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/wbs/tasks/${taskId}/deliverable`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('download failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = origName || 'deliverable';
  a.click();
  URL.revokeObjectURL(a.href);
};

export const deleteDeliverable = (taskId) =>
  api.delete(`/wbs/tasks/${taskId}/deliverable`).then((r) => r.data);
