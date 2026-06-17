import { create } from 'zustand';

// 화면 잠금 상태를 localStorage와 동기화해, 잠긴 상태에서 새로고침해도 유지되게 한다.
const LOCK_KEY = 'screenLocked';

const readInitialLocked = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(LOCK_KEY) === '1';
};

const useLockStore = create((set) => ({
  locked: readInitialLocked(),

  lock: () => {
    localStorage.setItem(LOCK_KEY, '1');
    set({ locked: true });
  },

  unlock: () => {
    localStorage.removeItem(LOCK_KEY);
    set({ locked: false });
  },
}));

export default useLockStore;
