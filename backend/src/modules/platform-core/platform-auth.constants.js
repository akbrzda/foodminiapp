export const PLATFORM_ROLE_CODES = new Set([
  "platform_owner",
  "platform_support",
  "platform_finance",
]);

export const isPlatformRoleCode = (roleCode) =>
  PLATFORM_ROLE_CODES.has(
    String(roleCode || "")
      .trim()
      .toLowerCase()
  );
