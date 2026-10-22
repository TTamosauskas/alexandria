const encoder = new TextEncoder();
const BOOK_ID = /^[a-f0-9]{64}$/;
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function headers(origin, cache = "no-store") {
  const output = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cache,
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin) {
    output["Access-Control-Allow-Origin"] = origin;
    output["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    output["Access-Control-Allow-Headers"] = "Content-Type";
    output["Access-Control-Max-Age"] = "600";
  }
  return output;
}

function respond(body, code = 200, origin = null, cache) {
  return new Response(JSON.stringify(body), { status: code, headers: headers(origin, cache) });
}

function isConfigured(env) {
  return Boolean(env.DB && env.ALLOWED_ORIGIN && env.VOTER_HASH_SECRET);
}

async function voterHash(secret, visitorId) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const result = await crypto.subtle.sign("HMAC", key, encoder.encode(visitorId));
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function listRatings(env, origin) {
  const data = await env.DB.prepare(
    "SELECT book_id AS bookId, score_sum * 1.0 / vote_count AS average, vote_count AS count " +
    "FROM book_ratings WHERE vote_count > 0 ORDER BY book_id LIMIT 30000"
  ).all();
  return respond({ ratings: data.results || [] }, 200, origin);
}

async function saveRating(request, env, origin) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    return respond({ error: "É necessário enviar JSON." }, 415, origin);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return respond({ error: "Requisição muito grande." }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return respond({ error: "JSON inválido." }, 400, origin);
  }

  if (!body || !BOOK_ID.test(body.bookId) || !VISITOR_ID.test(body.visitorId)
      || !Number.isInteger(body.score) || body.score < 1 || body.score > 5) {
    return respond({ error: "Dados de avaliação inválidos." }, 400, origin);
  }

  const hash = await voterHash(env.VOTER_HASH_SECRET, body.visitorId);
  // D1 executa os statements em batch como uma transação.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO rating_votes (book_id, voter_hash, score, updated_at) " +
      "VALUES (?, ?, ?, unixepoch()) " +
      "ON CONFLICT(book_id, voter_hash) DO UPDATE SET score = excluded.score, updated_at = unixepoch()"
    ).bind(body.bookId, hash, body.score),
    env.DB.prepare(
      "INSERT INTO book_ratings (book_id, score_sum, vote_count) " +
      "SELECT book_id, SUM(score), COUNT(*) FROM rating_votes WHERE book_id = ? GROUP BY book_id " +
      "ON CONFLICT(book_id) DO UPDATE SET score_sum = excluded.score_sum, vote_count = excluded.vote_count"
    ).bind(body.bookId),
  ]);

  const record = await env.DB.prepare(
    "SELECT book_id AS bookId, score_sum * 1.0 / vote_count AS average, " +
    "vote_count AS count FROM book_ratings WHERE book_id = ?"
  ).bind(body.bookId).first();

  return respond({ rating: record }, 200, origin);
}


// O histórico de pesquisas é público, anônimo e limitado a 500 entradas no D1.
// A exclusão automática ocorre dentro de um trigger SQLite após cada inserção.
const HISTORY_LANGUAGES = new Set(["pt", "en", "es", "all"]);
async function listSearchHistory(env, origin) {
  const rows = await env.DB.prepare(
    "SELECT id, query, category, language, created_at AS createdAt " +
    "FROM search_history ORDER BY id DESC LIMIT 500"
  ).all();
  return respond({ searches: rows.results || [] }, 200, origin);
}

async function saveSearchHistory(request, env, origin) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    return respond({ error: "É necessário enviar JSON." }, 415, origin);
  }
  let payload;
  try {
    const body = await request.text();
    if (body.length > 1024) return respond({ error: "Pesquisa muito longa." }, 413, origin);
    payload = JSON.parse(body);
  } catch {
    return respond({ error: "JSON inválido." }, 400, origin);
  }

  if (!payload || typeof payload.query !== "string" || typeof payload.category !== "string"
      || typeof payload.language !== "string") {
    return respond({ error: "Dados de pesquisa inválidos." }, 400, origin);
  }
  const query = payload.query.trim();
  const category = payload.category.trim();
  if ((!query && !category) || query.length > 160 || category.length > 160
      || !HISTORY_LANGUAGES.has(payload.language)
      || /[\u0000-\u0008\u000e-\u001f\u007f]/.test(query + category)) {
    return respond({ error: "Pesquisa inválida." }, 400, origin);
  }
  await env.DB.prepare(
    "INSERT INTO search_history (query, category, language) VALUES (?, ?, ?)"
  ).bind(query, category, payload.language).run();
  return respond({ recorded: true }, 201, origin);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const originHeader = request.headers.get("Origin");
    const origin = originHeader === env.ALLOWED_ORIGIN ? originHeader : null;

    if (path === "/api/health" && request.method === "GET") {
      return respond({ ok: Boolean(env.DB), voting: "direct" });
    }

    if (path !== "/api/ratings" && path !== "/api/search-history")
      return respond({ error: "Não encontrado." }, 404);

    // Não aceitamos envios de origens diferentes da biblioteca.
    if (originHeader && !origin) return respond({ error: "Origem não permitida." }, 403);
    if (request.method === "OPTIONS") {
      if (!origin) return respond({ error: "Origem não permitida." }, 403);
      return new Response(null, { status: 204, headers: headers(origin) });
    }
    if (request.method === "POST" && !origin) {
      return respond({ error: "Origem obrigatória." }, 403);
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return respond({ error: "Método não permitido." }, 405, origin);
    }
    if (!isConfigured(env)) return respond({ error: "Serviço não configurado." }, 503, origin);

    try {
      if (path === "/api/search-history") {
        return request.method === "GET"
          ? await listSearchHistory(env, origin)
          : await saveSearchHistory(request, env, origin);
      }
      return request.method === "GET"
        ? await listRatings(env, origin)
        : await saveRating(request, env, origin);
    } catch (error) {
      console.error("Ratings API failure", error);
      return respond({ error: "Serviço temporariamente indisponível." }, 503, origin);
    }
  },
};
