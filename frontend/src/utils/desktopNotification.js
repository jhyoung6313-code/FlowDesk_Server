export function requestNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  Notification.requestPermission();
}

export function showDesktopNotification(title, body, path) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, icon: '/favicon.ico' });
  if (path) {
    n.onclick = () => {
      window.focus();
      window.location.href = path;
      n.close();
    };
  }
}
