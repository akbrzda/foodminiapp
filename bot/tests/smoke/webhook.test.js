import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createBotApiServer } from "../../src/server.js";

test("smoke: webhook отклоняет запрос с неверным secret", async () => {
  const commandBot = {
    mode: "webhook",
    webhookSecret: "secret-token",
    processUpdate: async () => {},
  };

  const app = createBotApiServer({ commandBot });
  const response = await request(app)
    .post("/webhook/telegram")
    .set("x-telegram-bot-api-secret-token", "wrong")
    .send({ update_id: 1, message: { text: "ping" } });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test("smoke: webhook принимает корректный secret и вызывает processUpdate", async () => {
  let receivedUpdateId = null;
  const commandBot = {
    mode: "webhook",
    webhookSecret: "secret-token",
    processUpdate: async (update) => {
      receivedUpdateId = update?.update_id || null;
    },
  };

  const app = createBotApiServer({ commandBot });
  const response = await request(app)
    .post("/webhook/telegram")
    .set("x-telegram-bot-api-secret-token", "secret-token")
    .send({ update_id: 42, message: { text: "/start" } });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(receivedUpdateId, 42);
});
