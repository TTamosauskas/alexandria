import { loadCatalog, normalize } from "./catalog.js";

const pageSize = 24;
const form = document.querySelector("#search-form");
const field = document.querySelector("#search-input");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const more = document.querySelector("#more");
const placeholderCover = "assets/cover-placeholder.svg";

let catalog = [];
let matches = [];
let visible = 0;

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

function render() {
  const entries = matches.slice(0, visible);
  results.replaceChildren(...entries.map(renderEntry));
  more.hidden = visible >= matches.length;
  more.textContent = `Mais resultados (${Math.max(matches.length - visible, 0)})`;
  if (matches.length) status.textContent = `${matches.length.toLocaleString("pt-BR")} documentos`;
  else status.textContent = field.value || queryState().category ? "Nenhum documento encontrado" : "";
}

function coverSources(identifier) {
  const item = encodeURIComponent(identifier);
  return [
    `https://archive.org/download/${item}/page/n0.jpg`,
    `https://archive.org/services/img/${item}`,
    placeholderCover,
  ];
}

function setCoverSource(image, sources, index = 0) {
  image.dataset.coverSource = String(index);
  image.src = sources[index];
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
  const sources = coverSources(item.identifier);
  cover.addEventListener("error", () => {
    const next = Number(cover.dataset.coverSource || 0) + 1;
    if (next < sources.length) setCoverSource(cover, sources, next);
  });
  setCoverSource(cover, sources);

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

  article.append(cover, entry);
  return article;
}

function search(query = field.value, category = "") {
  field.value = query;
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

more.addEventListener("click", () => {
  visible += pageSize;
  render();
});

window.addEventListener("popstate", () => {
  const { query, category } = queryState();
  search(query, category);
});

const initial = queryState();
status.textContent = "Carregando catálogo…";
catalog = await loadCatalog((loaded, total) => {
  status.textContent = `Carregando catálogo… ${loaded.toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")}`;
});
catalog = catalog.map((item) => ({
  ...item,
  search: normalize(`${item.title} ${item.creator || ""}`),
  categorySearch: normalize((item.categories || []).join(" ")),
}));
search(initial.query, initial.category);
