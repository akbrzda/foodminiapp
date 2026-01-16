import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Конфигурация подключения к MySQL
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "miniapp_user",
  password: process.env.DB_PASSWORD || "miniapp_password_change_me",
  database: process.env.DB_NAME || "miniapp_panda",
  charset: "utf8_general_ci",
  timezone: "Z", // UTC timezone
  dateStrings: false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Создание пула соединений
const pool = mysql.createPool(dbConfig);

// Проверка подключения
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL connected successfully");
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ MySQL connection error:", error.message);
    return false;
  }
}

export default pool;
