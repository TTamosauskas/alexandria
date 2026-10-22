import assert from "node:assert/strict";
import test from "node:test";
import { buildCopyrightNotice, isArchivePdf } from "../assets/js/copyright-report.js";
import { readFileSync } from "node:fs";
const pdf="https://archive.org/download/abc/a.pdf";
const data={
  title:"Livro do catálogo",pdfUrl:pdf,
  fullName:"Exemplo Pessoa",email:"rights@example.org",phone:"+55 11 99999-0000",
  address:"Rua Exemplo 123, Brasil", rightsOwner:"Editora Exemplo",
  copyrightedWork:"Obra protegida: Edição de 2022",explanation:"Cópia integral não autorizada da edição.",
  signature:"Exemplo Pessoa",role:"agent",goodFaith:true,penalty:true,
};

test("monta todos os elementos essenciais da notificação de copyright em inglês",()=>{
 const {subject,text}=buildCopyrightNotice(data);
 assert.match(subject,/Copyright infringement notice \(DMCA\)/);
 for(const expected of [
  "To: info@archive.org",pdf,"Livro do catálogo","Obra protegida",
  "Editora Exemplo","rights@example.org","Rua Exemplo","99999",
  "good-faith belief","penalty of perjury","/s/ Exemplo Pessoa",
  "duly authorized representative","Cópia integral não autorizada",
 ]) assert.ok(text.includes(expected),"Campo obrigatório não incluído: "+expected);
});
test("rejeita notificações com contatos incompletos, legitimidade inválida ou declaração ausente",()=>{
 for(const update of [
  {fullName:""},{email:"e-mail inválido"},{address:""},{rightsOwner:""},{signature:""},
  {goodFaith:false},{penalty:false},{role:"unknown"},
  {pdfUrl:"https://example.org/obra.pdf"},
 ]) assert.throws(()=>buildCopyrightNotice({...data,...update}));
});
test("aceita apenas downloads PDF do Archive.org",()=>{
 assert.ok(isArchivePdf(pdf));
 assert.ok(isArchivePdf("https://archive.org/download/collection/%20file.pdf"));
 for(const url of ["javascript:alert(1)","https://evil.archive.org/download/a.pdf",
 "https://archive.org/details/a","https://archive.org/download/a/zip.zip"])
 assert.equal(isArchivePdf(url),false);
});
test("layout inclui botão ocultável, segundo relatório e aviso de que não há envio automático",()=>{
 const app=readFileSync(new URL("../assets/js/app.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const css=readFileSync(new URL("../assets/css/main.css",import.meta.url),"utf8");
 assert.match(app,/report\.title = "denunciar uso indevido"/);
 assert.match(app,/report\.textContent = "📢"/);
 assert.match(app,/touchstart/);
 assert.match(css,/\.result:hover \.copyright-trigger/);
 assert.match(css,/\.result--report-visible \.copyright-trigger/);
 assert.match(html,/id="editor-reports-list"/);
 assert.match(html,/id="copyright-form"/);
 assert.match(html,/info@archive\.org/);
 assert.match(html,/não é automático/);
 assert.match(html,/id="copyright-sent"/);
});
