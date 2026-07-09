import api from './axios';

export const getWorkload = () => api.get('/users/workload').then((r) => r.data);
