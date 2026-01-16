import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const migrationDbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "miniapp_user",
  password: process.env.DB_PASSWORD || "miniapp_password_change_me",
  database: process.env.DB_NAME || "miniapp_panda",
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

    // Получаем список файлов миграций
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (migrationFiles.length === 0) {
      console.log("✅ Нет файлов миграций для выполнения");
      process.exit(0);
    }

    console.log(`📋 Найдено миграций: ${migrationFiles.length}\n`);

    // Создаем таблицу для отслеживания миграций
    await migrationConnection.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Получаем уже выполненные миграции
    const [executedRows] = await migrationConnection.query("SELECT name FROM migrations ORDER BY id");
    const executedMigrations = executedRows.map((row) => row.name);

    let executedCount = 0;

    // Обрабатываем каждую миграцию
    for (const file of migrationFiles) {
      // Пропускаем уже выполненные
      if (executedMigrations.includes(file)) {
        console.log(`⏭️  Пропущена (уже выполнена): ${file}`);
        continue;
      }

      const migrationPath = path.join(migrationsDir, file);
      console.log(`🔄 Выполнение миграции: ${file}...`);

      const migrationSQL = fs.readFileSync(migrationPath, "utf8");
      await migrationConnection.query(migrationSQL);

      // Записываем в таблицу миграций
      await migrationConnection.query("INSERT INTO migrations (name) VALUES (?)", [file]);
      console.log("  ✅ Миграция выполнена\n");

      executedCount++;
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

// Запуск
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
