let wsServerInstance = null;

export function registerWsServer(server) {
  wsServerInstance = server || null;
}

export function notifyMenuUpdated(payload = {}) {
  if (!wsServerInstance) return false;
  wsServerInstance.broadcast({
    type: "menu-updated",
    data: {
      ...payload,
      timestamp: new Date().toISOString(),
    },
  });
  return true;
}
