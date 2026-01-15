import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import db from "../config/database.js";

dotenv.config();

// Создаем отдельный pool с multipleStatements для миграций с PREPARE/EXECUTE
const migrationDbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "miniapp_user",
  password: process.env.DB_PASSWORD || "miniapp_password_change_me",
  database: process.env.DB_NAME || "miniapp_panda",
  charset: "utf8mb4_unicode_ci",
  multipleStatements: true, // Включаем поддержку нескольких statements
  waitForConnections: true,
  connectionLimit: 1,
};

const migrationConnection = mysql.createPool(migrationDbConfig);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Выполнить миграцию и интегрировать её в schema.sql
 */
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Получаем уже выполненные миграции
    const [executedRows] = await db.query("SELECT name FROM migrations ORDER BY id");
    const executedMigrations = executedRows.map((row) => row.name);

    // Путь к schema.sql
    const schemaPath = path.join(__dirname, "../../database/schema.sql");

    // Читаем текущий schema.sql
    let schemaContent = "";
    if (fs.existsSync(schemaPath)) {
      schemaContent = fs.readFileSync(schemaPath, "utf8");
    }

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

      // Читаем SQL из миграции
      let migrationSQL = fs.readFileSync(migrationPath, "utf8");

      // Удаляем комментарии
      migrationSQL = migrationSQL.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

      // Для миграций с PREPARE/EXECUTE нужно выполнять весь блок целиком
      // Проверяем наличие PREPARE/EXECUTE блоков
      if (migrationSQL.includes("PREPARE") || migrationSQL.includes("EXECUTE")) {
        // Выполняем весь SQL как один блок через connection с multipleStatements
        try {
          await migrationConnection.query(migrationSQL);
        } catch (error) {
          // Игнорируем ошибки "уже существует" для некоторых операций
          if (
            !error.message.includes("already exists") &&
            !error.message.includes("Duplicate") &&
            !error.message.includes("Unknown column") &&
            !error.message.includes("doesn't exist") &&
            !error.message.includes("near 'NULL'") // Для случаев когда PREPARE возвращает NULL (колонка уже существует)
          ) {
            throw error;
          } else {
            console.log(`  ⚠️  Пропущена ошибка (вероятно уже выполнено): ${error.message.substring(0, 80)}`);
          }
        }
      } else {
        // Обычные миграции - разбиваем по точкам с запятой
        const statements = migrationSQL
          .split(";")
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0);

        for (const statement of statements) {
          if (statement.trim()) {
            try {
              await db.query(statement);
            } catch (error) {
              // Игнорируем ошибки "уже существует" для некоторых операций
              if (
                !error.message.includes("already exists") &&
                !error.message.includes("Duplicate") &&
                !error.message.includes("Unknown column") &&
                !error.message.includes("doesn't exist")
              ) {
                throw error;
              }
            }
          }
        }
      }

      // Записываем в таблицу миграций
      await db.query("INSERT INTO migrations (name) VALUES (?)", [file]);

      // Добавляем SQL миграции в schema.sql
      // Добавляем миграцию в конец файла с комментарием
      const migrationComment = `\n\n-- ============================================\n-- Migration: ${file}\n-- Executed: ${new Date().toISOString()}\n-- ============================================\n\n`;
      
      // Убираем комментарии из начала миграции (если они есть)
      let cleanMigrationSQL = migrationSQL.trim();
      
      // Добавляем миграцию в конец файла
      if (!schemaContent.endsWith("\n")) {
        schemaContent += "\n";
      }
      schemaContent += migrationComment + cleanMigrationSQL + "\n";

      // Удаляем файл миграции
      fs.unlinkSync(migrationPath);
      console.log(`  ✅ Миграция выполнена и добавлена в schema.sql`);
      console.log(`  🗑️  Файл миграции удален: ${file}\n`);

      executedCount++;
    }

    // Сохраняем обновленный schema.sql
    if (executedCount > 0) {
      fs.writeFileSync(schemaPath, schemaContent, "utf8");
      console.log(`✅ Schema.sql обновлен (добавлено миграций: ${executedCount})`);
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
    await db.end();
    await migrationPool.end();
  }
})();
