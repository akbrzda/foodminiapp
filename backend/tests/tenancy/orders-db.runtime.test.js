import test from "node:test";
import assert from "node:assert/strict";
import db from "../../src/config/database.js";
import { tenancyConfig } from "../../src/config/tenancy.js";
import { getOrdersDbByRequest } from "../../src/modules/orders/orders-db.runtime.js";
import { tenantDbManager } from "../../src/modules/tenancy/tenant-db-manager.js";

test("orders db runtime: returns legacy db when tenancy is disabled", async () => {
  const prevEnabled = tenancyConfig.runtimeEnabled;
  tenancyConfig.runtimeEnabled = false;

  const resolved = await getOrdersDbByRequest({});

  tenancyConfig.runtimeEnabled = prevEnabled;
  assert.equal(resolved, db);
});

test("orders db runtime: returns legacy db when tenant context is unresolved", async () => {
  const prevEnabled = tenancyConfig.runtimeEnabled;
  tenancyConfig.runtimeEnabled = true;

  const resolved = await getOrdersDbByRequest({
    tenantContext: { isResolved: false },
  });

  tenancyConfig.runtimeEnabled = prevEnabled;
  assert.equal(resolved, db);
});

test("orders db runtime: resolves tenant db from tenant context", async () => {
  const prevEnabled = tenancyConfig.runtimeEnabled;
  const originalGetPool = tenantDbManager.getPool;
  tenancyConfig.runtimeEnabled = true;

  const tenantPoolA = { marker: "tenant-a" };
  let requestedDbName = "";
  tenantDbManager.getPool = async (dbName) => {
    requestedDbName = dbName;
    return tenantPoolA;
  };

  const resolved = await getOrdersDbByRequest({
    tenantContext: { isResolved: true, dbName: "tenant_a_db" },
  });

  tenantDbManager.getPool = originalGetPool;
  tenancyConfig.runtimeEnabled = prevEnabled;
  assert.equal(requestedDbName, "tenant_a_db");
  assert.equal(resolved, tenantPoolA);
});

