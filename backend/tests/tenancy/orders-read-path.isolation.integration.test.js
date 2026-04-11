import test from "node:test";
import assert from "node:assert/strict";
import { tenancyConfig } from "../../src/config/tenancy.js";
import { tenantDbManager } from "../../src/modules/tenancy/tenant-db-manager.js";
import { getUserOrders } from "../../src/modules/orders/controllers/userOrdersController.js";

const createResponseMock = () => {
  const state = {
    statusCode: 200,
    payload: null,
  };

  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(data) {
      state.payload = data;
      return this;
    },
  };
};

test("orders read-path integration: tenant A/B isolation in getUserOrders", async () => {
  const previousRuntimeEnabled = tenancyConfig.runtimeEnabled;
  const originalGetPool = tenantDbManager.getPool;

  tenancyConfig.runtimeEnabled = true;

  const requestedDbNames = [];
  const tenantPools = {
    tenant_alpha_db: {
      async query() {
        return [[{ id: 1, order_number: "A-1001", tenant: "alpha" }]];
      },
    },
    tenant_bravo_db: {
      async query() {
        return [[{ id: 2, order_number: "B-2001", tenant: "bravo" }]];
      },
    },
  };

  tenantDbManager.getPool = async (dbName) => {
    requestedDbNames.push(dbName);
    return tenantPools[dbName];
  };

  try {
    const reqTenantA = {
      user: { id: 10 },
      query: {},
      tenantContext: {
        isResolved: true,
        dbName: "tenant_alpha_db",
      },
    };
    const reqTenantB = {
      user: { id: 10 },
      query: {},
      tenantContext: {
        isResolved: true,
        dbName: "tenant_bravo_db",
      },
    };

    const resTenantA = createResponseMock();
    const resTenantB = createResponseMock();
    let forwardedError = null;

    await getUserOrders(reqTenantA, resTenantA, (error) => {
      forwardedError = error || null;
    });
    await getUserOrders(reqTenantB, resTenantB, (error) => {
      forwardedError = error || null;
    });

    assert.equal(forwardedError, null);
    assert.equal(resTenantA.state.statusCode, 200);
    assert.equal(resTenantB.state.statusCode, 200);

    assert.equal(requestedDbNames[0], "tenant_alpha_db");
    assert.equal(requestedDbNames[1], "tenant_bravo_db");

    assert.equal(resTenantA.state.payload?.orders?.[0]?.order_number, "A-1001");
    assert.equal(resTenantB.state.payload?.orders?.[0]?.order_number, "B-2001");
    assert.equal(
      resTenantA.state.payload?.orders?.some((order) => order.order_number === "B-2001"),
      false,
    );
    assert.equal(
      resTenantB.state.payload?.orders?.some((order) => order.order_number === "A-1001"),
      false,
    );
  } finally {
    tenantDbManager.getPool = originalGetPool;
    tenancyConfig.runtimeEnabled = previousRuntimeEnabled;
  }
});
