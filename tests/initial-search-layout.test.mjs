import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");

test("português é o filtro inicial, mantendo as demais opções", () => {
  assert.match(html, /name="idioma" value="pt" checked \/> português/);
  assert.match(html, /name="idioma" value="all" \/> todas/);
  assert.doesNotMatch(html, /name="idioma" value="all" checked/);
  assert.match(app, /language: languageFrom\(params\.get\("idioma"\) \|\| "pt"\)/);
  assert.match(app, /radios\.find\(\(radio\) => radio\.checked\)\?\.value \|\| "pt"/);
});

test("contador deixa o cabeçalho e aparece no campo de busca", () => {
  assert.doesNotMatch(html, /id="catalog-total"/);
  assert.match(html, /placeholder="37\.894 documentos no acervo"/);
  assert.doesNotMatch(html, /Título, autor ou assunto/);
  assert.match(app, /field\.placeholder = total\.toLocaleString\("pt-BR"\) \+ " documentos no acervo"/);
  assert.match(html, /type="submit">Pesquisar<\/button>/);
});
