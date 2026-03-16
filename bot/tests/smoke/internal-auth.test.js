import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createBotApiServer } from "../../src/server.js";

test("smoke: internal endpoint требует x-bot-service-token", async () => {
  const commandBot = {
    mode: "webhook",
    webhookSecret: "",
    processUpdate: async () => {},
  };

  const app = createBotApiServer({ commandBot });
  const response = await request(app).post("/internal/telegram/notification").send({
    telegram_id: 123,
    message: "Тест",
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error, "Unauthorized");
});
