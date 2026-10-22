import { RATINGS_CONFIG } from "./ratings-config.js";

const apiBase = RATINGS_CONFIG.apiBaseUrl.replace(/\/+$/, "");
const validLanguages = new Set(["pt", "en", "es", "all"]);
const LIMIT = 500;

export function historySearchHref(entry, pathname = "/alexandria/") {
  const params = new URLSearchParams();
  if (typeof entry.query === "string" && entry.query.trim())
    params.set("q", entry.query.trim().slice(0, 160));
  if (typeof entry.category === "string" && entry.category.trim())
    params.set("categoria", entry.category.trim().slice(0, 160));
  params.set("idioma", validLanguages.has(entry.language) ? entry.language : "all");
  return pathname + "?" + params.toString();
}

// Sem identidade, endereço IP, cookies ou dados persistidos no navegador.
export function recordSearch(query = "", category = "", language = "all") {
  const payload = {
    query: String(query).trim().slice(0, 160),
    category: String(category).trim().slice(0, 160),
    language: validLanguages.has(language) ? language : "all",
  };
  if (!payload.query && !payload.category) return Promise.resolve(false);
  return fetch(apiBase + "/api/search-history", {
    method: "POST", mode: "cors", cache: "no-store", keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((response) => response.status === 201).catch(() => false);
}

export function initEditor(onExit) {
  const library = document.querySelector("#library");
  const panel = document.querySelector("#editor-panel");
  const list = document.querySelector("#editor-list");
  const status = document.querySelector("#editor-status");
  const refreshButton = document.querySelector("#editor-refresh");
  let inEditor = false;
  let sequence = 0;

  async function refresh() {
    const ticket = ++sequence;
    status.textContent = "Carregando as últimas pesquisas…";
    list.replaceChildren();
    refreshButton.disabled = true;
    try {
      const response = await fetch(apiBase + "/api/search-history", { mode: "cors", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível consultar o histórico.");
      const payload = await response.json();
      if (!Array.isArray(payload.searches)) throw new Error("Histórico inválido.");
      if (ticket !== sequence || !inEditor) return;
      const searches = payload.searches.slice(0, LIMIT);
      const fragment = document.createDocumentFragment();
      for (const row of searches) {
        const item = document.createElement("li");
        item.className = "editor-entry";
        const link = document.createElement("a");
        link.href = historySearchHref(row, location.pathname);
        link.textContent = typeof row.query === "string" && row.query.trim()
          ? row.query.trim() + (row.category?.trim() ? " · " + row.category.trim() : "")
          : "Categoria: " + (row.category || "Não informada");
        const meta = document.createElement("span");
        meta.className = "editor-entry-meta";
        const time = Number(row.createdAt);
        const date = time > 0 ? new Date(time * 1000) : null;
        const formatted = date && Number.isFinite(date.getTime())
          ? date.toLocaleString("pt-BR") : "Data indisponível";
        const language = validLanguages.has(row.language) ? row.language.toUpperCase() : "ALL";
        meta.textContent = formatted + " · " + language;
        item.append(link, meta);
        fragment.append(item);
      }
      list.append(fragment);
      status.textContent = searches.length
        ? searches.length + " buscas recentes, da mais nova para a mais antiga."
        : "Nenhuma pesquisa registrada ainda.";
    } catch (error) {
      if (ticket === sequence && inEditor)
        status.textContent = error.message || "Não foi possível carregar o histórico.";
    } finally {
      if (ticket === sequence) refreshButton.disabled = false;
    }
  }

  function update() {
    const show = location.hash === "#editor";
    if (show === inEditor) return;
    const wasEditor = inEditor;
    inEditor = show;
    library.hidden = show;
    panel.hidden = !show;
    if (show) {
      refresh();
      window.scrollTo(0, 0);
    } else {
      sequence++;
      if (wasEditor) onExit?.();
    }
  }

  refreshButton.addEventListener("click", refresh);
  window.addEventListener("hashchange", update);
  update();
}
