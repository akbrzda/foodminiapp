import db from "../../../config/database.js";

export async function listPermissions() {
  const [rows] = await db.query(
    `SELECT id, code, module, action, description, is_active, created_at, updated_at
     FROM admin_permissions
     ORDER BY module ASC, code ASC`
  );
  return rows;
}

export async function listSystemRoles() {
  const [rows] = await db.query(
    `SELECT r.id, r.code, r.name, r.is_system, r.is_active, r.created_at, r.updated_at, COUNT(rp.permission_id) AS permissions_count
     FROM admin_roles r
     LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
     WHERE r.is_system = 1
     GROUP BY r.id, r.code, r.name, r.is_system, r.is_active, r.created_at, r.updated_at
     ORDER BY r.is_system DESC, r.code ASC`
  );
  return rows;
}

export async function findRoleById(roleId, connection = db) {
  const [rows] = await connection.query(
    `SELECT id, code, name, is_system, is_active
     FROM admin_roles
     WHERE id = ?
     LIMIT 1`,
    [roleId]
  );
  return rows[0] || null;
}

export async function listRolePermissionCodes(roleId) {
  const [rows] = await db.query(
    `SELECT p.code
     FROM admin_role_permissions rp
     JOIN admin_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?
     ORDER BY p.code ASC`,
    [roleId]
  );
  return rows.map((row) => row.code);
}

export async function listPermissionsByCodes(permissionCodes, connection = db) {
  if (!permissionCodes.length) {
    return [];
  }
  const [rows] = await connection.query(`SELECT id, code FROM admin_permissions WHERE code IN (?)`, [
    permissionCodes,
  ]);
  return rows;
}

export async function replaceRolePermissions(roleId, permissionIds, connection) {
  await connection.query(`DELETE FROM admin_role_permissions WHERE role_id = ?`, [roleId]);
  if (!permissionIds.length) {
    return;
  }
  const values = permissionIds.map((permissionId) => [roleId, permissionId]);
  await connection.query(`INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ?`, [values]);
}

export async function findAdminUserById(userId, connection = db) {
  const [rows] = await connection.query(
    `SELECT id, role, email, first_name, last_name
     FROM admin_users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function listUserOverrides(userId) {
  const [rows] = await db.query(
    `SELECT p.code AS permission_code, uo.effect
     FROM admin_user_permission_overrides uo
     JOIN admin_permissions p ON p.id = uo.permission_id
     WHERE uo.admin_user_id = ?
     ORDER BY p.code ASC`,
    [userId]
  );
  return rows;
}

export async function clearUserOverrides(userId, connection = db) {
  await connection.query(`DELETE FROM admin_user_permission_overrides WHERE admin_user_id = ?`, [userId]);
}

export async function insertUserOverrides(userId, overrides, permissionIdByCode, connection) {
  if (!overrides.length) {
    return;
  }
  const values = overrides.map((item) => [userId, permissionIdByCode.get(item.permission_code), item.effect]);
  await connection.query(
    `INSERT INTO admin_user_permission_overrides (admin_user_id, permission_id, effect) VALUES ?`,
    [values]
  );
}
