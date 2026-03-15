import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createBotApiServer } from "../../src/server.js";

test("smoke: /health для bot API отвечает success", async () => {
  const commandBot = {
    mode: "webhook",
    webhookSecret: "",
    processUpdate: async () => {},
  };

  const app = createBotApiServer({ commandBot });
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.service, "foodminiapp-bot-service");
});
