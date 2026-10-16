import api from './axios';

export const getEmailSettings = () => api.get('/settings/email').then((r) => r.data);

export const updateEmailSettings = (data) => api.put('/settings/email', data).then((r) => r.data);

export const testEmailSettings = (data) => api.post('/settings/email/test', data).then((r) => r.data);

export const getWidgetSettings = () => api.get('/settings/widgets').then((r) => r.data);

export const updateWidgetSettings = (data) => api.put('/settings/widgets', data).then((r) => r.data);

export const getThemePrefs = () => api.get('/settings/theme').then((r) => r.data);

export const updateThemePrefs = (data) => api.put('/settings/theme', data).then((r) => r.data);

// 개인 화면 설정(내비게이션 등) — 전달한 최상위 키만 병합 저장, null 이면 삭제
export const getPreferences = () => api.get('/settings/preferences').then((r) => r.data);

export const updatePreferences = (patch) => api.put('/settings/preferences', patch).then((r) => r.data);

export const getDashboardLayout = () => api.get('/settings/dashboard-layout').then((r) => r.data);

export const updateDashboardLayout = (data) => api.put('/settings/dashboard-layout', data).then((r) => r.data);

export const getApprovalLinePresets = () => api.get('/settings/approval-lines').then((r) => r.data);

export const updateApprovalLinePresets = (data) => api.put('/settings/approval-lines', data).then((r) => r.data);

// 팀 공유 결재선 프리셋 — 개인 프리셋과 별개로 전원이 열람·추가 가능.
// add/remove는 서버가 최신 배열을 다시 읽어 수정하는 원자적 엔드포인트라, 동시에 다른
// 프리셋을 추가/삭제해도 서로의 변경을 덮어쓰지 않는다(예전 PUT 전체교체 방식은 lost-update
// 위험이 있었다). 응답은 갱신된 최신 배열 전체.
export const getSharedApprovalLinePresets = () => api.get('/settings/approval-lines/shared').then((r) => r.data);

export const addSharedApprovalLinePreset = (entry) => api.post('/settings/approval-lines/shared', entry).then((r) => r.data);

export const deleteSharedApprovalLinePreset = (id) => api.delete(`/settings/approval-lines/shared/${id}`).then((r) => r.data);

// 휴가 중 결재 자동위임 대상
export const getApprovalAutoDelegate = () => api.get('/settings/approval-auto-delegate').then((r) => r.data);

export const updateApprovalAutoDelegate = (toUserId) => api.put('/settings/approval-auto-delegate', { toUserId }).then((r) => r.data);

// 알림 이메일 수신 여부(인앱 알림에는 영향 없음)
export const getEmailOptOut = () => api.get('/settings/email-opt-out').then((r) => r.data);

export const updateEmailOptOut = (optOut) => api.put('/settings/email-opt-out', { optOut }).then((r) => r.data);
