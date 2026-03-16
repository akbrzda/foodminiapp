import {
  getPermissions,
  getRoles,
  getRolePermissions,
  getUserOverrides,
  isAccessSchemaMissingError,
  isAccessServiceError,
  resetUserOverrides,
  updateRolePermissions,
  updateUserOverrides,
} from "./access.service.js";

const handleAccessError = (error, next, res) => {
  if (isAccessServiceError(error)) {
    return res.status(error.status).json({
      success: false,
      error: error.message,
    });
  }

  if (isAccessSchemaMissingError(error)) {
    return res.status(503).json({
      success: false,
      error: "Схема доступов не инициализирована. Примените миграцию 052.",
    });
  }

  return next(error);
};

export async function listPermissionsController(req, res, next) {
  try {
    const data = await getPermissions();
    res.json({ success: true, data });
  } catch (error) {
    handleAccessError(error, next, res);
  }
}

export async function listRolesController(req, res, next) {
  try {
    const data = await getRoles();
    res.json({ success: true, data });
  } catch (error) {
    handleAccessError(error, next, res);
  }
}

export async function getRolePermissionsController(req, res, next) {
  try {
    const data = await getRolePermissions(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleAccessError(error, next, res);
  }
}

export async function updateRolePermissionsController(req, res, next) {
  try {
    const data = await updateRolePermissions(req.params.id, req.body?.permission_codes);
    res.json({ success: true, data });
  } catch (error) {
    handleAccessError(error, next, res);
  }
}

export async function getUserOverridesController(req, res, next) {
  try {
    const data = await getUserOverrides(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleAccessError(error, next, res);
  }
}

export async function updateUserOverridesController(req, res, next) {
  try {
    const data = await updateUserOverrides(req.params.id, req.body?.overrides);
    res.json({ success: true, data });
  } catch (error) {
    handleAccessError(error, next, res);
  }
}

export async function deleteUserOverridesController(req, res, next) {
  try {
    const data = await resetUserOverrides(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleAccessError(error, next, res);
  }
}
