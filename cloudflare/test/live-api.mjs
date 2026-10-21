import assert from "node:assert/strict";

const api = "https://alexandria-ratings.thiago-gt.workers.dev";
const origin = "https://ttamosauskas.github.io";

async function request(path, options = {}, retries = 3) {
  let last;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(api + path, {
        ...options,
        signal: AbortSignal.timeout(12000),
      });
      return response;
    } catch (error) {
      last = error;
      if (attempt + 1 < retries) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Worker inacessível: " + String(last));
}

const health = await request("/api/health");
assert.equal(health.status, 200, "/api/health precisa retornar 200");
assert.deepEqual(await health.json(), { ok: true }, "D1 precisa estar vinculado");
console.log("OK /api/health — D1 vinculado");

const ratings = await request("/api/ratings", { headers: { Origin: origin } });
assert.equal(ratings.status, 200, "/api/ratings precisa retornar 200");
assert.equal(ratings.headers.get("access-control-allow-origin"), origin);
const data = await ratings.json();
assert.ok(Array.isArray(data.ratings), "A resposta deve conter lista ratings");
console.log("OK /api/ratings —", data.ratings.length, "livros avaliados");

const preflight = await request("/api/ratings", {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  },
});
assert.equal(preflight.status, 204, "CORS preflight precisa funcionar");
assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
console.log("OK CORS — origem Biblioteca Oculta");

const otherOrigin = await request("/api/ratings", {
  headers: { Origin: "https://example.org" },
});
assert.equal(otherOrigin.status, 403, "Origem externa precisa ser bloqueada");
console.log("OK CORS — origem externa rejeitada");

const invalidRating = await request("/api/ratings", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    bookId: "not-valid",
    visitorId: crypto.randomUUID(),
    score: 9,
    token: "invalid",
  }),
});
assert.equal(invalidRating.status, 400, "Dados inválidos não podem ser aceitos");
console.log("OK POST — dados inválidos rejeitados");

const invalidChallenge = await request("/api/ratings", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    bookId: "a".repeat(64),
    visitorId: crypto.randomUUID(),
    score: 5,
    token: "invalid",
  }),
});
assert.equal(invalidChallenge.status, 403, "Turnstile precisa rejeitar token falso");
console.log("OK POST — Turnstile rejeitou token falso");
console.log("API pública aprovada nos testes automáticos. O voto real ainda exige o navegador.");
