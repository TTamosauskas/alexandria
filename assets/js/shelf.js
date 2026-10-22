// A estante é exclusiva deste navegador. Não utiliza conta ou servidor.
export const SHELF_KEY = "alexandria-local-shelf-v1";
const MAX_FAVORITES = 500;
const MAX_RECENT = 40;
let backup = { favorites: [], recent: [] };

export function itemKey(item) {
  return (item?.language || "pt") + "::" + (item?.pdf_url || "");
}
function safeItem(item) {
  if (!item || !["pt","en","es"].includes(item.language || "pt")) return null;
  let link;
  try { link = new URL(item.pdf_url); } catch { return null; }
  if (link.protocol !== "https:" || link.hostname !== "archive.org" || !link.pathname.startsWith("/download/")) return null;
  return {
    language: item.language || "pt",
    pdf_url: link.href,
    identifier: String(item.identifier || "").slice(0, 300),
    title: String(item.title || "Documento").slice(0, 500),
    creator: String(item.creator || "").slice(0, 500),
    categories: (Array.isArray(item.categories) ? item.categories : []).filter((v)=>typeof v==="string").slice(0, 15),
  };
}
function sanitizeCollection(data, limit) {
  const list = [];
  const seen = new Set();
  for (const raw of Array.isArray(data) ? data : []) {
    const item = safeItem(raw);
    if (!item || seen.has(itemKey(item))) continue;
    list.push(item); seen.add(itemKey(item));
    if (list.length >= limit) break;
  }
  return list;
}
function storage() {
  try { return localStorage; } catch { return null; }
}
function readState() {
  const store = storage();
  if (!store) return backup;
  try {
    const parsed = JSON.parse(store.getItem(SHELF_KEY) || "null");
    if (!parsed) return backup;
    return {
      favorites: sanitizeCollection(parsed.favorites, MAX_FAVORITES),
      recent: sanitizeCollection(parsed.recent, MAX_RECENT),
    };
  } catch { return backup; }
}
function writeState(state) {
  backup = state;
  try { storage()?.setItem(SHELF_KEY, JSON.stringify(state)); } catch { /* privado ou cheio */ }
}
export function getShelf(kind) {
  const state = readState();
  return [...(kind === "recent" ? state.recent : state.favorites)];
}
export function isFavorite(item) {
  return getShelf("favorites").some((saved) => itemKey(saved) === itemKey(item));
}
export function toggleFavorite(raw) {
  const item = safeItem(raw);
  if (!item) return false;
  const state = readState();
  const key = itemKey(item);
  const exists = state.favorites.some((saved) => itemKey(saved) === key);
  state.favorites = exists
    ? state.favorites.filter((saved) => itemKey(saved) !== key)
    : [item, ...state.favorites].slice(0, MAX_FAVORITES);
  writeState(state);
  return !exists;
}
export function rememberOpened(raw) {
  const item = safeItem(raw);
  if (!item) return;
  const state = readState();
  state.recent = [item, ...state.recent.filter((saved) => itemKey(saved) !== itemKey(item))].slice(0, MAX_RECENT);
  writeState(state);
}
