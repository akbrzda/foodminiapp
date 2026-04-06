import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const platformDbName = String(process.env.PLATFORM_DB_NAME || "platform_core").trim();

const requiredEnv = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD"];
for (const envName of requiredEnv) {
  if (!String(process.env[envName] || "").trim()) {
    throw new Error(`Missing required environment variable: ${envName}`);
  }
}

const getConnection = (database = undefined) =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ...(database ? { database } : {}),
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    multipleStatements: true,
  });

const ensurePlatformDatabase = async () => {
  const connection = await getConnection();
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${platformDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
};

const ensureMigrationsTable = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS platform_core_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_platform_core_migrations_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const listSqlFiles = () => {
  const migrationsDir = path.join(__dirname, "../../database/platform-core");
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, fullPath: path.join(migrationsDir, file) }));
};

const run = async () => {
  await ensurePlatformDatabase();
  const connection = await getConnection(platformDbName);
  try {
    await ensureMigrationsTable(connection);
    const [rows] = await connection.query(
      "SELECT name FROM platform_core_migrations ORDER BY id"
    );
    const executed = new Set(rows.map((row) => row.name));
    const files = listSqlFiles();

    if (files.length === 0) {
      console.info("No platform-core SQL files found.");
      return;
    }

    let executedCount = 0;
    for (const migration of files) {
      if (executed.has(migration.file)) {
        console.info(`skip: ${migration.file}`);
        continue;
      }

      const sql = fs.readFileSync(migration.fullPath, "utf8");
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query(
          "INSERT INTO platform_core_migrations (name) VALUES (?)",
          [migration.file]
        );
        await connection.commit();
        executedCount += 1;
        console.info(`ok: ${migration.file}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    console.info(`Platform core migrations done. Executed: ${executedCount}`);
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error("Platform core migration failed:", error.message);
  process.exit(1);
});

