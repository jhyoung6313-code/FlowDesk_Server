// 채팅 팝업 창 참조를 앱 전역(모듈 싱글턴)으로 공유.
// 알림 클릭·헤더 버튼이 같은 팝업을 재사용하고, 열림 여부를 판별하는 데 사용한다.

const POPUP_NAME = 'FlowDesk_Chat';
const POPUP_W = 960;
const POPUP_H = 680;

let popupRef = null;

export function isChatPopupOpen() {
  return !!(popupRef && !popupRef.closed);
}

// 이미 열려 있으면 포커스만, 아니면 새로 연다. 반환: 팝업 window 또는 null
export function openChatPopup() {
  if (isChatPopupOpen()) {
    popupRef.focus();
    return popupRef;
  }
  const left = Math.round(window.screenX + (window.outerWidth - POPUP_W) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - POPUP_H) / 2);
  popupRef = window.open(
    '/chat-popup',
    POPUP_NAME,
    `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top},resizable=yes,scrollbars=no`,
  );
  if (popupRef) popupRef.focus();
  return popupRef;
}

// 팝업이 열려 있으면 포커스하고 true, 아니면 false (열지 않음)
export function focusChatPopup() {
  if (isChatPopupOpen()) {
    popupRef.focus();
    return true;
  }
  return false;
}
