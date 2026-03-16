import express from "express";
import { requirePermission } from "../../../middleware/auth.js";
import {
  deleteUserOverridesController,
  getRolePermissionsController,
  getUserOverridesController,
  listPermissionsController,
  listRolesController,
  updateRolePermissionsController,
  updateUserOverridesController,
} from "./access.controller.js";

const accessRouter = express.Router();

accessRouter.get("/permissions", requirePermission("system.access.manage"), listPermissionsController);
accessRouter.get("/roles", requirePermission("system.access.manage"), listRolesController);
accessRouter.get("/roles/:id/permissions", requirePermission("system.access.manage"), getRolePermissionsController);
accessRouter.put("/roles/:id/permissions", requirePermission("system.access.manage"), updateRolePermissionsController);
accessRouter.get("/users/:id/overrides", requirePermission("system.access.manage"), getUserOverridesController);
accessRouter.put("/users/:id/overrides", requirePermission("system.access.manage"), updateUserOverridesController);
accessRouter.delete("/users/:id/overrides", requirePermission("system.access.manage"), deleteUserOverridesController);

export default accessRouter;
