import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/database.js";
import dotenv from "dotenv";
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function initDatabase() {
  try {
    console.log("🚀 Инициализация базы данных...\n");
    const schemaPath = path.join(__dirname, "../../database/schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Файл schema.sql не найден: ${schemaPath}`);
    }
    console.log("📄 Выполнение schema.sql...");
    let schemaSQL = fs.readFileSync(schemaPath, "utf8");
    schemaSQL = schemaSQL.replace(/--.*$/gm, "");
    schemaSQL = schemaSQL.replace(/\/\*[\s\S]*?\*\//g, "");
    const statements = schemaSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);
    console.log(`  Найдено SQL statements: ${statements.length}`);
    let executedCount = 0;
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await db.query(statement);
          executedCount++;
        } catch (error) {
          if (error.message.includes("already exists") || error.message.includes("Duplicate")) {
          } else {
            console.warn(`⚠️  Предупреждение при выполнении: ${error.message.substring(0, 100)}`);
          }
        }
      }
    }
    console.log(`  Выполнено statements: ${executedCount}`);
    console.log("✅ Schema.sql выполнен\n");
    const initDir = path.join(__dirname, "../../database/init");
    if (fs.existsSync(initDir)) {
      const seedFiles = fs
        .readdirSync(initDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();
      if (seedFiles.length > 0) {
        console.log("🌱 Выполнение seed файлов...");
        for (const file of seedFiles) {
          const seedPath = path.join(initDir, file);
          const seedSQL = fs.readFileSync(seedPath, "utf8");
          console.log(`  - ${file}...`);
          let cleanSeedSQL = seedSQL.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
          const seedStatements = cleanSeedSQL
            .split(";")
            .map((stmt) => stmt.trim())
            .filter((stmt) => stmt.length > 0);
          for (const statement of seedStatements) {
            if (statement.trim()) {
              try {
                await db.query(statement);
              } catch (error) {
                if (error.message.includes("Duplicate entry") || error.message.includes("already exists")) {
                } else {
                  console.warn(`    ⚠️  Предупреждение: ${error.message.substring(0, 100)}`);
                }
              }
            }
          }
          console.log(`  ✅ ${file} выполнен`);
        }
        console.log("");
      }
    }
    console.log("✅ База данных успешно инициализирована");
    return true;
  } catch (error) {
    console.error("❌ Ошибка при инициализации базы данных:", error);
    throw error;
  }
}
(async () => {
  try {
    await initDatabase();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
