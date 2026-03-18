import db from "../../config/database.js";

const USER_FIELDS = `u.id, u.telegram_id, u.phone, u.first_name, u.last_name, u.email, u.date_of_birth,
  u.loyalty_balance, u.current_loyalty_level_id, u.loyalty_joined_at, u.registration_type, u.bot_registered_at`;

export const authRepository = {
  findUserByTelegramId: async (telegramId) => {
    const [rows] = await db.query(
      `SELECT ${USER_FIELDS}
       FROM users u
       WHERE u.telegram_id = ?`,
      [telegramId]
    );
    return rows[0] || null;
  },

  findUserById: async (userId) => {
    const [rows] = await db.query(
      `SELECT ${USER_FIELDS}
       FROM users u
       WHERE u.id = ?`,
      [userId]
    );
    return rows[0] || null;
  },

  findUserByPhone: async (phone) => {
    const [rows] = await db.query(
      `SELECT ${USER_FIELDS}
       FROM users u
       WHERE u.phone = ?
       LIMIT 1`,
      [phone]
    );
    return rows[0] || null;
  },

  updateUserById: async (userId, updates) => {
    const fields = Object.entries(updates || {}).filter((entry) => entry[1] !== undefined);
    if (fields.length === 0) return;

    const setSql = fields.map(([key]) => `${key} = ?`).join(", ");
    const values = fields.map(([, value]) => value);
    values.push(userId);

    await db.query(`UPDATE users SET ${setSql} WHERE id = ?`, values);
  },

  insertTelegramUser: async ({ telegramId, firstName, lastName }) => {
    const [result] = await db.query(
      "INSERT INTO users (telegram_id, registration_type, bot_registered_at, phone, first_name, last_name) VALUES (?, 'miniapp', NULL, ?, ?, ?)",
      [telegramId, null, firstName || null, lastName || null]
    );
    return result.insertId;
  },

  insertMiniAppUser: async ({ firstName, lastName }) => {
    const [result] = await db.query(
      "INSERT INTO users (registration_type, bot_registered_at, phone, first_name, last_name) VALUES ('miniapp', NULL, ?, ?, ?)",
      [null, firstName || null, lastName || null]
    );
    return result.insertId;
  },

  findExternalAccount: async ({ platform, externalId }) => {
    const [rows] = await db.query(
      `SELECT id, user_id, platform, external_id
       FROM user_external_accounts
       WHERE platform = ? AND external_id = ?
       LIMIT 1`,
      [platform, externalId]
    );
    return rows[0] || null;
  },

  findUserByExternalAccount: async ({ platform, externalId }) => {
    const [rows] = await db.query(
      `SELECT ${USER_FIELDS}
       FROM user_external_accounts uea
       JOIN users u ON u.id = uea.user_id
       WHERE uea.platform = ? AND uea.external_id = ?
       LIMIT 1`,
      [platform, externalId]
    );
    return rows[0] || null;
  },

  insertExternalAccount: async ({ userId, platform, externalId }) => {
    await db.query(
      `INSERT INTO user_external_accounts (user_id, platform, external_id)
       VALUES (?, ?, ?)`,
      [userId, platform, externalId]
    );
  },

  setInitialLoyaltyForUser: async (userId) => {
    await db.query(
      "UPDATE users SET current_loyalty_level_id = 1, loyalty_joined_at = NOW() WHERE id = ?",
      [userId]
    );
  },

  findAdminByEmailWithPassword: async (email) => {
    const [rows] = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, role, is_active, branch_id, telegram_id, eruda_enabled, permission_version
       FROM admin_users WHERE email = ?`,
      [email]
    );
    return rows[0] || null;
  },

  findAdminByIdForRefresh: async (adminId) => {
    const [rows] = await db.query(
      `SELECT id, email, role, is_active, permission_version
       FROM admin_users
       WHERE id = ?
       LIMIT 1`,
      [adminId]
    );
    return rows[0] || null;
  },

  findAdminByIdForSession: async (adminId) => {
    const [rows] = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, branch_id, telegram_id, eruda_enabled, permission_version
       FROM admin_users
       WHERE id = ?
       LIMIT 1`,
      [adminId]
    );
    return rows[0] || null;
  },

  findClientByIdForRefresh: async (userId) => {
    const [rows] = await db.query(
      `SELECT id, telegram_id
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  findClientById: async (userId) => {
    const [rows] = await db.query("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
    return rows[0] || null;
  },

  findAdminById: async (adminId) => {
    const [rows] = await db.query("SELECT id, is_active FROM admin_users WHERE id = ? LIMIT 1", [
      adminId,
    ]);
    return rows[0] || null;
  },

  getManagerCities: async (adminUserId) => {
    const [rows] = await db.query(`SELECT city_id FROM admin_user_cities WHERE admin_user_id = ?`, [
      adminUserId,
    ]);
    return rows.map((city) => city.city_id);
  },

  getManagerBranches: async (adminUserId) => {
    const [rows] = await db.query(
      `SELECT b.id, b.name, b.city_id
       FROM admin_user_branches aub
       JOIN branches b ON aub.branch_id = b.id
       WHERE aub.admin_user_id = ?`,
      [adminUserId]
    );
    return rows || [];
  },

  logAdminAuthAction: async ({ adminUserId, action, description, ipAddress, userAgent }) => {
    await db.query(
      `INSERT INTO admin_action_logs (admin_user_id, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminUserId, action, "auth", adminUserId, description || null, ipAddress, userAgent]
    );
  },
};
