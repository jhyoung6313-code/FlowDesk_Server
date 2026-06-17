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
