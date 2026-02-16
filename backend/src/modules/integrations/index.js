import adminRouter from "./routes.js";
import webhooksRouter from "./webhooks/routes.js";
import menuAdapter from "./adapters/menuAdapter.js";
import loyaltyAdapter from "./adapters/loyaltyAdapter.js";
import ordersAdapter from "./adapters/ordersAdapter.js";

export { adminRouter, webhooksRouter, menuAdapter, loyaltyAdapter, ordersAdapter };

export default {
  adminRouter,
  webhooksRouter,
  menuAdapter,
  loyaltyAdapter,
  ordersAdapter,
};
