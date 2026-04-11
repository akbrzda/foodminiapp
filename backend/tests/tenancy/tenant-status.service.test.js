import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTenantStatus,
  isTenantStatusBlocked,
  getTenantStatusCode,
} from "../../src/modules/tenancy/tenant-status.service.js";

test("tenant status: blocked statuses are suspended/cancelled/deleted", () => {
  assert.equal(isTenantStatusBlocked("suspended"), true);
  assert.equal(isTenantStatusBlocked("cancelled"), true);
  assert.equal(isTenantStatusBlocked("deleted"), true);
  assert.equal(isTenantStatusBlocked("active"), false);
});

test("tenant status: normalizer keeps known status and marks unknown", () => {
  assert.equal(normalizeTenantStatus("trial"), "trial");
  assert.equal(normalizeTenantStatus(" CANCELLED "), "cancelled");
  assert.equal(normalizeTenantStatus("legacy_state"), "unknown");
  assert.equal(normalizeTenantStatus(""), "");
});

test("tenant status: status code formatter returns unified API contract", () => {
  assert.equal(getTenantStatusCode("suspended"), "TENANT_SUSPENDED");
  assert.equal(getTenantStatusCode("  cancelled "), "TENANT_SUSPENDED");
  assert.equal(getTenantStatusCode("deleted"), "TENANT_DELETED");
  assert.equal(getTenantStatusCode("active"), "TENANT_ACTIVE");
  assert.equal(getTenantStatusCode(""), "TENANT_STATUS_UNKNOWN");
});

