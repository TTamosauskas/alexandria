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
assert.deepEqual(await health.json(), { ok: true, voting: "direct" }, "Worker direto e D1 precisam estar ativos");
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

// Sem gravar votos de teste em livros fictícios: um voto válido é testado no módulo local.
console.log("API direta publicada; POST válido coberto nos testes unitários.");


const searches = await request("/api/search-history", { headers: { Origin: origin } });
assert.equal(searches.status, 200, "GET /api/search-history deve responder 200");
assert.equal(searches.headers.get("cache-control"), "no-store");
assert.equal(searches.headers.get("access-control-allow-origin"), origin);
const searchData = await searches.json();
assert.ok(Array.isArray(searchData.searches), "Resposta deve incluir searches");
assert.ok(searchData.searches.length <= 500, "Histórico nunca pode superar 500");
assert.ok(searchData.searches.every((item) => typeof item.query === "string"
  && typeof item.category === "string" && ["pt", "en", "es", "all"].includes(item.language)));
console.log("OK /api/search-history —", searchData.searches.length, "pesquisas guardadas");

// Não registra dados falsos no banco de produção.
const emptySearch = await request("/api/search-history", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "", category: "", language: "pt" }),
});
assert.equal(emptySearch.status, 400, "Consulta vazia deve ser recusada");
console.log("OK POST /api/search-history — entrada vazia rejeitada");


const reported = await request("/api/reported-links", { headers: { Origin: origin } });
assert.equal(reported.status, 200, "GET reported links deve responder 200");
const reportsBody = await reported.json();
assert.ok(Array.isArray(reportsBody.reports), "Lista de sinalizações inválida");
assert.ok(reportsBody.reports.every((entry) => typeof entry.pdfUrl === "string"
  && typeof entry.title === "string" && !Object.hasOwn(entry, "complainantEmail")));
console.log("OK /api/reported-links —", reportsBody.reports.length, "links sinalizados");

const invalidReport = await request("/api/reported-links", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ pdfUrl: "https://example.org/fake.pdf", title: "Teste" }),
});
assert.equal(invalidReport.status, 400, "Não registrar links inválidos");
