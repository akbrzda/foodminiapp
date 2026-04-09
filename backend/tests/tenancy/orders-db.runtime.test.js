import test from "node:test";
import assert from "node:assert/strict";
import db from "../../src/config/database.js";
import { tenancyConfig } from "../../src/config/tenancy.js";
import { getOrdersDbByRequest } from "../../src/modules/orders/orders-db.runtime.js";

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

