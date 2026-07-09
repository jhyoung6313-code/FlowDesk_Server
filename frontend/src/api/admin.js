import api from './axios';

export const downloadBackup = async () => {
  const res = await api.get('/admin/backup', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flowdesk_backup_${new Date().toISOString().slice(0, 10)}.enc`;
  a.click();
  URL.revokeObjectURL(url);
};

export const restoreBackup = (file) => {
  const form = new FormData();
  form.append('backup', file);
  return api.post('/admin/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const getActivityLog = (params) =>
  api.get('/admin/activity-log', { params }).then((r) => r.data);

// 보안 감사로그(접속기록·로그인/로그아웃 이력 등) — 관리자 전용
export const getAuditLog = (params) =>
  api.get('/admin/audit-log', { params }).then((r) => r.data);

// 잠긴 계정 잠금 해제
export const unlockUser = (id) =>
  api.post(`/admin/users/${id}/unlock`).then((r) => r.data);

// 개인정보/신용정보 입력 차단 로그 — 목록(마스킹본만, 원문 미저장)
// 접근 권한: 'PII_AUDIT'(감사권한) 보유자 전용 (admin 과 분리)
export const getPiiBlocks = (params) =>
  api.get('/pii-blocks', { params }).then((r) => r.data);

// 부여 가능한 권한 그룹 목록 (사용자 관리 UI용, 관리자 전용)
export const getPermissions = () =>
  api.get('/admin/permissions').then((r) => r.data);

// 관리자 콘솔 요약 (사용자 통계 + 최근 보안 이벤트)
export const getAdminSummary = () =>
  api.get('/admin/summary').then((r) => r.data);

// 시스템 설정 (일반 설정 + 보안 정책)
export const getSystemSettings = () =>
  api.get('/admin/system-settings').then((r) => r.data);

export const updateSystemSettings = (data) =>
  api.put('/admin/system-settings', data).then((r) => r.data);
