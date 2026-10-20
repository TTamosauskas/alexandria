const manifestUrl = new URL("../../data/catalog/manifest.json", import.meta.url);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar ${url}`);
  return response.json();
}

export async function loadCatalog(onProgress = () => {}) {
  const manifest = await fetchJson(manifestUrl);
  const parts = [];
  for (let index = 0; index < manifest.parts.length; index += 4) {
    const group = manifest.parts.slice(index, index + 4);
    const records = await Promise.all(group.map((part) => fetchJson(new URL(part, manifestUrl))));
    parts.push(...records.flat());
    onProgress(parts.length, manifest.records);
  }
  return parts;
}

export function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
