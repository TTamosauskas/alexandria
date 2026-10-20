import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [source, destination = "data/catalog"] = process.argv.slice(2);
if (!source) throw new Error("Uso: node scripts/split-catalog.mjs <catalog.json> [destino]");

const input = JSON.parse(await readFile(resolve(source), "utf8"));
const records = input
  .map(({ title, creator, categories, pdf_url }) => ({
    title: String(title || "Documento").trim(),
    creator: String(creator || "").trim(),
    categories: Array.isArray(categories) ? categories : [],
    pdf_url,
  }))
  .filter((item) => item.pdf_url)
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
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ version: 1, records: records.length, parts }, null, 2), "utf8");
