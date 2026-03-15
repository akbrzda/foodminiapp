import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

test("smoke: health endpoint отвечает 200", async () => {
  const app = express();

  app.get("/health", (req, res) => {
    res.json({ success: true, service: "backend-test" });
  });

  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
});
