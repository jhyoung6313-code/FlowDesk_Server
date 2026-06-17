import api from './axios';

export const getTimeEntries = (taskId) =>
  api.get(`/time-entries/task/${taskId}`).then((r) => r.data);

export const getRunningTimer = (taskId) =>
  api.get(`/time-entries/task/${taskId}/running`).then((r) => r.data);

export const startTimer = (taskId) =>
  api.post(`/time-entries/task/${taskId}/start`).then((r) => r.data);

export const stopTimer = (entryId, note) =>
  api.patch(`/time-entries/${entryId}/stop`, { note }).then((r) => r.data);

export const updateTimeEntryNote = (entryId, note) =>
  api.patch(`/time-entries/${entryId}`, { note }).then((r) => r.data);

export const deleteTimeEntry = (entryId) =>
  api.delete(`/time-entries/${entryId}`).then((r) => r.data);
