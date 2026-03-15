import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminAuthPayload,
  buildAdminSessionUser,
  sanitizeAdminUser,
} from "../../src/modules/auth/auth.mapper.js";

const fixture = {
  user: {
    id: 7,
    email: "admin@example.com",
    permission_version: 3,
    password_hash: "hash",
  },
  roleContext: {
    code: "manager",
    name: "Менеджер",
  },
  cities: [1, 2],
  branches: [
    { id: 10, city_id: 1, name: "A" },
    { id: 11, city_id: 2, name: "B" },
  ],
  permissions: ["orders.view"],
};

test("auth.mapper: buildAdminAuthPayload формирует payload для JWT", () => {
  const payload = buildAdminAuthPayload(fixture);

  assert.equal(payload.id, 7);
  assert.equal(payload.type, "admin");
  assert.deepEqual(payload.branch_ids, [10, 11]);
  assert.deepEqual(payload.branch_city_ids, [1, 2]);
  assert.equal(payload.permission_version, 3);
});

test("auth.mapper: buildAdminSessionUser формирует user для сессии", () => {
  const sessionUser = buildAdminSessionUser(fixture);

  assert.equal(sessionUser.role_name, "Менеджер");
  assert.deepEqual(sessionUser.permissions, ["orders.view"]);
  assert.equal(sessionUser.branches.length, 2);
});

test("auth.mapper: sanitizeAdminUser удаляет password_hash", () => {
  const user = sanitizeAdminUser(fixture.user);
  assert.equal(user.password_hash, undefined);
});
