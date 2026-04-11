import test from "node:test";
import assert from "node:assert/strict";
import redis from "../../src/config/redis.js";
import { tenancyConfig } from "../../src/config/tenancy.js";
import { tenantDbManager } from "../../src/modules/tenancy/tenant-db-manager.js";
import {
  getSettingsByRequest,
  updateSettingsByRequest,
} from "../../src/modules/settings/settings-runtime.js";

const createInMemoryTenantPool = () => {
  const store = new Map();

  const writeSetting = (key, value) => {
    store.set(key, value);
    return [{ affectedRows: 1 }];
  };

  return {
    async query(sql, params = []) {
      if (String(sql).includes("SELECT `key`, value FROM system_settings")) {
        const rows = Array.from(store.entries()).map(([key, value]) => ({ key, value }));
        return [rows];
      }

      if (String(sql).includes("INSERT INTO system_settings")) {
        const [key, value] = params;
        return writeSetting(key, value);
      }

      return [[]];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async query(sql, params = []) {
          if (String(sql).includes("INSERT INTO system_settings")) {
            const [key, value] = params;
            return writeSetting(key, value);
          }

          return [[]];
        },
      };
    },
  };
};

test("settings runtime integration: tenant A/B isolation for update + read", async () => {
  const previousRuntimeEnabled = tenancyConfig.runtimeEnabled;
  const originalGetPool = tenantDbManager.getPool;
  const originalRedisGet = redis.get.bind(redis);
  const originalRedisSet = redis.set.bind(redis);
  const originalRedisDel = redis.del.bind(redis);

  tenancyConfig.runtimeEnabled = true;

  const redisStore = new Map();
  const touchedCacheKeys = [];
  redis.get = async (key) => redisStore.get(String(key)) || null;
  redis.set = async (key, value) => {
    redisStore.set(String(key), String(value));
    touchedCacheKeys.push(String(key));
    return "OK";
  };
  redis.del = async (key) => {
    redisStore.delete(String(key));
    touchedCacheKeys.push(String(key));
    return 1;
  };

  const poolsByDb = new Map([
    ["tenant_alpha_db", createInMemoryTenantPool()],
    ["tenant_bravo_db", createInMemoryTenantPool()],
  ]);
  tenantDbManager.getPool = async (dbName) => poolsByDb.get(dbName);

  try {
    const tenantARequest = {
      tenantContext: {
        isResolved: true,
        tenantId: 101,
        dbName: "tenant_alpha_db",
      },
    };
    const tenantBRequest = {
      tenantContext: {
        isResolved: true,
        tenantId: 202,
        dbName: "tenant_bravo_db",
      },
    };

    const tenantAUpdate = await updateSettingsByRequest(tenantARequest, {
      site_currency: "USD",
      orders_enabled: false,
    });
    const tenantBUpdate = await updateSettingsByRequest(tenantBRequest, {
      site_currency: "KZT",
      orders_enabled: true,
    });

    const tenantASettings = await getSettingsByRequest(tenantARequest);
    const tenantBSettings = await getSettingsByRequest(tenantBRequest);

    assert.equal(tenantAUpdate.errors, null);
    assert.equal(tenantBUpdate.errors, null);

    assert.equal(tenantASettings.site_currency, "USD");
    assert.equal(tenantBSettings.site_currency, "KZT");
    assert.equal(tenantASettings.orders_enabled, false);
    assert.equal(tenantBSettings.orders_enabled, true);

    assert.ok(touchedCacheKeys.includes("settings:tenant:101"));
    assert.ok(touchedCacheKeys.includes("settings:tenant:202"));
  } finally {
    tenantDbManager.getPool = originalGetPool;
    redis.get = originalRedisGet;
    redis.set = originalRedisSet;
    redis.del = originalRedisDel;
    tenancyConfig.runtimeEnabled = previousRuntimeEnabled;
  }
});
