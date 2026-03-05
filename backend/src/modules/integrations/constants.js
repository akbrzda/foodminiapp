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
  // Локальный "ready" в iiko ближе всего к ожиданию выдачи/курьера.
  ready: "Waiting",
  delivering: "OnWay",
  completed: "Delivered",
  cancelled: "Cancelled",
};

const IIKO_STATUSES_GROUPED_BY_LOCAL = {
  pending: ["Unconfirmed"],
  confirmed: ["WaitCooking", "ReadyForCooking"],
  preparing: ["CookingStarted"],
  ready: ["CookingCompleted", "Waiting"],
  delivering: ["OnWay"],
  completed: ["Delivered", "Closed"],
  cancelled: ["Cancelled"],
};

export const IIKO_STATUS_MAP_TO_LOCAL = Object.entries(IIKO_STATUSES_GROUPED_BY_LOCAL).reduce((acc, [localStatus, iikoStatuses]) => {
  for (const iikoStatus of iikoStatuses) {
    acc[iikoStatus] = localStatus;
  }
  return acc;
}, {});
