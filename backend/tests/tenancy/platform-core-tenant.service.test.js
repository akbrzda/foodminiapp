import test from "node:test";
import assert from "node:assert/strict";
import { platformCoreTenantService } from "../../src/modules/tenancy/platform-core-tenant.service.js";
import { tenantRegistryRepository } from "../../src/modules/tenancy/tenant-registry.repository.js";

test("platform core tenant service: returns null when tenant is not found", async () => {
  const originalGetBySlug = tenantRegistryRepository.getBySlug;
  tenantRegistryRepository.getBySlug = async () => null;

  const tenant = await platformCoreTenantService.getBySlug("ghost");

  tenantRegistryRepository.getBySlug = originalGetBySlug;
  assert.equal(tenant, null);
});

test("platform core tenant service: normalizes status and preserves tenant payload", async () => {
  const originalGetBySlug = tenantRegistryRepository.getBySlug;
  tenantRegistryRepository.getBySlug = async () => ({
    id: 17,
    slug: "panda",
    db_name: "tenant_panda_db",
    status: " CANCELLED ",
  });

  const tenant = await platformCoreTenantService.getBySlug("panda");

  tenantRegistryRepository.getBySlug = originalGetBySlug;
  assert.equal(tenant?.id, 17);
  assert.equal(tenant?.slug, "panda");
  assert.equal(tenant?.status, "cancelled");
});

test("platform core tenant service: exposes blocked status helpers", () => {
  assert.equal(platformCoreTenantService.isBlockedStatus("active"), false);
  assert.equal(platformCoreTenantService.isBlockedStatus("deleted"), true);
  assert.equal(platformCoreTenantService.getBlockedStatusCode("cancelled"), "TENANT_SUSPENDED");
  assert.equal(platformCoreTenantService.getBlockedStatusCode("deleted"), "TENANT_DELETED");
});
