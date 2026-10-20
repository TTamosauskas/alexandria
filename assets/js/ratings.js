import { RATINGS_CONFIG } from "./ratings-config.js";

export const ratingsEnabled = Boolean(RATINGS_CONFIG.apiBaseUrl && RATINGS_CONFIG.turnstileSiteKey);
const apiBase = RATINGS_CONFIG.apiBaseUrl.replace(/\/+$/, "");
const ratingCache = new Map();
const knownBooks = new Map();
let catalogRatingsPromise;
let updateCallback = () => {};
let dialog;
let chosenBook;
let chosenScore = 0;
let challengeToken = "";
let widgetId = null;
let fallbackVisitorId;

export async function assignRatingIds(items) {
  if (!ratingsEnabled) return;
  await Promise.all(items.map(async (item) => {
    if (item.ratingId) return;
    const input = new TextEncoder().encode((item.language || "pt") + "\0" + item.pdf_url);
    const data = await crypto.subtle.digest("SHA-256", input);
    item.ratingId = [...new Uint8Array(data)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }));
}

export async function loadRatings() {
  if (!ratingsEnabled) return;
  if (!catalogRatingsPromise) {
    catalogRatingsPromise = fetch(apiBase + "/api/ratings", { mode: "cors" })
      .then((response) => {
        if (!response.ok) throw new Error("Servidor de avaliações indisponível");
        return response.json();
      })
      .then((payload) => {
        if (!Array.isArray(payload.ratings)) throw new Error("Resposta de avaliações inválida");
        ratingCache.clear();
        for (const rating of payload.ratings) {
          if (typeof rating.bookId === "string"
              && Number.isFinite(rating.average) && Number.isInteger(rating.count)
              && rating.count > 0) {
            ratingCache.set(rating.bookId, { average: rating.average, count: rating.count });
          }
        }
      })
      .catch((error) => {
        catalogRatingsPromise = null;
        throw error;
      });
  }
  return catalogRatingsPromise;
}

export function compareByRating(a, b) {
  const left = ratingCache.get(a.ratingId);
  const right = ratingCache.get(b.ratingId);
  if (left && right) {
    const byAverage = right.average - left.average;
    if (byAverage) return byAverage;
    const byCount = right.count - left.count;
    if (byCount) return byCount;
  } else if (left) {
    return -1;
  } else if (right) {
    return 1;
  }
  return a.title.localeCompare(b.title, "pt-BR");
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
    const star = document.createElement("button");
    star.type = "button";
    star.className = "rating-star";
    star.dataset.ratingBook = item.ratingId;
    star.dataset.ratingScore = String(score);
    star.setAttribute("aria-label", "Avaliar " + item.title + " com " + score + (score === 1 ? " estrela" : " estrelas"));
    star.textContent = score <= Math.round(rating?.average || 0) ? "★" : "☆";
    stars.append(star);
  }

  const summary = document.createElement("span");
  summary.className = "rating-summary";
  summary.textContent = rating
    ? rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      + "/5 · " + rating.count + (rating.count === 1 ? " voto" : " votos")
    : "Sem avaliações";
  group.append(stars, summary);
  return group;
}

function visitorId() {
  const key = "alexandria-anonymous-voter-v1";
  try {
    let saved = localStorage.getItem(key);
    if (!saved) {
      saved = crypto.randomUUID();
      localStorage.setItem(key, saved);
    }
    return saved;
  } catch {
    fallbackVisitorId ||= crypto.randomUUID();
    return fallbackVisitorId;
  }
}

function closeDialog() {
  if (dialog?.open) dialog.close();
}

async function ensureTurnstile() {
  if (window.turnstile) return window.turnstile;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile não iniciou"));
    script.onerror = () => reject(new Error("Não foi possível carregar a verificação"));
    document.head.append(script);
  });
}

function selectScore(score) {
  chosenScore = score;
  dialog.querySelectorAll("[data-choose-score]").forEach((button) => {
    button.textContent = Number(button.dataset.chooseScore) <= score ? "★" : "☆";
    button.setAttribute("aria-pressed", String(Number(button.dataset.chooseScore) === score));
  });
}

async function openDialog(book, score) {
  chosenBook = book;
  challengeToken = "";
  dialog.querySelector(".rating-dialog-title").textContent = "Avaliar: " + book.title;
  dialog.querySelector(".rating-dialog-feedback").textContent = "";
  dialog.querySelector(".rating-submit").disabled = true;
  dialog.querySelector(".rating-challenge").replaceChildren();
  selectScore(score);
  dialog.showModal();

  try {
    const turnstile = await ensureTurnstile();
    if (!dialog.open || chosenBook !== book) return;
    widgetId = turnstile.render(dialog.querySelector(".rating-challenge"), {
      sitekey: RATINGS_CONFIG.turnstileSiteKey,
      action: "alexandria_rating",
      callback(token) {
        challengeToken = token;
        dialog.querySelector(".rating-submit").disabled = false;
      },
      "expired-callback"() {
        challengeToken = "";
        dialog.querySelector(".rating-submit").disabled = true;
      },
      "error-callback"() {
        challengeToken = "";
        dialog.querySelector(".rating-submit").disabled = true;
      },
    });
  } catch {
    if (dialog.open) {
      dialog.querySelector(".rating-dialog-feedback").textContent = "Não foi possível carregar a verificação antiabuso.";
    }
  }
}

async function submitRating() {
  if (!chosenBook || !chosenScore || !challengeToken) return;
  const book = chosenBook;
  const button = dialog.querySelector(".rating-submit");
  button.disabled = true;
  dialog.querySelector(".rating-dialog-feedback").textContent = "Registrando voto…";
  try {
    const response = await fetch(apiBase + "/api/ratings", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: book.ratingId,
        visitorId: visitorId(),
        score: chosenScore,
        token: challengeToken,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.rating || payload.rating.bookId !== book.ratingId) {
      throw new Error(payload.error || "Não foi possível registrar o voto.");
    }
    ratingCache.set(book.ratingId, {
      average: Number(payload.rating.average),
      count: Number(payload.rating.count),
    });
    closeDialog();
    updateCallback();
  } catch (error) {
    dialog.querySelector(".rating-dialog-feedback").textContent =
      error.message || "Não foi possível registrar o voto.";
  } finally {
    challengeToken = "";
    if (dialog.open && widgetId !== null && window.turnstile) {
      window.turnstile.reset(widgetId);
    }
  }
}

export function initializeRatings(root, onUpdated = () => {}) {
  if (!ratingsEnabled) return;
  updateCallback = onUpdated;
  dialog = document.createElement("dialog");
  dialog.className = "rating-dialog";
  dialog.innerHTML = `
    <div class="rating-dialog-content">
      <button type="button" class="rating-close" aria-label="Fechar avaliação">×</button>
      <h2 class="rating-dialog-title"></h2>
      <p>Escolha sua nota de 1 a 5 estrelas.</p>
      <div class="rating-choose" role="group" aria-label="Sua nota">
        <button type="button" data-choose-score="1" aria-label="1 estrela">☆</button>
        <button type="button" data-choose-score="2" aria-label="2 estrelas">☆</button>
        <button type="button" data-choose-score="3" aria-label="3 estrelas">☆</button>
        <button type="button" data-choose-score="4" aria-label="4 estrelas">☆</button>
        <button type="button" data-choose-score="5" aria-label="5 estrelas">☆</button>
      </div>
      <div class="rating-challenge"></div>
      <p class="rating-dialog-feedback" aria-live="polite"></p>
      <button type="button" class="rating-submit" disabled>Enviar avaliação</button>
      <p class="rating-notice">Voto anônimo vinculado a este navegador. Você pode alterar sua nota.</p>
    </div>
  `;
  document.body.append(dialog);

  dialog.querySelector(".rating-close").addEventListener("click", closeDialog);
  dialog.querySelector(".rating-submit").addEventListener("click", submitRating);
  dialog.querySelectorAll("[data-choose-score]").forEach((button) => {
    button.addEventListener("click", () => selectScore(Number(button.dataset.chooseScore)));
  });
  dialog.addEventListener("close", () => {
    challengeToken = "";
    if (widgetId !== null && window.turnstile) {
      window.turnstile.remove(widgetId);
    }
    widgetId = null;
    chosenBook = null;
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rating-book]");
    if (!button) return;
    const book = knownBooks.get(button.dataset.ratingBook);
    if (book) openDialog(book, Number(button.dataset.ratingScore));
  });
}
