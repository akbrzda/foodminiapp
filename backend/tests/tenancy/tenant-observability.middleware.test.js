import test from "node:test";
import assert from "node:assert/strict";
import { tenancyConfig } from "../../src/config/tenancy.js";
import { logger } from "../../src/utils/logger.js";
import { logTenantAccess } from "../../src/modules/tenancy/tenant-observability.middleware.js";

test("tenant observability middleware: logs tenant_id and slug for resolved tenant", () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  const originalInfo = logger.system.info;
  tenancyConfig.runtimeEnabled = true;

  const calls = [];
  logger.system.info = (message, context) => {
    calls.push({ message, context });
  };

  let nextCalled = false;
  const middleware = logTenantAccess("orders");
  middleware(
    {
      method: "GET",
      originalUrl: "/api/orders",
      tenantContext: {
        isResolved: true,
        tenantId: 77,
        slug: "pandapizza",
        status: "active",
        source: "host",
      },
    },
    {},
    () => {
      nextCalled = true;
    },
  );

  logger.system.info = originalInfo;
  tenancyConfig.runtimeEnabled = previousEnabled;

  assert.equal(nextCalled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, "Tenant module access");
  assert.equal(calls[0].context?.tenant_id, 77);
  assert.equal(calls[0].context?.slug, "pandapizza");
  assert.equal(calls[0].context?.module, "orders");
});

test("tenant observability middleware: skips log when tenant runtime is disabled", () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  const originalInfo = logger.system.info;
  tenancyConfig.runtimeEnabled = false;

  let called = false;
  logger.system.info = () => {
    called = true;
  };

  let nextCalled = false;
  const middleware = logTenantAccess("settings");
  middleware({ tenantContext: { isResolved: true } }, {}, () => {
    nextCalled = true;
  });

  logger.system.info = originalInfo;
  tenancyConfig.runtimeEnabled = previousEnabled;

  assert.equal(nextCalled, true);
  assert.equal(called, false);
});
