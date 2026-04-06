import mysql from "mysql2/promise";
import { tenancyConfig } from "../../config/tenancy.js";

let platformCorePool = null;

const createPlatformPool = () =>
  mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: tenancyConfig.platformDbName,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    dateStrings: false,
    waitForConnections: true,
    connectionLimit: tenancyConfig.dbConnectionLimit,
    queueLimit: 0,
  });

export const getPlatformCorePool = () => {
  if (!platformCorePool) {
    platformCorePool = createPlatformPool();
  }
  return platformCorePool;
};

export const closePlatformCorePool = async () => {
  if (!platformCorePool) return;
  const pool = platformCorePool;
  platformCorePool = null;
  await pool.end();
};

