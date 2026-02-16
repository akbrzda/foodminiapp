export const SYNC_STATUS = {
  PENDING: "pending",
  SYNCED: "synced",
  ERROR: "error",
  FAILED: "failed",
};

export const MAX_SYNC_ATTEMPTS = 5;

export const INTEGRATION_TYPE = {
  IIKO: "iiko",
  PREMIUMBONUS: "premiumbonus",
};

export const INTEGRATION_MODULE = {
  MENU: "menu",
  ORDERS: "orders",
  STOPLIST: "stoplist",
  DELIVERY_ZONES: "delivery_zones",
  CLIENTS: "clients",
  PURCHASES: "purchases",
  LOYALTY: "loyalty",
  PROMOCODE: "promocode",
};

export const ORDER_STATUS_MAP_TO_IIKO = {
  pending: "Unconfirmed",
  confirmed: "WaitCooking",
  preparing: "CookingStarted",
  ready: "CookingCompleted",
  delivering: "OnWay",
  completed: "Delivered",
  cancelled: "Cancelled",
};

export const IIKO_STATUS_MAP_TO_LOCAL = {
  Unconfirmed: "pending",
  WaitCooking: "confirmed",
  CookingStarted: "preparing",
  CookingCompleted: "ready",
  OnWay: "delivering",
  Delivered: "completed",
  Closed: "completed",
  Cancelled: "cancelled",
};
