import loyaltyService from "./services/loyaltyService.js";
import { createClientLoyaltyController } from "./controllers/clientLoyaltyController.js";
import { createAdminLoyaltyController } from "./controllers/adminLoyaltyController.js";
import { createLoyaltyRoutes } from "./routes.js";

const clientController = createClientLoyaltyController({ loyaltyService });
const adminController = createAdminLoyaltyController({ loyaltyService });
const { clientRouter, adminRouter } = createLoyaltyRoutes({ clientController, adminController });

export { loyaltyService, clientRouter, adminRouter };

export default {
  loyaltyService,
  clientRouter,
  adminRouter,
};
