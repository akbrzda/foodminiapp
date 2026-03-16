import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createBotApiServer } from "../../src/server.js";

const createCommandBotStub = () => ({
  mode: "webhook",
  webhookSecret: "",
  processUpdate: async () => {},
});

test("smoke: /internal/telegram/notification валидирует payload", async () => {
  const app = createBotApiServer({ commandBot: createCommandBotStub() });
  const response = await request(app)
    .post("/internal/telegram/notification")
    .set("x-bot-service-token", "test-token")
    .send({ telegram_id: 0, message: "" });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("smoke: /internal/telegram/notification отправляет сообщение через telegram API helper", async () => {
  const calls = [];
  const telegramApi = {
    sendTextMessage: async (payload) => {
      calls.push(payload);
      return { message_id: 777 };
    },
    sendPhotoMessage: async () => ({ message_id: 1 }),
    sendVideoMessage: async () => ({ message_id: 1 }),
    answerCallbackQuery: async () => ({}),
  };

  const app = createBotApiServer({
    commandBot: createCommandBotStub(),
    telegramApi,
  });

  const response = await request(app)
    .post("/internal/telegram/notification")
    .set("x-bot-service-token", "test-token")
    .send({ telegram_id: 12345, message: "Привет" });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.message_id, 777);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chatId, 12345);
  assert.equal(calls[0].text, "Привет");
});
