import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/css/main.css", import.meta.url), "utf8");

test("navegação mantém somente estante e recentes, e formulário segue disponível", () => {
  assert.doesNotMatch(html, /data-shelf-view="search"/);
  assert.match(html, /data-shelf-view="favorites"/);
  assert.match(html, /data-shelf-view="recent"/);
  assert.match(html, /id="search-form"/);
  assert.match(html, /type="submit">Pesquisar<\/button>/);
  assert.match(script, /form\.addEventListener\("submit"/);
});

test("marcador possui SVG, rótulo acessível e estado que não substitui o ícone", () => {
  assert.match(script, /document\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/);
  assert.match(script, /favorite\.append\(icon\)/);
  assert.match(script, /heading\.append\(favorite\)/);
  assert.match(script, /entry\.append\(heading\)/);
  assert.match(script, /setFavoriteAppearance\(favoriteButton, item, saved\)/);
  assert.match(script, /button\.setAttribute\("aria-pressed", String\(saved\)\)/);
  assert.doesNotMatch(script, /"♡ Guardar"|"♥ Salvo"/);
});

test("marcador fica à direita da primeira linha do título em desktop e mobile", () => {
  assert.match(css, /\.entry-heading \{[^}]*display:flex/);
  assert.match(css, /\.entry-heading \.title \{[^}]*flex:1 1 auto/);
  assert.match(css, /\.favorite-toggle \{[^}]*margin:-7px -5px 0 auto/);
  assert.match(css, /\.favorite-toggle\[aria-pressed="true"\] svg \{ fill:currentColor/);
  assert.match(css, /@media \(max-width:620px\)/);
});
