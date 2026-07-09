import api from './axios';

// ── 부서(Department) ──────────────────────────────────────────
export const getDepartments = () => api.get('/departments').then((r) => r.data);
export const createDepartment = (data) => api.post('/departments', data).then((r) => r.data);
export const updateDepartment = (id, data) => api.put(`/departments/${id}`, data).then((r) => r.data);
export const deleteDepartment = (id) => api.delete(`/departments/${id}`).then((r) => r.data);

// ── 팀(Team) ──────────────────────────────────────────────────
export const getTeams = (params) => api.get('/teams', { params }).then((r) => r.data);
export const createTeam = (data) => api.post('/teams', data).then((r) => r.data);
export const updateTeam = (id, data) => api.put(`/teams/${id}`, data).then((r) => r.data);
export const deleteTeam = (id) => api.delete(`/teams/${id}`).then((r) => r.data);
