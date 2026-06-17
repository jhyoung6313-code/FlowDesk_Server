import { useEffect, useRef, useCallback } from 'react';

const MS_PER_MIN = 60 * 1000;
const DAY_CHECK_INTERVAL = 60 * 1000; // 1분마다 일자 변경 확인

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
];

// 로컬 기준 날짜 키(YYYY-M-D). 자정이 지나면 값이 바뀐다.
function getDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * useIdleTimeout
 * @param {number}   timeoutMin   - 미사용 잠금 시간(분). 0 이하이면 잠금 비활성화
 * @param {Function} onLock       - 미사용 타임아웃 도달 시 호출(화면 잠금)
 * @param {Function} onDayChange  - 자정 경과(일자 변경) 시 호출(자동 로그아웃)
 * @param {boolean}  enabled      - 로그인 상태일 때만 활성화
 * @param {boolean}  paused       - 화면 잠금 중에는 idle 타이머만 일시정지(일자 감시는 유지)
 */
export default function useIdleTimeout({ timeoutMin, onLock, onDayChange, enabled, paused }) {
  const lockTimerRef = useRef(null);

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
  }, []);

  const resetLockTimer = useCallback(() => {
    clearLockTimer();
    if (!timeoutMin || timeoutMin <= 0) return; // 사용 안 함
    lockTimerRef.current = setTimeout(() => {
      onLock?.();
    }, timeoutMin * MS_PER_MIN);
  }, [clearLockTimer, timeoutMin, onLock]);

  // ── 미사용 잠금 타이머 (로그인 + 잠금 해제 상태에서만 동작) ──
  useEffect(() => {
    if (!enabled || paused) {
      clearLockTimer();
      return;
    }

    resetLockTimer();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetLockTimer, { passive: true })
    );

    return () => {
      clearLockTimer();
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, resetLockTimer)
      );
    };
  }, [enabled, paused, resetLockTimer, clearLockTimer]);

  // ── 일자 변경 감시 (로그인 상태면 잠금 여부와 무관하게 동작) ──
  useEffect(() => {
    if (!enabled) return;

    const startDay = getDayKey();
    const check = () => {
      if (getDayKey() !== startDay) onDayChange?.();
    };
    const intervalId = setInterval(check, DAY_CHECK_INTERVAL);
    // 탭이 백그라운드였다가 돌아온 경우에도 즉시 확인
    document.addEventListener('visibilitychange', check);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, onDayChange]);
}
