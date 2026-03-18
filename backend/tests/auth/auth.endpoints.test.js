import test, { after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { authController } from "../../src/modules/auth/auth.controller.js";
import { authService } from "../../src/modules/auth/auth.service.js";
import { authError } from "../../src/shared/errors/auth-errors.js";
import db from "../../src/config/database.js";
import redis from "../../src/config/redis.js";

const createApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  return app;
};

after(async () => {
  await Promise.allSettled([db.end(), redis.quit()]);
});

test("auth endpoint: POST /auth/refresh возвращает csrf и выставляет cookies", async () => {
  const app = createApp();

  const originalRefreshSession = authService.refreshSession;
  authService.refreshSession = async () => ({
    csrfToken: "csrf-test-token",
    sessionType: "client",
    tokens: {
      accessToken: "access-test-token",
      refreshToken: "refresh-test-token",
      accessMaxAge: 15 * 60 * 1000,
      refreshMaxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });

  app.post("/auth/refresh", authController.refresh);

  const response = await request(app)
    .post("/auth/refresh")
    .set("Cookie", ["refresh_token_client=old-refresh-token"]);

  authService.refreshSession = originalRefreshSession;

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.csrfToken, "csrf-test-token");
  assert.ok(Array.isArray(response.headers["set-cookie"]));
  assert.ok(response.headers["set-cookie"].some((cookie) => cookie.startsWith("access_token_client=")));
  assert.ok(
    response.headers["set-cookie"].some((cookie) => cookie.startsWith("refresh_token_client="))
  );
  assert.ok(response.headers["set-cookie"].some((cookie) => cookie.startsWith("csrf_token=")));
});

test("auth endpoint: GET /auth/session возвращает admin session payload", async () => {
  const app = createApp();

  const originalGetAdminSession = authService.getAdminSession;
  authService.getAdminSession = async () => ({
    user: {
      id: 1,
      email: "admin@example.com",
      role: "admin",
      permissions: ["orders.view"],
    },
  });

  app.get(
    "/auth/session",
    (req, _res, next) => {
      req.user = { id: 1, type: "admin" };
      next();
    },
    authController.session
  );

  const response = await request(app).get("/auth/session");

  authService.getAdminSession = originalGetAdminSession;

  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, 1);
  assert.equal(response.body.user.role, "admin");
});

test("auth endpoint: POST /auth/logout очищает cookies и возвращает success", async () => {
  const app = createApp();

  const originalLogout = authService.logout;
  authService.logout = async () => ({ message: "Logout successful" });

  app.post("/auth/logout", authController.logout);

  const response = await request(app)
    .post("/auth/logout")
    .set("Cookie", [
      "access_token_client=old-access-token",
      "refresh_token_client=old-refresh-token",
      "csrf_token=old-csrf-token",
    ]);

  authService.logout = originalLogout;

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Logout successful");
  assert.ok(Array.isArray(response.headers["set-cookie"]));
  assert.ok(
    response.headers["set-cookie"].some((cookie) => cookie.startsWith("access_token_client=;"))
  );
  assert.ok(
    response.headers["set-cookie"].some((cookie) => cookie.startsWith("refresh_token_client=;"))
  );
  assert.ok(response.headers["set-cookie"].some((cookie) => cookie.startsWith("csrf_token=;")));
});

test("auth endpoint: POST /auth/logout возвращает 401 без токенов", async () => {
  const app = createApp();

  const originalLogout = authService.logout;
  authService.logout = async () => {
    throw authError.authRequired();
  };

  app.post("/auth/logout", authController.logout);

  const response = await request(app).post("/auth/logout");

  authService.logout = originalLogout;

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Authentication required");
});
