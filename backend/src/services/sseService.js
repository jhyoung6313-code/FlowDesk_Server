// SSE 연결 관리: userId → Set<response>
const clients = new Map();

const addClient = (userId, res) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
};

const removeClient = (userId, res) => {
  const set = clients.get(userId);
  if (set) {
    set.delete(res);
    if (set.size === 0) clients.delete(userId);
  }
};

const pushToUser = (userId, event, data) => {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
};

const pushNotification = (userId, notification) => {
  pushToUser(userId, 'notification', notification);
};

module.exports = { addClient, removeClient, pushNotification };
