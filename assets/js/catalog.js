const manifestUrls = {
  pt: new URL("../../data/catalog/manifest.json?v=8", import.meta.url),
  en: new URL("../../data/catalog-en/manifest.json?v=4", import.meta.url),
  es: new URL("../../data/catalog-es/manifest.json?v=2", import.meta.url),
};

const pendingCatalogs = new Map();

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar " + url);
  return response.json();
}

function loadLanguage(language, onProgress) {
  if (!pendingCatalogs.has(language)) {
    const request = (async () => {
      const manifestUrl = manifestUrls[language];
      const manifest = await fetchJson(manifestUrl);
      const records = [];
      for (let index = 0; index < manifest.parts.length; index += 4) {
        const group = manifest.parts.slice(index, index + 4);
        const chunks = await Promise.all(group.map((part) =>
          fetchJson(new URL(part + "?v=" + manifest.version, manifestUrl))
        ));
        records.push(...chunks.flat());
        onProgress(records.length, manifest.records, language);
      }
      return records.map((item) => ({ ...item, language }));
    })().catch((error) => {
      pendingCatalogs.delete(language);
      throw error;
    });
    pendingCatalogs.set(language, request);
  }
  return pendingCatalogs.get(language);
}

export async function loadCatalog(language = "all", onProgress = () => {}) {
  const languages = language === "all" ? ["pt", "en", "es"] : [language];
  if (languages.some((code) => !Object.hasOwn(manifestUrls, code))) {
    throw new Error("Idioma inválido");
  }
  const catalogs = await Promise.all(languages.map((code) => loadLanguage(code, onProgress)));
  return catalogs.flat();
}

export function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
