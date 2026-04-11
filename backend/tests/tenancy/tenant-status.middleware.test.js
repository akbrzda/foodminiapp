import test from "node:test";
import assert from "node:assert/strict";
import { requireActiveTenant } from "../../src/modules/tenancy/tenant-status.middleware.js";
import { tenancyConfig } from "../../src/config/tenancy.js";

const buildRes = () => {
  const payload = {
    statusCode: 200,
    body: null,
  };
  return {
    payload,
    status(code) {
      payload.statusCode = code;
      return this;
    },
    json(data) {
      payload.body = data;
      return this;
    },
  };
};

test("tenant status middleware: skips when tenancy runtime is disabled", async () => {
  const previous = tenancyConfig.runtimeEnabled;
  tenancyConfig.runtimeEnabled = false;

  let nextCalled = false;
  const req = {};
  const res = buildRes();
  await requireActiveTenant(req, res, () => {
    nextCalled = true;
  });

  tenancyConfig.runtimeEnabled = previous;
  assert.equal(nextCalled, true);
  assert.equal(res.payload.body, null);
});

test("tenant status middleware: returns 404 when tenant is unresolved in strict mode", async () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  const previousShadow = tenancyConfig.shadowMode;
  tenancyConfig.runtimeEnabled = true;
  tenancyConfig.shadowMode = false;

  let nextCalled = false;
  const req = { tenantContext: { isResolved: false } };
  const res = buildRes();
  await requireActiveTenant(req, res, () => {
    nextCalled = true;
  });

  tenancyConfig.runtimeEnabled = previousEnabled;
  tenancyConfig.shadowMode = previousShadow;
  assert.equal(nextCalled, false);
  assert.equal(res.payload.statusCode, 404);
  assert.equal(res.payload.body?.code, "TENANT_NOT_FOUND");
});

test("tenant status middleware: returns 403 for blocked tenant status", async () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  tenancyConfig.runtimeEnabled = true;

  let nextCalled = false;
  const req = {
    tenantContext: {
      isResolved: true,
      status: "suspended",
    },
  };
  const res = buildRes();
  await requireActiveTenant(req, res, () => {
    nextCalled = true;
  });

  tenancyConfig.runtimeEnabled = previousEnabled;
  assert.equal(nextCalled, false);
  assert.equal(res.payload.statusCode, 403);
  assert.equal(res.payload.body?.code, "TENANT_SUSPENDED");
});

test("tenant status middleware: returns unified code for cancelled status", async () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  tenancyConfig.runtimeEnabled = true;

  let nextCalled = false;
  const req = {
    tenantContext: {
      isResolved: true,
      status: "cancelled",
    },
  };
  const res = buildRes();
  await requireActiveTenant(req, res, () => {
    nextCalled = true;
  });

  tenancyConfig.runtimeEnabled = previousEnabled;
  assert.equal(nextCalled, false);
  assert.equal(res.payload.statusCode, 403);
  assert.equal(res.payload.body?.code, "TENANT_SUSPENDED");
});

test("tenant status middleware: returns deleted code for deleted status", async () => {
  const previousEnabled = tenancyConfig.runtimeEnabled;
  tenancyConfig.runtimeEnabled = true;

  let nextCalled = false;
  const req = {
    tenantContext: {
      isResolved: true,
      status: "deleted",
    },
  };
  const res = buildRes();
  await requireActiveTenant(req, res, () => {
    nextCalled = true;
  });

  tenancyConfig.runtimeEnabled = previousEnabled;
  assert.equal(nextCalled, false);
  assert.equal(res.payload.statusCode, 403);
  assert.equal(res.payload.body?.code, "TENANT_DELETED");
});

