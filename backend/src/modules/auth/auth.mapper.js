import { isPlatformRoleCode } from "../platform-core/platform-auth.constants.js";

const resolveAuthScope = (roleCode) => (isPlatformRoleCode(roleCode) ? "platform" : "tenant");

export const buildAdminAuthPayload = ({ user, roleContext, cities, branches, permissions }) => ({
  auth_scope: resolveAuthScope(roleContext.code),
  platform_role: isPlatformRoleCode(roleContext.code) ? roleContext.code : null,
  tenant_role: isPlatformRoleCode(roleContext.code) ? null : roleContext.code,
  tenant_id: null,
  id: user.id,
  email: user.email,
  role: roleContext.code,
  role_name: roleContext.name,
  cities,
  permissions,
  permission_version: Number(user.permission_version || 1),
  type: "admin",
  branch_ids: branches.map((branch) => branch.id),
  branch_city_ids: branches.map((branch) => branch.city_id),
});

export const buildAdminSessionUser = ({ user, roleContext, cities, branches, permissions }) => ({
  auth_scope: resolveAuthScope(roleContext.code),
  platform_role: isPlatformRoleCode(roleContext.code) ? roleContext.code : null,
  tenant_role: isPlatformRoleCode(roleContext.code) ? null : roleContext.code,
  tenant_id: null,
  ...user,
  role_name: roleContext.name,
  cities,
  permissions,
  permission_version: Number(user.permission_version || 1),
  branch_ids: branches.map((branch) => branch.id),
  branch_city_ids: branches.map((branch) => branch.city_id),
  branches,
});

export const buildClientAuthPayload = ({ userId, tenantId = null }) => ({
  auth_scope: "tenant",
  platform_role: null,
  tenant_role: "client",
  tenant_id: tenantId,
  id: userId,
  type: "client",
});

export const sanitizeAdminUser = (user) => {
  if (!user || typeof user !== "object") return user;
  const sanitized = { ...user };
  delete sanitized.password_hash;
  return sanitized;
};
