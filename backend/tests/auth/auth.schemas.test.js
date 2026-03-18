import test from "node:test";
import assert from "node:assert/strict";
import { requireMiniAppPayload, requireAdminCredentials } from "../../src/modules/auth/auth.schemas.js";

test("auth.schemas: requireAdminCredentials возвращает нормализованные данные", () => {
  const result = requireAdminCredentials({ email: "  user@example.com  ", password: "secret" });
  assert.equal(result.email, "user@example.com");
  assert.equal(result.password, "secret");
});

test("auth.schemas: requireAdminCredentials выбрасывает ошибку без обязательных полей", () => {
  assert.throws(
    () => requireAdminCredentials({ email: "" }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message, "Email and password are required");
      return true;
    }
  );
});

test("auth.schemas: requireMiniAppPayload возвращает platform/initData/phone", () => {
  const payload = requireMiniAppPayload({
    platform: "MAX",
    initData: "abc",
    phone: " +79991234567 ",
  });

  assert.equal(payload.platform, "max");
  assert.equal(payload.initData, "abc");
  assert.equal(payload.phone, "+79991234567");
});

test("auth.schemas: requireMiniAppPayload выбрасывает ошибку при неизвестной платформе", () => {
  assert.throws(
    () => requireMiniAppPayload({ platform: "web", initData: "x" }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message, "Valid platform is required");
      return true;
    }
  );
});
