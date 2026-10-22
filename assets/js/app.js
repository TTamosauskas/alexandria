import { loadCatalog, normalize, getCatalogCount } from "./catalog.js";
import { createIndex, prepareItem, searchIndex, suggestions, highlightParts } from "./search.js";
import { getShelf, isFavorite, toggleFavorite, rememberOpened, itemKey } from "./shelf.js";
import { ratingsEnabled, assignRatingIds, loadRatings, compareByRating, ratingElement, initializeRatings } from "./ratings.js?v=stars-round-up-v2";

const pageSize = 24;
const form = document.querySelector("#search-form");
const field = document.querySelector("#search-input");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const sentinel = document.querySelector("#results-sentinel");
const suggestionList = document.querySelector("#search-suggestions");
const totalCounter = document.querySelector("#catalog-total");
const shelfTabs = Array.from(document.querySelectorAll("[data-shelf-view]"));
const radios = Array.from(document.querySelectorAll('input[name="idioma"]'));
const validLanguages = new Set(["pt", "en", "es", "all"]);

let matches = [];
let visible = 0;
let requestId = 0;
let suggestionsSequence = 0;
let suggestionsTimer;
let currentView = "search";
let currentQuery = "";
let interpretation = null;
const indexPromises = new Map();
const visibleBooks = new Map();

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
    view: ["favorites", "recent"].includes(params.get("estante")) ? params.get("estante") : "search",
  };
}

function setUrl(query, category = "", language = "all", view = "search") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("categoria", category);
  if (view !== "search") params.set("estante", view);
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
    const request = loadCatalog(language).then((records) => {
      const items = records.map((record) => prepareItem({
        ...record,
        title: cleanTitle(record.title),
      }));
      return createIndex(items);
    }).catch((error) => {
      indexPromises.delete(language);
      throw error;
    });
    indexPromises.set(language, request);
  }
  return indexPromises.get(language);
}

function updateTabs() {
  shelfTabs.forEach((button) => {
    const active = button.dataset.shelfView === currentView;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("library-tab--active", active);
  });
  const total = getShelf("favorites").length;
  const count = document.querySelector("#favorites-count");
  if (count) count.textContent = total ? " (" + total.toLocaleString("pt-BR") + ")" : "";
}

function clearSuggestions() {
  suggestionsSequence++;
  clearTimeout(suggestionsTimer);
  suggestionList.replaceChildren();
  suggestionList.hidden = true;
  field.setAttribute("aria-expanded", "false");
}

function markText(parent, value, query) {
  const parts = highlightParts(value, query);
  for (const part of parts) {
    if (part.marked) {
      const mark = document.createElement("mark");
      mark.textContent = part.text;
      parent.append(mark);
    } else {
      parent.append(document.createTextNode(part.text));
    }
  }
}

function showSuggestions(titles) {
  suggestionList.replaceChildren();
  titles.forEach((title, index) => {
    const option = document.createElement("li");
    option.role = "option";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.suggestedTitle = title;
    button.id = "suggestion-" + index;
    markText(button, title, field.value);
    option.append(button);
    suggestionList.append(option);
  });
  suggestionList.hidden = titles.length === 0;
  field.setAttribute("aria-expanded", String(titles.length > 0));
}

function scheduleSuggestions() {
  const token = ++suggestionsSequence;
  clearTimeout(suggestionsTimer);
  const text = field.value.trim();
  if (text.length < 2 || currentView !== "search") {
    suggestionList.replaceChildren();
    suggestionList.hidden = true;
    field.setAttribute("aria-expanded", "false");
    return;
  }
  suggestionsTimer = setTimeout(async () => {
    try {
      const index = await indexedCatalog(selectedLanguage());
      if (token !== suggestionsSequence || document.activeElement !== field) return;
      showSuggestions(suggestions(index, text, 6));
    } catch (error) {
      console.warn("Sugestões indisponíveis", error);
    }
  }, 250);
}

function safeArchiveUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "archive.org" && url.pathname.startsWith("/download/")
      ? url.href : null;
  } catch { return null; }
}

function archiveCover(identifier) {
  return "https://archive.org/services/img/" + encodeURIComponent(identifier);
}

function renderEntry(item) {
  visibleBooks.set(itemKey(item), item);
  const article = document.createElement("article");
  article.className = "result";

  const cover = document.createElement("img");
  cover.className = "cover";
  cover.alt = "Capa do documento";
  cover.width = 104;
  cover.height = 146;
  cover.loading = "lazy";
  cover.decoding = "async";
  cover.src = archiveCover(item.identifier);
  cover.addEventListener("error", () => {
    article.classList.add("result--no-cover");
    cover.remove();
  });

  const entry = document.createElement("div");
  entry.className = "entry";
  const url = safeArchiveUrl(item.pdf_url);
  const title = document.createElement(url ? "a" : "span");
  title.className = "title";
  if (url) {
    title.href = url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.dataset.openPdf = itemKey(item);
  } else {
    title.title = "Link do PDF indisponível";
  }
  if (currentView === "search" && currentQuery) {
    markText(title, item.title, currentQuery);
  } else {
    title.textContent = item.title;
  }
  entry.append(title);

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "favorite-toggle";
  favorite.dataset.favoriteKey = itemKey(item);
  favorite.setAttribute("aria-pressed", String(isFavorite(item)));
  favorite.setAttribute("aria-label", (isFavorite(item) ? "Remover dos favoritos: " : "Guardar nos favoritos: ") + item.title);
  favorite.textContent = isFavorite(item) ? "♥ Salvo" : "♡ Guardar";
  entry.append(favorite);

  if ((item.categories || []).length) {
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

  const rating = ratingElement(item);
  if (rating) entry.append(rating);
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
  visibleBooks.clear();
  visible = 0;
  if (matches.length) {
    const noun = currentView === "favorites" ? " favoritos"
      : currentView === "recent" ? " vistos recentemente" : " documentos";
    status.textContent = matches.length.toLocaleString("pt-BR") + noun +
      (interpretation ? " · " + interpretation : "");
    appendNextPage();
  } else if (currentView === "favorites") {
    status.textContent = "Sua estante está vazia. Use “♡ Guardar” para adicionar livros.";
  } else if (currentView === "recent") {
    status.textContent = "Nenhuma leitura recente neste navegador.";
  } else if (language === "es" && !currentQuery) {
    status.textContent = "Nenhum documento encontrado.";
  } else {
    status.textContent = "Nenhum documento encontrado. Tente outra grafia ou assunto.";
  }
}

async function decorateRatings(items) {
  if (!ratingsEnabled) return;
  await assignRatingIds(items);
  try { await loadRatings(); }
  catch (error) { console.warn("Avaliações temporariamente indisponíveis", error); }
}

async function displayShelf(view) {
  const currentRequest = ++requestId;
  clearSuggestions();
  currentView = view;
  currentQuery = "";
  interpretation = null;
  updateTabs();
  status.textContent = "Carregando sua estante…";
  const saved = getShelf(view).map(prepareItem);
  try {
    await decorateRatings(saved);
    if (currentRequest !== requestId) return;
    matches = saved;
    showMatches(selectedLanguage());
  } catch (error) {
    if (currentRequest !== requestId) return;
    matches = saved;
    showMatches(selectedLanguage());
  }
}

async function search(query = field.value, category = "", language = selectedLanguage(), browse = true) {
  const currentRequest = ++requestId;
  currentView = "search";
  currentQuery = query;
  interpretation = null;
  updateTabs();
  const activeLanguage = languageFrom(language);
  field.value = query;
  setSelectedLanguage(activeLanguage);
  clearSuggestions();
  if (!browse && !query.trim() && !category) {
    matches = [];
    visible = 0;
    visibleBooks.clear();
    results.replaceChildren();
    status.textContent = "";
    return;
  }
  status.textContent = "Carregando catálogo…";
  try {
    const index = await indexedCatalog(activeLanguage);
    if (currentRequest !== requestId) return;
    const found = searchIndex(index, query, category);
    matches = found.items;
    interpretation = found.interpretation;
    await decorateRatings(matches);
    if (currentRequest !== requestId) return;
    if (ratingsEnabled) matches.sort(compareByRating);
    else matches.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
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
  clearSuggestions();
  const language = selectedLanguage();
  setUrl(field.value, "", language);
  search(field.value, "", language);
});

radios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    // A seleção do idioma prepara a próxima busca, sem carregar ou exibir resultados.
    ++requestId; // Ignora qualquer busca anterior que ainda esteja em andamento.
    clearSuggestions();
    currentView = "search";
    updateTabs();
    matches = [];
    visible = 0;
    visibleBooks.clear();
    results.replaceChildren();
    status.textContent = "";
    setUrl("", "", radio.value);
  });
});

results.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest("button[data-favorite-key]");
  if (favoriteButton) {
    const item = visibleBooks.get(favoriteButton.dataset.favoriteKey);
    if (!item) return;
    const saved = toggleFavorite(item);
    updateTabs();
    if (currentView === "favorites") {
      displayShelf("favorites");
    } else {
      favoriteButton.setAttribute("aria-pressed", String(saved));
      favoriteButton.textContent = saved ? "♥ Salvo" : "♡ Guardar";
      favoriteButton.setAttribute("aria-label",
        (saved ? "Remover dos favoritos: " : "Guardar nos favoritos: ") + item.title);
    }
    return;
  }
  const pdfLink = event.target.closest("a[data-open-pdf]");
  if (pdfLink) {
    const item = visibleBooks.get(pdfLink.dataset.openPdf);
    if (item) {
      rememberOpened(item);
      updateTabs();
    }
    return;
  }
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
  if (state.view === "search") search(state.query, state.category, state.language, state.browse);
  else displayShelf(state.view);
});

shelfTabs.forEach((button) => button.addEventListener("click", () => {
  const view = button.dataset.shelfView;
  if (view === currentView) return;
  setUrl("", "", selectedLanguage(), view);
  if (view === "search") search("", "", selectedLanguage(), false);
  else displayShelf(view);
}));

field.addEventListener("input", scheduleSuggestions);
field.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearSuggestions();
  if (event.key === "ArrowDown" && !suggestionList.hidden) {
    event.preventDefault();
    suggestionList.querySelector("button")?.focus();
  }
});
suggestionList.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { clearSuggestions(); field.focus(); }
});
suggestionList.addEventListener("click", (event) => {
  const option = event.target.closest("button[data-suggested-title]");
  if (!option) return;
  field.value = option.dataset.suggestedTitle;
  const language = selectedLanguage();
  setUrl(field.value, "", language);
  search(field.value, "", language);
});
document.addEventListener("click", (event) => {
  if (!form.contains(event.target)) clearSuggestions();
});

getCatalogCount().then((total) => {
  totalCounter.textContent = total.toLocaleString("pt-BR") + " documentos no acervo";
}).catch(() => { totalCounter.textContent = "Pesquise no acervo"; });

initializeRatings(results, (ratedBookId) => {
  const previouslyVisible = visible;
  matches.sort(compareByRating);
  results.replaceChildren();
  visible = 0;
  // Preserva as paginas ja carregadas enquanto a nova ordenacao e aplicada.
  while (visible < previouslyVisible && visible < matches.length) {
    appendNextPage();
  }
  // O livro avaliado pode subir no ranking; mantemos a nota atualizada visivel.
  const updatedStar = results.querySelector('[data-rating-book="' + ratedBookId + '"]');
  updatedStar?.closest(".result")?.scrollIntoView({ behavior: "smooth", block: "center" });
  status.textContent = "Avaliação registrada. " + matches.length.toLocaleString("pt-BR") + " documentos";
});

updateTabs();
const initial = queryState();
if (initial.view === "search") search(initial.query, initial.category, initial.language, initial.browse);
else displayShelf(initial.view);
