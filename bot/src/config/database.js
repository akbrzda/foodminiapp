import mysql from "mysql2/promise";

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "miniapp_user",
  password: process.env.DB_PASSWORD || "miniapp_password_change_me",
  database: process.env.DB_NAME || "miniapp_panda",
  charset: "utf8mb4_unicode_ci",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const db = mysql.createPool(dbConfig);

export const testConnection = async () => {
  const connection = await db.getConnection();
  await connection.ping();
  connection.release();
};

export default db;
