export const buildAdminAuthPayload = ({ user, roleContext, cities, branches, permissions }) => ({
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
  ...user,
  role_name: roleContext.name,
  cities,
  permissions,
  permission_version: Number(user.permission_version || 1),
  branch_ids: branches.map((branch) => branch.id),
  branch_city_ids: branches.map((branch) => branch.city_id),
  branches,
});

export const buildClientAuthPayload = ({ userId, telegramId = null }) => ({
  id: userId,
  ...(telegramId ? { telegram_id: telegramId } : {}),
  type: "client",
});

export const sanitizeAdminUser = (user) => {
  if (!user || typeof user !== "object") return user;
  const sanitized = { ...user };
  delete sanitized.password_hash;
  return sanitized;
};
