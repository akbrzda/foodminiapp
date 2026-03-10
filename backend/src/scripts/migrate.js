import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const requiredMigrationEnv = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
for (const envName of requiredMigrationEnv) {
  const value = String(process.env[envName] || "").trim();
  if (!value) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${envName}`);
  }
}

const dbPort = Number.parseInt(process.env.DB_PORT, 10);
if (!Number.isFinite(dbPort) || dbPort <= 0) {
  throw new Error("Переменная DB_PORT должна быть положительным числом");
}

const migrationDbConfig = {
  host: process.env.DB_HOST,
  port: dbPort,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4_unicode_ci",
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 1,
};
const migrationConnection = mysql.createPool(migrationDbConfig);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function runMigration() {
  try {
    const migrationsDir = path.join(__dirname, "../../database/migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log("⚠️  Папка migrations не найдена");
      process.exit(0);
    }
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    if (migrationFiles.length === 0) {
      console.log("✅ Нет файлов миграций для выполнения");
      process.exit(0);
    }
    console.log(`📋 Найдено миграций: ${migrationFiles.length}\n`);
    await migrationConnection.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    const [executedRows] = await migrationConnection.query("SELECT name FROM migrations ORDER BY id");
    const executedMigrations = executedRows.map((row) => row.name);
    let executedCount = 0;
    for (const file of migrationFiles) {
      if (executedMigrations.includes(file)) {
        console.log(`⏭️  Пропущена (уже выполнена): ${file}`);
        continue;
      }
      const migrationPath = path.join(migrationsDir, file);
      console.log(`🔄 Выполнение миграции: ${file}...`);
      const migrationSQL = fs.readFileSync(migrationPath, "utf8");
      const connection = await migrationConnection.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(migrationSQL);
        await connection.query("INSERT INTO migrations (name) VALUES (?)", [file]);
        await connection.commit();
        console.log("  ✅ Миграция выполнена\n");
        executedCount++;
      } catch (migrationError) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(`  ⚠️ Не удалось откатить миграцию ${file}:`, rollbackError);
        }
        throw migrationError;
      } finally {
        connection.release();
      }
    }
    if (executedCount === 0) {
      console.log("✅ Все миграции уже выполнены");
    } else {
      console.log(`\n✅ Выполнено миграций: ${executedCount}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Ошибка при выполнении миграций:", error);
    throw error;
  }
}
(async () => {
  try {
    await runMigration();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await migrationConnection.end();
  }
})();
