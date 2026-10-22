import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Executa o modulo real de frontend com apenas o import de configuracao substituido.
const source = readFileSync(new URL("../../assets/js/ratings.js", import.meta.url), "utf8");
const isolated = source.replace(
  /^import \{ RATINGS_CONFIG \} from "\.\/ratings-config\.js";/m,
  'const RATINGS_CONFIG = { enabled: true, apiBaseUrl: "https://ratings.example.test" };'
);
assert.notEqual(source, isolated, "o modulo de avaliacoes deve ter sido carregado");

test("uma nova busca consulta medias atuais e ignora cache HTTP", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      requests++;
      assert.equal(options.cache, "no-store");
      assert.equal(options.mode, "cors");
      return {
        ok: true,
        json: async () => ({
          ratings: [
            { bookId: "a", average: requests === 1 ? 2 : 5, count: requests },
            { bookId: "b", average: 4, count: 10 },
          ],
        }),
      };
    };

    const module = await import("data:text/javascript," + encodeURIComponent(isolated));
    const bookA = { ratingId: "a", title: "Livro A" };
    const bookB = { ratingId: "b", title: "Livro B" };

    await module.loadRatings();
    assert.ok(module.compareByRating(bookA, bookB) > 0, "antes da atualizacao A tem nota menor");

    await module.loadRatings();
    assert.equal(requests, 2, "cada pesquisa apos uma resposta concluida precisa consultar a API");
    assert.ok(module.compareByRating(bookA, bookB) < 0, "apos novo voto A sobe no ranking");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buscas simultaneas compartilham apenas uma requisicao em andamento", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let resolveFetch;
  try {
    globalThis.fetch = () => {
      requests++;
      return new Promise((resolve) => { resolveFetch = resolve; });
    };
    const module = await import("data:text/javascript," + encodeURIComponent(isolated) + "#concurrent");
    const first = module.loadRatings();
    const second = module.loadRatings();
    assert.equal(requests, 1);
    resolveFetch({ ok: true, json: async () => ({ ratings: [] }) });
    await Promise.all([first, second]);
    const third = module.loadRatings();
    assert.equal(requests, 2, "depois que a primeira consulta acaba outra e iniciada");
    resolveFetch({ ok: true, json: async () => ({ ratings: [] }) });
    await third;
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("clique direto envia voto sem token e atualiza a média", async () => {
  const originalFetch = globalThis.fetch;
  const fakeBook = { ratingId: "a".repeat(64), title: "Livro de teste" };
  let posted;
  let count = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      count++;
      posted = JSON.parse(options.body);
      assert.equal(options.method, "POST");
      assert.deepEqual(Object.keys(posted).sort(), ["bookId", "score", "visitorId"]);
      assert.equal(options.cache, "no-store");
      return {
        ok: true,
        json: async () => ({ rating: { bookId: fakeBook.ratingId, average: 5, count: 1 } }),
      };
    };
    const module = await import("data:text/javascript," + encodeURIComponent(isolated) + "#direct-vote");
    const result = await module.voteRating(fakeBook, 5);
    assert.deepEqual(result, { average: 5, count: 1 });
    assert.equal(count, 1);
    assert.equal(posted.score, 5);
    assert.ok(/^[0-9a-f-]{36}$/.test(posted.visitorId));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
