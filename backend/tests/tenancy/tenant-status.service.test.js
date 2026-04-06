import test from "node:test";
import assert from "node:assert/strict";
import {
  isTenantStatusBlocked,
  getTenantStatusCode,
} from "../../src/modules/tenancy/tenant-status.service.js";

test("tenant status: blocked statuses are suspended/cancelled/deleted", () => {
  assert.equal(isTenantStatusBlocked("suspended"), true);
  assert.equal(isTenantStatusBlocked("cancelled"), true);
  assert.equal(isTenantStatusBlocked("deleted"), true);
  assert.equal(isTenantStatusBlocked("active"), false);
});

test("tenant status: status code formatter returns normalized code", () => {
  assert.equal(getTenantStatusCode("suspended"), "TENANT_SUSPENDED");
  assert.equal(getTenantStatusCode("  cancelled "), "TENANT_CANCELLED");
  assert.equal(getTenantStatusCode(""), "TENANT_STATUS_UNKNOWN");
});

