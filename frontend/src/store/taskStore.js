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
}));

export default useTaskStore;
