import { create } from 'zustand';
import { getTasks, createTask, updateTask, deleteTask, updateTaskStatus } from '../api/tasks';

const useTaskStore = create((set, get) => ({
  tasks: [],
  loading: false,
  filters: {},
  // 캘린더 자동 갱신을 위한 버전 카운터 - 업무 CUD 발생 시 증가
  calendarVersion: 0,

  fetchTasks: async (params) => {
    set({ loading: true });
    try {
      const tasks = await getTasks(params || get().filters);
      set({ tasks, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addTask: async (data) => {
    const task = await createTask(data);
    set((state) => ({
      tasks: [task, ...state.tasks],
      calendarVersion: state.calendarVersion + 1,
    }));
    return task;
  },

  editTask: async (id, data) => {
    const task = await updateTask(id, data);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? task : t)),
      calendarVersion: state.calendarVersion + 1,
    }));
    return task;
  },

  removeTask: async (id) => {
    await deleteTask(id);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      calendarVersion: state.calendarVersion + 1,
    }));
  },

  changeStatus: async (id, status) => {
    const task = await updateTaskStatus(id, status);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? task : t)),
      calendarVersion: state.calendarVersion + 1,
    }));
    return task;
  },

  setFilters: (filters) => set({ filters }),

  // 스토어 CUD 액션을 거치지 않는 변경(일괄 처리 등) 후 호출 — calVer만 올려
  // 요약 바·대시보드·캘린더·간트 등 calVer 구독 화면을 함께 갱신한다.
  bumpVersion: () => set((state) => ({ calendarVersion: state.calendarVersion + 1 })),

  // 다른 사용자/탭의 업무 변경 소켓 수신 시 호출 — 서버에서 다시 읽어 store(tasks)를
  // 갱신하고 calendarVersion을 올려 SubHeader·Dashboard·캘린더·간트를 함께 동기화한다.
  syncFromRemote: async () => {
    try {
      const tasks = await getTasks(get().filters);
      set((state) => ({ tasks, calendarVersion: state.calendarVersion + 1 }));
    } catch {
      // 조회 실패 시에도 버전만 올려 calVer 구독 화면이 각자 재조회하도록 한다
      set((state) => ({ calendarVersion: state.calendarVersion + 1 }));
    }
  },
}));

export default useTaskStore;
