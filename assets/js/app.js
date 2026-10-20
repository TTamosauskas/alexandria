import { loadCatalog, normalize } from "./catalog.js";

const pageSize = 24;
const form = document.querySelector("#search-form");
const field = document.querySelector("#search-input");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const sentinel = document.querySelector("#results-sentinel");

let catalog = [];
let matches = [];
let visible = 0;
let catalogPromise;

function queryState() {
  const params = new URLSearchParams(location.search);
  return { query: params.get("q") || "", category: params.get("categoria") || "" };
}

function setUrl(query, category = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("categoria", category);
  history.pushState({}, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function find(query, category) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const normalizedCategory = normalize(category);
  return catalog.filter((item) => {
    const matchesCategory = !normalizedCategory || item.categorySearch.includes(normalizedCategory);
    const haystack = `${item.search} ${item.categorySearch}`;
    return matchesCategory && words.every((word) => haystack.includes(word));
  });
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

function render() {
  const entries = matches.slice(0, visible);
  results.replaceChildren(...entries.map(renderEntry));
  if (matches.length) status.textContent = `${matches.length.toLocaleString("pt-BR")} documentos`;
  else status.textContent = field.value || queryState().category ? "Nenhum documento encontrado" : "";
}

function renderEntry(item) {
  const article = document.createElement("article");
  article.className = "result";

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
      link.href = `?categoria=${encodeURIComponent(category)}`;
      link.dataset.category = category;
      link.textContent = category;
      tag.append(link);
      tags.append(tag);
    });
    entry.append(tags);
  }

  article.append(entry);
  return article;
}

async function ensureCatalog() {
  if (catalog.length) return catalog;
  if (!catalogPromise) {
    catalogPromise = loadCatalog().then((items) => items.map((item) => ({
      ...item,
      title: cleanTitle(item.title),
      search: normalize(`${cleanTitle(item.title)} ${item.creator || ""}`),
      categorySearch: normalize((item.categories || []).join(" ")),
    })));
  }
  catalog = await catalogPromise;
  return catalog;
}

async function search(query = field.value, category = "") {
  field.value = query;
  if (!query.trim() && !category) {
    matches = [];
    visible = 0;
    render();
    return;
  }
  status.textContent = "Carregando catálogo…";
  await ensureCatalog();
  matches = find(query, category);
  visible = pageSize;
  render();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  setUrl(field.value);
  search(field.value);
});

results.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-category]");
  if (!link) return;
  event.preventDefault();
  const category = link.dataset.category;
  setUrl("", category);
  search("", category);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const observer = new IntersectionObserver((entries) => {
  if (!entries.some((entry) => entry.isIntersecting) || visible >= matches.length) return;
  visible += pageSize;
  render();
}, { rootMargin: "480px 0px" });
observer.observe(sentinel);

window.addEventListener("popstate", () => {
  const { query, category } = queryState();
  search(query, category);
});

const initial = queryState();
if (initial.query || initial.category) search(initial.query, initial.category);
