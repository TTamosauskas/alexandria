#!/usr/bin/env node
// Auditoria não destrutiva: nenhum registro do catálogo é removido automaticamente.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const online = args.includes("--check-links");
const root = path.resolve(args.find((x)=>x.startsWith("--root="))?.slice(7) || ".");
const output = path.resolve(args.find((x)=>x.startsWith("--output="))?.slice(9) || "reports/catalog-quality.json");
const sampleLimit = Math.max(0, Math.min(60, Number(args.find((x)=>x.startsWith("--sample="))?.slice(9) || 24)));
const sources = [
  ["pt", "data/catalog"],
  ["en", "data/catalog-en"],
  ["es", "data/catalog-es"],
];
const report = {
  auditedAt: new Date().toISOString(),
  expectedTotal: 0, actualTotal: 0,
  languages: {},
  duplicateCount: 0,
  duplicates: [],
  invalidUrls: [],
  missingTitles: [],
  metadataMissingCreator: 0,
  linkChecks: [],
  warnings: [],
  errors: [],
};
const seenUrls = new Map();
const linkCandidates = [];

function validUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "archive.org" &&
      url.pathname.startsWith("/download/") && /\.pdf$/i.test(decodeURIComponent(url.pathname));
  } catch { return false; }
}
function checkStructure(record, location, language) {
  if (!record || typeof record !== "object") {
    report.errors.push("Registro inválido: " + location);
    return;
  }
  const title = String(record.title || "").trim();
  const link = String(record.pdf_url || "").trim();
  if (!title) report.missingTitles.push(location);
  if (!record.creator) report.metadataMissingCreator++;
  if (!Array.isArray(record.categories)) report.warnings.push("Categorias inválidas: " + location);
  if (!validUrl(link)) report.invalidUrls.push({ location, url: link.slice(0, 260) });
  if (link) {
    const key = link.toLowerCase();
    if (seenUrls.has(key)) {
      report.duplicateCount++;
      if (report.duplicates.length < 200) {
        report.duplicates.push({ first: seenUrls.get(key), repeated: location, url: link });
      }
    } else {
      seenUrls.set(key, location);
      if (validUrl(link)) linkCandidates.push({ location, url: link, language });
    }
  }
}
async function checkLink(entry) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      let response = await fetch(entry.url, { method:"HEAD", redirect:"follow", signal:controller.signal });
      if (response.status === 405) {
        response = await fetch(entry.url, { method:"GET", headers: { Range: "bytes=0-0" },
          redirect:"follow", signal:controller.signal });
        await response.body?.cancel();
      }
      const status = response.status;
      return { ...entry, status, result: status === 404 || status === 410
        ? "possivelmente quebrado" : response.ok ? "acessível" : "inconclusivo" };
    } finally { clearTimeout(timer); }
  } catch (error) {
    return { ...entry, result:"inconclusivo", error:String(error).slice(0,180) };
  }
}

for (const [language, folder] of sources) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, folder, "manifest.json"), "utf8"));
  } catch (error) {
    report.errors.push(folder + ": não foi possível ler manifesto (" + error.message + ")");
    continue;
  }
  const expected = Number(manifest.records);
  report.expectedTotal += expected;
  let actual = 0;
  for (const part of manifest.parts || []) {
    if (!/^part-\d+\.json$/.test(part)) {
      report.errors.push(folder + ": nome inválido " + String(part));
      continue;
    }
    try {
      const records = JSON.parse(await readFile(path.join(root, folder, part), "utf8"));
      if (!Array.isArray(records)) throw new Error("esperado vetor JSON");
      records.forEach((record, index) => checkStructure(record, language + "/" + part + ":" + (index+1), language));
      actual += records.length;
    } catch (error) {
      report.errors.push(folder + "/" + part + ": " + error.message);
    }
  }
  report.actualTotal += actual;
  report.languages[language] = { expected, actual, parts:(manifest.parts || []).length };
  if (expected !== actual) report.errors.push(language + ": manifesto indica " + expected + ", mas existem " + actual + " registros");
}
if (online && sampleLimit) {
  // Amostragem espaçada: evite atingir dezenas de milhares de links no Archive.org.
  const sample = Array.from({ length: Math.min(sampleLimit, linkCandidates.length) }, (_, i) =>
    linkCandidates[Math.floor(i * linkCandidates.length / Math.min(sampleLimit, linkCandidates.length))]);
  let cursor = 0;
  async function worker() {
    while (cursor < sample.length) {
      const entry = sample[cursor++];
      report.linkChecks.push(await checkLink(entry));
    }
  }
  await Promise.all(Array.from({length:2}, worker));
}
const summary = {
  total: report.actualTotal,
  expected: report.expectedTotal,
  duplicateUrls: report.duplicateCount,
  duplicateUrlsSample: report.duplicates.length,
  invalidUrls: report.invalidUrls.length,
  missingTitles: report.missingTitles.length,
  creatorMissing: report.metadataMissingCreator,
  checkedLinks: report.linkChecks.length,
  possiblyBroken: report.linkChecks.filter((x) => x.result === "possivelmente quebrado").length,
  errors: report.errors.length,
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ summary, ...report }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
console.log("Relatório salvo em", output);
if (report.errors.length) {
  console.error(report.errors.slice(0, 15).join("\n"));
  process.exitCode = 1;
}
