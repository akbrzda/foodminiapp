import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTenantSlug,
  isValidTenantSlug,
  buildTenantDbName,
  parseTenantSlugFromHost,
} from "../../src/modules/tenancy/slug.js";

test("tenancy slug: normalize trims and sanitizes", () => {
  const normalized = normalizeTenantSlug("  Panda Pizza!  ");
  assert.equal(normalized, "pandapizza");
});

test("tenancy slug: validation accepts safe lowercase slug", () => {
  assert.equal(isValidTenantSlug("panda-pizza"), true);
  assert.equal(isValidTenantSlug("Panda-Pizza"), true);
  assert.equal(isValidTenantSlug("panda pizza"), false);
});

test("tenancy slug: builds tenant db name by slug", () => {
  const dbName = buildTenantDbName("pandapizza");
  assert.equal(dbName, "tenant_pandapizza_db");
});

test("tenancy slug: resolves tenant slug from tenant host", () => {
  const slug = parseTenantSlugFromHost({
    host: "pandapizza.example.com",
    ownerHost: "owner.example.com",
    rootDomain: "example.com",
  });
  assert.equal(slug, "pandapizza");
});

test("tenancy slug: resolves tenant slug from app host", () => {
  const slug = parseTenantSlugFromHost({
    host: "app.pandapizza.example.com",
    ownerHost: "owner.example.com",
    rootDomain: "example.com",
  });
  assert.equal(slug, "pandapizza");
});

test("tenancy slug: ignores owner host", () => {
  const slug = parseTenantSlugFromHost({
    host: "owner.example.com",
    ownerHost: "owner.example.com",
    rootDomain: "example.com",
  });
  assert.equal(slug, null);
});

