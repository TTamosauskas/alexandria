import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("avaliacoes desativadas nao exibem estrelas, nao criam dialogo e nao consultam API", async () => {
  const config = readFileSync(new URL("../../assets/js/ratings-config.js", import.meta.url), "utf8");
  assert.match(config, /enabled:\s*false/, "sistema deve permanecer desligado ate novo pedido");

  const source = readFileSync(new URL("../../assets/js/ratings.js", import.meta.url), "utf8");
  const isolated = source.replace(
    /^import \{ RATINGS_CONFIG \} from "\.\/ratings-config\.js";/m,
    'const RATINGS_CONFIG = { enabled: false, apiBaseUrl: "https://ratings.example.test", turnstileSiteKey: "test-public-key" };'
  );
  assert.notEqual(source, isolated);
  const module = await import("data:text/javascript," + encodeURIComponent(isolated));
  assert.equal(module.ratingsEnabled, false);
  assert.equal(module.ratingElement({ ratingId: "id", title: "Livro" }), null);
  assert.equal(await module.loadRatings(), undefined);
  module.initializeRatings({
    addEventListener() { throw new Error("Nenhuma interface deve ser instalada"); },
  }, () => { throw new Error("Interface desativada"); });
});
