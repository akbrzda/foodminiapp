import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Таблица для отслеживания миграций
const createMigrationsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(query);
};

// Получить выполненные миграции
const getExecutedMigrations = async () => {
  const [rows] = await pool.query("SELECT name FROM migrations ORDER BY id");
  return rows.map((row) => row.name);
};

// Выполнить миграцию
const executeMigration = async (migrationPath, migrationName) => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = sql.split(";").filter((stmt) => stmt.trim());

  console.log(`Выполнение миграции: ${migrationName}...`);

  for (const statement of statements) {
    if (statement.trim()) {
      await pool.query(statement);
    }
  }

  await pool.query("INSERT INTO migrations (name) VALUES (?)", [migrationName]);
  console.log(`✅ Миграция ${migrationName} выполнена`);
};

// Запустить все миграции
export const runMigrations = async () => {
  try {
    console.log("🔄 Запуск миграций...");

    await createMigrationsTable();
    const executedMigrations = await getExecutedMigrations();

    const migrationsDir = path.join(__dirname, "../../database/migrations");

    if (!fs.existsSync(migrationsDir)) {
      console.log("⚠️  Папка migrations не найдена, создаю...");
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let executedCount = 0;

    for (const file of migrationFiles) {
      if (!executedMigrations.includes(file)) {
        const migrationPath = path.join(migrationsDir, file);
        await executeMigration(migrationPath, file);
        executedCount++;
      }
    }

    if (executedCount === 0) {
      console.log("✅ Все миграции уже выполнены");
    } else {
      console.log(`✅ Выполнено миграций: ${executedCount}`);
    }

    return true;
  } catch (error) {
    console.error("❌ Ошибка при выполнении миграций:", error);
    throw error;
  }
};

// Создать новую миграцию
export const createMigration = (name) => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0];
  const fileName = `${timestamp}_${name}.sql`;
  const migrationsDir = path.join(__dirname, "../../database/migrations");

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const filePath = path.join(migrationsDir, fileName);
  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your SQL statements here

`;

  fs.writeFileSync(filePath, template);
  console.log(`✅ Создана миграция: ${fileName}`);
  return fileName;
};
