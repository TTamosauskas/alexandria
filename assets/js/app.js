import { loadCatalog, normalize } from "./catalog.js";

const pageSize = 24;
const form = document.querySelector("#search-form");
const field = document.querySelector("#search-input");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const sentinel = document.querySelector("#results-sentinel");
const radios = Array.from(document.querySelectorAll('input[name="idioma"]'));
const validLanguages = new Set(["pt", "en", "es", "all"]);

let matches = [];
let visible = 0;
let requestId = 0;
const indexPromises = new Map();

function languageFrom(value) {
  return validLanguages.has(value) ? value : "all";
}

function selectedLanguage() {
  return radios.find((radio) => radio.checked)?.value || "all";
}

function setSelectedLanguage(language) {
  const current = languageFrom(language);
  radios.forEach((radio) => { radio.checked = radio.value === current; });
}

function queryState() {
  const params = new URLSearchParams(location.search);
  return {
    query: params.get("q") || "",
    category: params.get("categoria") || "",
    language: languageFrom(params.get("idioma")),
    browse: params.has("q") || params.has("categoria"),
  };
}

function setUrl(query, category = "", language = "all") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("categoria", category);
  params.set("idioma", languageFrom(language));
  history.pushState({}, "", location.pathname + "?" + params.toString());
}

function cleanTitle(value) {
  let title = String(value || "Documento").trim().replace(/\.pdf$/i, "");
  const joinedTerms = title.match(/(?<!\s)[_-](?!\s)/g)?.length || 0;
  const filenameLike = /^\d{4,}(?:[._-]+|\s+)/.test(title) || joinedTerms >= 2;
  if (filenameLike) {
    title = title.replace(/^\d{4,}(?:[._-]+|\s+)/, "").replace(/[_-]+/g, " ");
  }
  return title.replace(/\s+/g, " ").trim() || "Documento";
}

function indexedCatalog(language) {
  if (!indexPromises.has(language)) {
    const request = loadCatalog(language).then((items) => items.map((item) => {
      const title = cleanTitle(item.title);
      return {
        ...item,
        title,
        search: normalize(title + " " + (item.creator || "")),
        categorySearch: normalize((item.categories || []).join(" ")),
      };
    })).catch((error) => {
      indexPromises.delete(language);
      throw error;
    });
    indexPromises.set(language, request);
  }
  return indexPromises.get(language);
}

function find(items, query, category) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const normalizedCategory = normalize(category);
  return items.filter((item) => {
    const matchesCategory = !normalizedCategory || item.categorySearch.includes(normalizedCategory);
    const haystack = item.search + " " + item.categorySearch;
    return matchesCategory && words.every((word) => haystack.includes(word));
  });
}

function archiveCover(identifier) {
  return "https://archive.org/services/img/" + encodeURIComponent(identifier);
}

function renderEntry(item) {
  const article = document.createElement("article");
  article.className = "result";

  const cover = document.createElement("img");
  cover.className = "cover";
  cover.alt = "Capa do documento";
  cover.width = 104;
  cover.height = 146;
  cover.loading = "lazy";
  cover.src = archiveCover(item.identifier);
  cover.addEventListener("error", () => {
    // Sem capa no Archive.org: não usamos miniaturas extraídas de PDFs.
    article.classList.add("result--no-cover");
    cover.remove();
  });

  const entry = document.createElement("div");
  entry.className = "entry";
  const title = document.createElement("a");
  title.className = "title";
  title.href = item.pdf_url;
  title.target = "_blank";
  title.rel = "noopener";
  title.textContent = item.title;
  entry.append(title);

  if (item.categories.length) {
    const tags = document.createElement("ul");
    tags.className = "tags";
    item.categories.forEach((category) => {
      const tag = document.createElement("li");
      const link = document.createElement("a");
      link.href = "?categoria=" + encodeURIComponent(category) + "&idioma=" + encodeURIComponent(selectedLanguage());
      link.dataset.category = category;
      link.textContent = category;
      tag.append(link);
      tags.append(tag);
    });
    entry.append(tags);
  }

  article.append(cover, entry);
  return article;
}

function appendNextPage() {
  if (visible >= matches.length) return;
  const fragment = document.createDocumentFragment();
  const end = Math.min(visible + pageSize, matches.length);
  for (let index = visible; index < end; index++) {
    fragment.append(renderEntry(matches[index]));
  }
  results.append(fragment);
  visible = end;
}

function showMatches(language) {
  results.replaceChildren();
  visible = 0;
  if (matches.length) {
    status.textContent = matches.length.toLocaleString("pt-BR") + " documentos";
    appendNextPage();
  } else if (language === "es") {
    status.textContent = "O catálogo em espanhol ainda não possui documentos.";
  } else {
    status.textContent = "Nenhum documento encontrado";
  }
}

async function search(query = field.value, category = "", language = selectedLanguage(), browse = true) {
  const currentRequest = ++requestId;
  const activeLanguage = languageFrom(language);
  field.value = query;
  setSelectedLanguage(activeLanguage);

  if (!browse && !query.trim() && !category) {
    matches = [];
    visible = 0;
    results.replaceChildren();
    status.textContent = "";
    return;
  }

  status.textContent = "Carregando catálogo…";
  try {
    const items = await indexedCatalog(activeLanguage);
    if (currentRequest !== requestId) return;
    matches = find(items, query, category);
    if (activeLanguage === "all") {
      matches.sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
    }
    showMatches(activeLanguage);
  } catch (error) {
    if (currentRequest !== requestId) return;
    matches = [];
    visible = 0;
    results.replaceChildren();
    status.textContent = "Não foi possível carregar o catálogo. Tente novamente.";
    console.error(error);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const language = selectedLanguage();
  setUrl(field.value, "", language);
  search(field.value, "", language);
});

radios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    // A seleção do idioma prepara a próxima busca, sem carregar ou exibir resultados.
    ++requestId; // Ignora qualquer busca anterior que ainda esteja em andamento.
    matches = [];
    visible = 0;
    results.replaceChildren();
    status.textContent = "";
    setUrl("", "", radio.value);
  });
});

results.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-category]");
  if (!link) return;
  event.preventDefault();
  const category = link.dataset.category;
  const language = selectedLanguage();
  setUrl("", category, language);
  search("", category, language);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const observer = new IntersectionObserver((entries) => {
  if (!entries.some((entry) => entry.isIntersecting) || visible >= matches.length) return;
  appendNextPage();
}, { rootMargin: "480px 0px" });
observer.observe(sentinel);

window.addEventListener("popstate", () => {
  const state = queryState();
  search(state.query, state.category, state.language, state.browse);
});

const initial = queryState();
search(initial.query, initial.category, initial.language, initial.browse);
