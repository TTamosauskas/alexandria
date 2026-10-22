import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const url = "https://worker.test/api/reported-links";
const origin = "https://ttamosauskas.github.io";
const captured = [];
const env = {
  ALLOWED_ORIGIN: origin, VOTER_HASH_SECRET: "secret",
  DB: {
    prepare(sql) {
      return {
        all: async () => ({ results: [
          { pdfUrl:"https://archive.org/download/abc/a.pdf",title:"Exemplo",reportedAt:1740000000 },
        ] }),
        bind(...args) { return { run: async () => { captured.push({sql,args}); return {}; } }; },
      };
    },
  },
};
function post(payload, originHeader=origin) {
  return worker.fetch(new Request(url,{method:"POST",
    headers:{Origin:originHeader,"Content-Type":"application/json"},
    body:JSON.stringify(payload)}),env);
}
test("GET mostra links sinalizados, sem dados pessoais",async()=>{
  const res=await worker.fetch(new Request(url,{headers:{Origin:origin}}),env);
  assert.equal(res.status,200);
  assert.equal(res.headers.get("cache-control"),"no-store");
  const entries=(await res.json()).reports;
  assert.equal(entries.length,1);
  assert.equal(entries[0].title,"Exemplo");
  assert.deepEqual(Object.keys(entries[0]).sort(),["pdfUrl","reportedAt","title"]);
});
test("POST aceita apenas URL PDF do archive e grava título e URL",async()=>{
  const res=await post({pdfUrl:"https://archive.org/download/abc/a.pdf",title:"Livro",name:"NUNCA SALVAR",email:"never@example.com"});
  assert.equal(res.status,201);
  assert.deepEqual((await res.json()),{recorded:true});
  assert.deepEqual(captured.at(-1).args,["https://archive.org/download/abc/a.pdf","Livro"]);
  assert.match(captured.at(-1).sql,/ON CONFLICT\(pdf_url\) DO NOTHING/);
});
test("POST recusa URLs externas e títulos inválidos",async()=>{
  const before=captured.length;
  for (const entry of [
    {pdfUrl:"https://evil.example/download/a.pdf",title:"Livro"},
    {pdfUrl:"javascript:alert(1)",title:"Livro"},
    {pdfUrl:"https://archive.org/details/a",title:"Livro"},
    {pdfUrl:"https://archive.org/download/abc/a.pdf",title:""},
  ]) assert.equal((await post(entry)).status,400);
  assert.equal(captured.length,before);
});
test("CORS e requisições sem Origin rejeitam marcações",async()=>{
  assert.equal((await post({pdfUrl:"https://archive.org/download/abc/a.pdf",title:"Livro"},"https://evil.example")).status,403);
  const req=new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({pdfUrl:"https://archive.org/download/abc/a.pdf",title:"Livro"})});
  assert.equal((await worker.fetch(req,env)).status,403);
});
