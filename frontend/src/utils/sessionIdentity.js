/* 탭 간 로그인 계정 불일치 방지.
   JWT 는 브라우저 전체가 공유하는 localStorage('token') 한 곳에 있다. 한 탭에서 다른 계정으로 로그인하면
   먼저 열려 있던 탭은 화면(user 상태)은 이전 계정인데 요청·SSE 는 새 계정 토큰으로 나가
   "화면은 A, 저장/알림은 B"가 섞인다. 이를 막기 위해
   1) 다른 탭에서 토큰이 바뀌면 이 탭을 새로고침해 새 계정으로 맞추고,
   2) 모든 API 요청 직전에 토큰의 계정과 화면의 계정이 같은지 확인한다. */

let uiUserId = null;   // 이 탭의 화면이 현재 보여 주는 계정 id (authStore 가 갱신)

export function setUiUserId(id) {
  uiUserId = id ?? null;
}

/* JWT payload 의 userId (서명 검증은 서버 몫 — 여기서는 불일치 감지용으로만 디코드) */
export function tokenUserId(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(part).split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const id = JSON.parse(json).userId;
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}

/* 화면 계정과 토큰 계정이 다르면 true (화면 계정이 아직 없으면 로그인 진행 중이므로 false) */
export function isIdentityMismatch(token) {
  if (uiUserId == null || !token) return false;
  const tid = tokenUserId(token);
  return tid != null && tid !== uiUserId;
}

let reloading = false;
export function reloadForIdentityChange() {
  if (reloading) return;
  reloading = true;
  try {
    sessionStorage.setItem('loginNotice', '다른 탭에서 로그인 계정이 변경되어 화면을 새로 불러왔습니다.');
  } catch { /* 무시 */ }
  window.location.reload();
}

/* 다른 탭의 로그인/로그아웃(토큰 변경)을 즉시 감지 — storage 이벤트는 변경을 일으키지 않은 탭에만 발생 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'token' || e.key === null) reloadForIdentityChange();
  });
}
