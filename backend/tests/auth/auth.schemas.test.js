import test from "node:test";
import assert from "node:assert/strict";
import {
  requireTelegramInitData,
  requireAdminCredentials,
} from "../../src/modules/auth/auth.schemas.js";

test("auth.schemas: requireTelegramInitData выбрасывает ошибку без initData", () => {
  assert.throws(
    () => requireTelegramInitData({}),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message, "Telegram initData is required");
      return true;
    }
  );
});

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
