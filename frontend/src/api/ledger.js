import api from './axios';

// 카테고리
export const getCategories = () => api.get('/ledger/categories').then((r) => r.data);
export const createCategory = (data) => api.post('/ledger/categories', data).then((r) => r.data);
export const updateCategory = (id, data) => api.put(`/ledger/categories/${id}`, data).then((r) => r.data);
export const deleteCategory = (id) => api.delete(`/ledger/categories/${id}`).then((r) => r.data);

// 요약 통계
export const getSummary = (params) => api.get('/ledger/summary', { params }).then((r) => r.data);

// 예산
export const getBudgets = (params) => api.get('/ledger/budget', { params }).then((r) => r.data);
export const upsertBudget = (data) => api.put('/ledger/budget', data).then((r) => r.data);
export const deleteBudget = (id) => api.delete(`/ledger/budget/${id}`).then((r) => r.data);

// 반복 거래
export const getRecurrings = () => api.get('/ledger/recurring').then((r) => r.data);
export const createRecurring = (data) => api.post('/ledger/recurring', data).then((r) => r.data);
export const updateRecurring = (id, data) => api.put(`/ledger/recurring/${id}`, data).then((r) => r.data);
export const deleteRecurring = (id) => api.delete(`/ledger/recurring/${id}`).then((r) => r.data);
export const applyRecurring = (data) => api.post('/ledger/recurring/apply', data).then((r) => r.data);

// Excel 내보내기
export const exportExcel = async (params) => {
  const res = await api.get('/ledger/export', { params, responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  const label = params.month
    ? `${params.year}년${String(params.month).padStart(2, '0')}월`
    : params.year ? `${params.year}년` : '전체';
  a.href = url;
  a.download = `가계부_${label}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// 거래 내역
export const getEntries = (params) => api.get('/ledger', { params }).then((r) => r.data);
export const createEntry = (data) => api.post('/ledger', data).then((r) => r.data);
export const updateEntry = (id, data) => api.put(`/ledger/${id}`, data).then((r) => r.data);
export const deleteEntry = (id) => api.delete(`/ledger/${id}`).then((r) => r.data);
