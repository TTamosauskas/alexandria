import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const origin = "https://ttamosauskas.github.io";
const recorded = [];
const env = {
  DB: {
    prepare(sql) {
      return {
        all: async () => ({ results: [
          { id: 5, query: "alquimia", category: "", language: "pt", createdAt: 1700000000 },
          { id: 4, query: "", category: "Hermetismo", language: "all", createdAt: 1699999999 },
        ] }),
        bind(...values) {
          return { run: async () => { recorded.push({ sql, values }); return { success: true }; } };
        },
      };
    },
  },
  ALLOWED_ORIGIN: origin,
  VOTER_HASH_SECRET: "local-secret",
};
const url = "https://worker.example/api/search-history";
function post(payload, headers = { Origin: origin, "Content-Type": "application/json" }) {
  return worker.fetch(new Request(url, { method: "POST", headers, body: JSON.stringify(payload) }), env);
}

test("buscas globais aparecem em ordem de gravação e sem cache", async () => {
  const res = await worker.fetch(new Request(url, { headers: { Origin: origin } }), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("access-control-allow-origin"), origin);
  const data = await res.json();
  assert.equal(data.searches.length, 2);
  assert.equal(data.searches[0].query, "alquimia");
  assert.ok(data.searches.every((entry) => !Object.hasOwn(entry, "visitorId")));
});

test("grava pesquisa normalizada e não captura identidade pessoal", async () => {
  const response = await post({ query: "  tarot  ", category: "", language: "pt" });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { recorded: true });
  assert.match(recorded.at(-1).sql, /INSERT INTO search_history/);
  assert.deepEqual(recorded.at(-1).values, ["tarot", "", "pt"]);
});

test("categoria isolada também representa pesquisa", async () => {
  assert.equal((await post({ query: "", category: "Grimórios", language: "all" })).status, 201);
  assert.deepEqual(recorded.at(-1).values, ["", "Grimórios", "all"]);
});

test("limites de tamanho, campos e valores são validados", async () => {
  const before = recorded.length;
  for (const payload of [
    { query: "", category: "", language: "pt" },
    { query: "a".repeat(161), category: "", language: "pt" },
    { query: "magia", category: "", language: "invalid" },
    { query: ["tarot"], category: "", language: "all" },
    { query: "x\u0000y", category: "", language: "pt" },
  ]) assert.equal((await post(payload)).status, 400);
  assert.equal(recorded.length, before);
});

test("origens externas não conseguem consultar nem criar histórico pelo navegador", async () => {
  assert.equal((await worker.fetch(new Request(url, { headers: { Origin: "https://evil.example" } }), env)).status, 403);
  assert.equal((await post({ query: "tarot", category: "", language: "pt" }, {
    Origin: "https://evil.example", "Content-Type": "application/json",
  })).status, 403);
  const preflight = await worker.fetch(new Request(url, {
    method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type",
    },
  }), env);
  assert.equal(preflight.status, 204);
});
