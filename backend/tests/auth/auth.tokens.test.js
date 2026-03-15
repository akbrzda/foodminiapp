import test from "node:test";
import assert from "node:assert/strict";
import {
  TOKEN_AUDIENCES,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getTokenTtlSeconds,
} from "../../src/modules/auth/auth.tokens.js";

process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  "test-secret-test-secret-test-secret-test-secret-test-secret-test-secret-1234";

test("auth.tokens: access token подписывается и верифицируется", () => {
  const payload = { id: 1, type: "client", telegram_id: "123" };
  const token = signAccessToken(payload, TOKEN_AUDIENCES.accessClient, "15m");
  const decoded = verifyAccessToken(token);

  assert.equal(decoded.id, 1);
  assert.equal(decoded.type, "client");
  assert.equal(decoded.telegram_id, "123");
});

test("auth.tokens: refresh token содержит token_type и валиден", () => {
  const payload = { id: 2, type: "admin", role: "admin" };
  const token = signRefreshToken(payload, TOKEN_AUDIENCES.refreshAdmin, "1h");
  const decoded = verifyRefreshToken(token);

  assert.equal(decoded.id, 2);
  assert.equal(decoded.type, "admin");
  assert.equal(decoded.token_type, "refresh");
  assert.ok(getTokenTtlSeconds(decoded) > 0);
});
