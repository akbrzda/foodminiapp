import { runMigrations } from "../utils/migrations.js";
import pool from "../config/database.js";

(async () => {
  try {
    console.log("🚀 Запуск миграций базы данных...\n");
    await runMigrations();
    console.log("\n✅ Миграции успешно завершены");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Ошибка при выполнении миграций:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
