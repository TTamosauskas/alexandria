import assert from "node:assert/strict";
import test from "node:test";
import { historySearchHref, recordSearch } from "../assets/js/editor.js";

test("cada linha gera link reproduzindo busca e idioma, sem hash", () => {
  assert.equal(historySearchHref({ query:"tarot antigo", category:"", language:"pt" }, "/alexandria/"),
    "/alexandria/?q=tarot+antigo&idioma=pt");
  assert.equal(historySearchHref({ query:"", category:"Grimórios & Magia", language:"all" }, "/alexandria/"),
    "/alexandria/?categoria=Grim%C3%B3rios+%26+Magia&idioma=all");
  const safe = historySearchHref({ query:"<script>alert(1)</script>", category:"", language:"invalid" }, "/alexandria/");
  assert.ok(safe.startsWith("/alexandria/?q=") && safe.endsWith("idioma=all"));
});

test("consulta explícita envia somente os três campos, sem identificador", async () => {
  const prev=globalThis.fetch;
  let calls=0,payload;
  try {
    globalThis.fetch = async (_, options) => {
      calls++;payload=JSON.parse(options.body);
      assert.equal(options.keepalive,true);
      return {status:201};
    };
    assert.equal(await recordSearch("  alquimia  ","","pt"),true);
    assert.deepEqual(payload,{query:"alquimia",category:"",language:"pt"});
    assert.equal(await recordSearch("","","pt"),false);
    assert.equal(calls,1);
  } finally {globalThis.fetch=prev;}
});


