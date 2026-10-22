import { RATINGS_CONFIG } from "./ratings-config.js";

export const ratingsEnabled = Boolean(RATINGS_CONFIG.enabled && RATINGS_CONFIG.apiBaseUrl);
const apiBase = RATINGS_CONFIG.apiBaseUrl.replace(/\/+$/, "");
const ratingCache = new Map();
const knownBooks = new Map();
const pendingBooks = new Set();
let ratingsRequest;
let onRatingSaved = () => {};
let fallbackVisitorId;

export async function assignRatingIds(items) {
  if (!ratingsEnabled) return;
  await Promise.all(items.map(async (item) => {
    if (item.ratingId) return;
    const input = new TextEncoder().encode((item.language || "pt") + "\0" + item.pdf_url);
    const bytes = await crypto.subtle.digest("SHA-256", input);
    item.ratingId = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }));
}

export async function loadRatings() {
  if (!ratingsEnabled) return;
  if (!ratingsRequest) {
    ratingsRequest = fetch(apiBase + "/api/ratings", { mode: "cors", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Servidor de avaliações indisponível");
        return response.json();
      })
      .then((payload) => {
        if (!Array.isArray(payload.ratings)) throw new Error("Resposta de avaliações inválida");
        ratingCache.clear();
        for (const record of payload.ratings) {
          if (typeof record.bookId === "string"
            && Number.isFinite(record.average) && Number.isInteger(record.count)
            && record.count > 0) {
            ratingCache.set(record.bookId, { average: record.average, count: record.count });
          }
        }
      }).finally(() => { ratingsRequest = null; });
  }
  return ratingsRequest;
}

export function compareByRating(left, right) {
  const a = ratingCache.get(left.ratingId);
  const b = ratingCache.get(right.ratingId);
  if (a && b) {
    if (b.average !== a.average) return b.average - a.average;
    if (b.count !== a.count) return b.count - a.count;
  } else if (a) {
    return -1;
  } else if (b) {
    return 1;
  }
  return left.title.localeCompare(right.title, "pt-BR");
}

export function ratingElement(item) {
  if (!ratingsEnabled || !item.ratingId) return null;
  knownBooks.set(item.ratingId, item);
  const rating = ratingCache.get(item.ratingId);
  const group = document.createElement("div");
  group.className = "rating-row";
  group.setAttribute("aria-label", rating
    ? "Média de " + rating.average.toFixed(1) + " em cinco estrelas"
    : "Documento ainda não avaliado");

  const stars = document.createElement("span");
  stars.className = "rating-stars";
  for (let score = 1; score <= 5; score++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rating-star";
    button.dataset.ratingBook = item.ratingId;
    button.dataset.ratingScore = String(score);
    button.setAttribute("aria-label", "Dar " + score +
      (score === 1 ? " estrela" : " estrelas") + " para " + item.title);
    button.title = "Dar " + score + (score === 1 ? " estrela" : " estrelas");
    button.textContent = score <= Math.round(rating?.average || 0) ? "★" : "☆";
    stars.append(button);
  }

  const summary = document.createElement("span");
  summary.className = "rating-summary";
  summary.textContent = rating
    ? rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      + "/5 · " + rating.count + (rating.count === 1 ? " voto" : " votos")
    : "Sem avaliações";

  const message = document.createElement("span");
  message.className = "rating-inline-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  group.append(stars, summary, message);
  return group;
}

function visitorId() {
  const storageKey = "alexandria-anonymous-voter-v1";
  try {
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey, id);
    }
    return id;
  } catch {
    fallbackVisitorId ||= crypto.randomUUID();
    return fallbackVisitorId;
  }
}

// Um clique envia diretamente a nota, sem login, modal ou verificacao Turnstile.
export async function voteRating(item, score) {
  if (!ratingsEnabled || !item?.ratingId || !Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error("Avaliação inválida.");
  }
  const response = await fetch(apiBase + "/api/ratings", {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId: item.ratingId, visitorId: visitorId(), score }),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Não foi possível ler a resposta do servidor.");
  }
  if (!response.ok || !payload.rating || payload.rating.bookId !== item.ratingId) {
    throw new Error(payload.error || "Não foi possível registrar a avaliação.");
  }
  const average = Number(payload.rating.average);
  const count = Number(payload.rating.count);
  if (!Number.isFinite(average) || !Number.isInteger(count) || count < 1) {
    throw new Error("Resposta de avaliação inválida.");
  }
  ratingCache.set(item.ratingId, { average, count });
  return { average, count };
}

export function initializeRatings(root, onUpdated = () => {}) {
  if (!ratingsEnabled) return;
  onRatingSaved = onUpdated;
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-rating-book][data-rating-score]");
    if (!button || !root.contains(button)) return;
    const bookId = button.dataset.ratingBook;
    const item = knownBooks.get(bookId);
    const score = Number(button.dataset.ratingScore);
    if (!item || pendingBooks.has(bookId)) return;
    pendingBooks.add(bookId);

    const row = button.closest(".rating-row");
    const message = row?.querySelector(".rating-inline-message");
    row?.querySelectorAll(".rating-star").forEach((star) => { star.disabled = true; });
    if (message) message.textContent = "Salvando…";

    try {
      await voteRating(item, score);
      if (message) message.textContent = "Voto registrado";
      onRatingSaved(bookId);
    } catch (error) {
      if (message) message.textContent = error.message || "Não foi possível votar.";
    } finally {
      pendingBooks.delete(bookId);
      // Em caso de erro, libera a tentativa na mesma linha.
      row?.querySelectorAll(".rating-star").forEach((star) => { star.disabled = false; });
    }
  });
}
