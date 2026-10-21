import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const origin = "https://ttamosauskas.github.io";
const env = {
  DB: {
    prepare(sql) {
      return {
        all: async () => ({ results: [{ bookId: "a".repeat(64), average: 4.5, count: 2 }] }),
        bind: () => ({ first: async () => ({ bookId: "a".repeat(64), average: 4, count: 1 }) }),
      };
    },
  },
  ALLOWED_ORIGIN: origin,
  TURNSTILE_HOSTNAME: "ttamosauskas.github.io",
  TURNSTILE_SECRET: "test-secret",
  VOTER_HASH_SECRET: "test-hmac-secret",
};

test("GET devolve médias para o site autorizado", async () => {
  const request = new Request("https://worker.example/api/ratings", { headers: { Origin: origin } });
  const result = await worker.fetch(request, env);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("access-control-allow-origin"), origin);
  assert.deepEqual((await result.json()).ratings[0], { bookId: "a".repeat(64), average: 4.5, count: 2 });
});

test("não permite origem externa", async () => {
  const request = new Request("https://worker.example/api/ratings", { headers: { Origin: "https://evil.example" } });
  assert.equal((await worker.fetch(request, env)).status, 403);
});

test("rejeita votos inválidos antes de qualquer validação Turnstile", async () => {
  const request = new Request("https://worker.example/api/ratings", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ bookId: "bad", score: 7, visitorId: "no", token: "fake" }),
  });
  assert.equal((await worker.fetch(request, env)).status, 400);
});

test("POST sem Origin é rejeitado", async () => {
  const request = new Request("https://worker.example/api/ratings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal((await worker.fetch(request, env)).status, 403);
});
