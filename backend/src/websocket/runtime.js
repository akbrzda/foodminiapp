let wsServerInstance = null;

export function registerWsServer(server) {
  wsServerInstance = server || null;
}

export function getWsServer() {
  return wsServerInstance;
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

export function notifyNewOrder(payload = {}) {
  if (!wsServerInstance) return false;
  wsServerInstance.notifyNewOrder(payload);
  return true;
}

export function notifyOrderStatusUpdate(orderId, userId, newStatus, oldStatus, branchId = null) {
  if (!wsServerInstance) return false;
  wsServerInstance.notifyOrderStatusUpdate(orderId, userId, newStatus, oldStatus, branchId);
  return true;
}
