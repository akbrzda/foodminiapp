import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { tenancyConfig } from "../config/tenancy.js";
import { assertValidTenantSlug, buildTenantDbName } from "../modules/tenancy/slug.js";

dotenv.config();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const getArgValue = (key) => {
    const found = args.find((item) => item.startsWith(`${key}=`));
    if (!found) return "";
    return found.slice(key.length + 1).trim();
  };
  return {
    slug: getArgValue("--slug"),
    name: getArgValue("--name"),
    email: getArgValue("--email"),
    dryRun: args.includes("--dry-run"),
  };
};

const assertRequiredEnv = () => {
  const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD"];
  for (const key of required) {
    if (!String(process.env[key] || "").trim()) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
};

const main = async () => {
  assertRequiredEnv();
  const { slug, name, email, dryRun } = parseArgs();

  if (!slug || !name) {
    throw new Error("Usage: node src/scripts/provision-tenant.js --slug=<slug> --name=<name> [--email=<email>] [--dry-run]");
  }

  const normalizedSlug = assertValidTenantSlug(slug);
  const dbName = buildTenantDbName(normalizedSlug);
  const tenantName = String(name || "").trim();
  const contactEmail = String(email || "").trim() || null;

  if (dryRun) {
    console.info(
      JSON.stringify(
        {
          mode: "dry-run",
          slug: normalizedSlug,
          dbName,
          tenantName,
          contactEmail,
          platformDbName: tenancyConfig.platformDbName,
        },
        null,
        2
      )
    );
    return;
  }

  const rootConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
  });

  const platformConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: tenancyConfig.platformDbName,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
  });

  try {
    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    const [tenantInsert] = await platformConnection.query(
      `INSERT INTO tenants (slug, db_name, name, contact_email, status)
       VALUES (?, ?, ?, ?, 'trial')`,
      [normalizedSlug, dbName, tenantName, contactEmail]
    );

    const tenantId = Number(tenantInsert?.insertId || 0) || null;
    if (tenantId) {
      await platformConnection.query(
        `INSERT INTO tenant_db_migrations (tenant_id, migration_name, status, metadata)
         VALUES (?, ?, 'pending', ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), metadata = VALUES(metadata)`,
        [tenantId, "tenant_schema_bootstrap", JSON.stringify({ source: "provision-tenant" })]
      );
    }

    console.info(
      JSON.stringify(
        {
          success: true,
          slug: normalizedSlug,
          dbName,
          tenantId,
          platformDbName: tenancyConfig.platformDbName,
          nextStep: "Run tenant schema migrations for the new database",
        },
        null,
        2
      )
    );
  } finally {
    await Promise.allSettled([rootConnection.end(), platformConnection.end()]);
  }
};

main().catch((error) => {
  console.error("Tenant provisioning failed:", error.message);
  process.exit(1);
});
