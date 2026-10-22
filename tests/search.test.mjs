import assert from "node:assert/strict";
import test from "node:test";
import { createIndex, prepareItem, searchIndex, suggestions, highlightParts, oneEditAway } from "../assets/js/search.js";

const items = [
  { title:"Cabala e a Tradição", creator:"Luiz", categories:["Estudos esotéricos"], pdf_url:"https://archive.org/download/a/a.pdf" },
  { title:"Kabbalah prática", creator:"Ana", categories:["Tradição"], pdf_url:"https://archive.org/download/b/b.pdf" },
  { title:"Tratado de Alquimia", creator:"João", categories:["Hermetismo"], pdf_url:"https://archive.org/download/c/c.pdf" },
  { title:"Guia de Tarot", creator:"Maria", categories:["Divinação"], pdf_url:"https://archive.org/download/d/d.pdf" },
];
const index=createIndex(items.map(prepareItem));

test("busca ignora acentos, pesquisa autores e categorias",()=>{
  assert.equal(searchIndex(index,"tradiçao").items.length,2);
  assert.equal(searchIndex(index,"joao").items[0].title,"Tratado de Alquimia");
  assert.equal(searchIndex(index,"","Divinação").items[0].title,"Guia de Tarot");
});
test("sinônimos de nomes próximos entram quando não existe correspondência literal",()=>{
  assert.equal(searchIndex(index,"qabalah").items.length,2);
  assert.match(searchIndex(index,"qabalah").interpretation,/relacionados/);
});
test("erro de um caractere e transposição geram resultados corrigidos",()=>{
  assert.equal(oneEditAway("tarot","taro"),true);
  assert.equal(oneEditAway("tarto","tarot"),true);
  assert.equal(oneEditAway("tar","alguma"),false);
  const found=searchIndex(index,"alquimiaa");
  assert.equal(found.items[0].title,"Tratado de Alquimia");
  assert.match(found.interpretation,/Resultados para/);
});
test("sugestões de título, com máximo definido e sem duplicações",()=>{
  assert.deepEqual(suggestions(index,"tra",4),["Tratado de Alquimia","Cabala e a Tradição"]);
  assert.deepEqual(suggestions(index,"CAB",3),["Cabala e a Tradição"]);
  assert.deepEqual(suggestions(index,"z",3),[]);
});
test("destaque preserva acentos e evita HTML",()=>{
  const parts=highlightParts("Tradição de Alquimia","tradicao");
  assert.deepEqual(parts[0],{text:"Tradição",marked:true});
  assert.equal(parts.map(x=>x.text).join(""),"Tradição de Alquimia");
  assert.deepEqual(highlightParts("<script>","scrip"),[{text:"<",marked:false},{text:"scrip",marked:true},{text:"t>",marked:false}]);
});
