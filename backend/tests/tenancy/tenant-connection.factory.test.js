import test from "node:test";
import assert from "node:assert/strict";
import { tenancyConfig } from "../../src/config/tenancy.js";
import {
  getTenantConnectionByRequest,
  getTenantPoolByRequest,
} from "../../src/modules/tenancy/tenant-connection.factory.js";
import { tenantDbManager } from "../../src/modules/tenancy/tenant-db-manager.js";

test("tenant connection factory: returns null when runtime is disabled", async () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  tenancyConfig.runtimeEnabled = false;

  const pool = await getTenantPoolByRequest({
    tenantContext: { isResolved: true, dbName: "tenant_a_db" },
  });

  tenancyConfig.runtimeEnabled = previousEnabled;
  assert.equal(pool, null);
});

test("tenant connection factory: resolves pool by dbName from tenant context", async () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  const originalGetPool = tenantDbManager.getPool;
  tenancyConfig.runtimeEnabled = true;

  let requestedDbName = "";
  const poolMock = { marker: "tenant-pool" };
  tenantDbManager.getPool = async (dbName) => {
    requestedDbName = dbName;
    return poolMock;
  };

  const pool = await getTenantPoolByRequest({
    tenantContext: { isResolved: true, dbName: "tenant_a_db" },
  });

  tenantDbManager.getPool = originalGetPool;
  tenancyConfig.runtimeEnabled = previousEnabled;
  assert.equal(requestedDbName, "tenant_a_db");
  assert.equal(pool, poolMock);
});

test("tenant connection factory: returns connection from tenant pool", async () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  const originalGetPool = tenantDbManager.getPool;
  tenancyConfig.runtimeEnabled = true;

  const connectionMock = { threadId: 101 };
  tenantDbManager.getPool = async () => ({
    getConnection: async () => connectionMock,
  });

  const connection = await getTenantConnectionByRequest({
    tenantContext: { isResolved: true, dbName: "tenant_a_db" },
  });

  tenantDbManager.getPool = originalGetPool;
  tenancyConfig.runtimeEnabled = previousEnabled;
  assert.equal(connection, connectionMock);
});
