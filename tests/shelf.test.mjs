import assert from "node:assert/strict";
import test from "node:test";
import { getShelf, isFavorite, toggleFavorite, rememberOpened, itemKey, SHELF_KEY } from "../assets/js/shelf.js";

function withStorage(callback) {
  const original=globalThis.localStorage;
  const map=new Map();
  globalThis.localStorage={
    getItem:(key)=>map.get(key)??null,
    setItem:(key,value)=>map.set(key,value),
    removeItem:(key)=>map.delete(key),
  };
  try { callback(map); } finally { globalThis.localStorage=original; }
}
const book=(name,language="pt")=>({
  title:name,language,identifier:"abc",creator:"Autor",categories:["Alquimia"],
  pdf_url:"https://archive.org/download/abc/"+encodeURIComponent(name)+".pdf",
});
test("favoritos persistem, não duplicam e podem ser removidos",()=>withStorage((map)=>{
  const a=book("Livro A");
  assert.equal(toggleFavorite(a),true);
  assert.equal(isFavorite(a),true);
  assert.equal(toggleFavorite(a),false);
  assert.equal(isFavorite(a),false);
  assert.ok(map.has(SHELF_KEY));
}));
test("histórico mantém ordem recente sem entradas duplicadas",()=>withStorage(()=>{
  const a=book("A"),b=book("B");
  rememberOpened(a); rememberOpened(b); rememberOpened(a);
  assert.deepEqual(getShelf("recent").map(x=>x.title),["A","B"]);
  assert.notEqual(itemKey(a),itemKey(book("A","en")));
}));
test("recusa links inseguros e tolera armazenamento inválido",()=>withStorage((map)=>{
  assert.equal(toggleFavorite({...book("A"),pdf_url:"javascript:alert(1)"}),false);
  assert.equal(getShelf("favorites").length,0);
  map.set(SHELF_KEY,"{not valid");
  assert.deepEqual(getShelf("favorites"),[]);
}));
test("limite do histórico: 40 títulos",()=>withStorage(()=>{
  for(let i=0;i<45;i++)rememberOpened(book("Livro "+i));
  assert.equal(getShelf("recent").length,40);
  assert.equal(getShelf("recent")[0].title,"Livro 44");
}));
