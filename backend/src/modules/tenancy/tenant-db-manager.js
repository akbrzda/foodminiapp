import mysql from "mysql2/promise";
import { tenancyConfig } from "../../config/tenancy.js";

class TenantDbManager {
  constructor() {
    this.pools = new Map();
  }

  createPool(dbName) {
    return mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: dbName,
      charset: "utf8mb4_unicode_ci",
      timezone: "Z",
      dateStrings: false,
      waitForConnections: true,
      connectionLimit: tenancyConfig.dbConnectionLimit,
      queueLimit: 0,
    });
  }

  async evictIfNeeded() {
    if (this.pools.size < tenancyConfig.maxTenantPools) return;
    const oldest = this.pools.entries().next().value;
    if (!oldest) return;
    const [oldestDbName, oldestMeta] = oldest;
    this.pools.delete(oldestDbName);
    await oldestMeta.pool.end();
  }

  async getPool(dbName) {
    const existing = this.pools.get(dbName);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.pool;
    }

    await this.evictIfNeeded();
    const pool = this.createPool(dbName);
    this.pools.set(dbName, { pool, lastUsedAt: Date.now() });
    return pool;
  }

  async cleanupIdlePools() {
    const now = Date.now();
    const toClose = [];
    for (const [dbName, meta] of this.pools.entries()) {
      if (now - meta.lastUsedAt > tenancyConfig.poolIdleMs) {
        toClose.push([dbName, meta.pool]);
      }
    }
    for (const [dbName, pool] of toClose) {
      this.pools.delete(dbName);
      await pool.end();
    }
  }

  getStats() {
    return {
      poolsCount: this.pools.size,
      maxPools: tenancyConfig.maxTenantPools,
      idleMs: tenancyConfig.poolIdleMs,
    };
  }

  async closeAll() {
    const pending = [];
    for (const [, meta] of this.pools.entries()) {
      pending.push(meta.pool.end());
    }
    this.pools.clear();
    await Promise.allSettled(pending);
  }
}

export const tenantDbManager = new TenantDbManager();

