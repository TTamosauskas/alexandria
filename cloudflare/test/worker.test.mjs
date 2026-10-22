import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const origin = "https://ttamosauskas.github.io";
const bookId = "a".repeat(64);
const visitorId = "1fc8b5a7-b945-4ba0-9b7f-cb83daa21f73";

const calls = [];
const database = {
  prepare(sql) {
    return {
      all: async () => ({ results: [{ bookId, average: 4.5, count: 2 }] }),
      bind(...args) {
        return {
          sql,
          args,
          first: async () => ({ bookId, average: 4, count: 1 }),
        };
      },
    };
  },
  async batch(statements) {
    calls.push(statements);
    return statements.map(() => ({ success: true }));
  },
};

const env = { DB: database, ALLOWED_ORIGIN: origin, VOTER_HASH_SECRET: "test-hmac-secret" };

test("saúde informa API de voto direto", async () => {
  const result = await worker.fetch(new Request("https://worker.example/api/health"), env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, voting: "direct" });
});

test("GET retorna médias sem cache entre solicitações", async () => {
  const req = new Request("https://worker.example/api/ratings", { headers: { Origin: origin } });
  const response = await worker.fetch(req, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).ratings[0], { bookId, average: 4.5, count: 2 });
});

test("sem login e sem token Turnstile o voto é aceito", async () => {
  const req = new Request("https://worker.example/api/ratings", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, visitorId, score: 4 }),
  });
  const response = await worker.fetch(req, env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).rating, { bookId, average: 4, count: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.equal(calls[0][0].args[0], bookId);
  assert.notEqual(calls[0][0].args[1], visitorId, "identificador privado não pode ser salvo em texto puro");
  assert.equal(calls[0][0].args[1].length, 64);
  assert.equal(calls[0][0].args[2], 4);
});

test("votos inválidos não são gravados", async () => {
  const before = calls.length;
  const req = new Request("https://worker.example/api/ratings", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, visitorId, score: 6 }),
  });
  assert.equal((await worker.fetch(req, env)).status, 400);
  assert.equal(calls.length, before);
});

test("rejeita origem diferente ou inexistente em POST", async () => {
  for (const headers of [
    { Origin: "https://evil.example", "Content-Type": "application/json" },
    { "Content-Type": "application/json" },
  ]) {
    const req = new Request("https://worker.example/api/ratings", {
      method: "POST", headers, body: JSON.stringify({ bookId, visitorId, score: 1 }),
    });
    assert.equal((await worker.fetch(req, env)).status, 403);
  }
});
