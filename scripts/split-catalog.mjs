import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [source, destination = "data/catalog"] = process.argv.slice(2);
if (!source) throw new Error("Uso: node scripts/split-catalog.mjs <catalog.json> [destino]");

const input = JSON.parse(await readFile(resolve(source), "utf8"));
function cleanTitle(value) {
  let title = String(value || "Documento").trim().replace(/\.pdf$/i, "");
  const joinedTerms = title.match(/(?<!\s)[_-](?!\s)/g)?.length || 0;
  const filenameLike = /^\d{4,}(?:[._-]+|\s+)/.test(title) || joinedTerms >= 2;
  if (filenameLike) {
    title = title.replace(/^\d{4,}(?:[._-]+|\s+)/, "").replace(/[_-]+/g, " ");
  }
  return title.replace(/\s+/g, " ").trim() || "Documento";
}
// Elimina apenas os registros que pertenciam exclusivamente à categoria removida.
// Os demais livros conservam todas as outras categorias.
const removedCategory = "outros estudos e documentos esotericos";
const normalizeCategory = (value) => String(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const isRemovedCategory = (value) => normalizeCategory(value) === removedCategory;

const records = input
  .map(({ identifier, title, creator, categories, pdf_url }) => ({
    identifier,
    title: cleanTitle(title),
    creator: String(creator || "").trim(),
    categories: Array.isArray(categories) ? categories : [],
    pdf_url,
  }))
  .filter((item) => item.pdf_url && !(
    item.categories.length > 0 && item.categories.every(isRemovedCategory)
  ))
  .map((item) => ({ ...item, categories: item.categories.filter((category) => !isRemovedCategory(category)) }))
  .sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));

const chunkSize = 500;
const output = resolve(destination);
await mkdir(output, { recursive: true });
const parts = [];
for (let start = 0; start < records.length; start += chunkSize) {
  const name = `part-${String(parts.length + 1).padStart(2, "0")}.json`;
  await writeFile(resolve(output, name), JSON.stringify(records.slice(start, start + chunkSize)), "utf8");
  parts.push(name);
}
// Limpa partes de versões antigas que não são mais referenciadas pelo manifesto.
for (const filename of await readdir(output)) {
  if (/^part-\d+\.json$/.test(filename) && !parts.includes(filename)) {
    await unlink(resolve(output, filename));
  }
}

const manifestPath = resolve(output, "manifest.json");
let version = 1;
try {
  const previous = JSON.parse(await readFile(manifestPath, "utf8"));
  version = Number(previous.version || 0) + 1;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await writeFile(manifestPath, JSON.stringify({ version, records: records.length, parts }, null, 2), "utf8");
