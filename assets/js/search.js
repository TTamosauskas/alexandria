// Busca desacoplada da interface: sugestões e correção de digitação.
import { normalize } from "./catalog.js?v=discovery-v1";

const equivalents = [
  ["cabala", "kabbalah", "qabalah", "qabbalah", "kabala"],
  ["tarot", "taro", "tarocchi"],
  ["alquimia", "alchemy", "alquimiae"],
  ["hermetismo", "hermeticismo", "hermeticism"],
  ["astrologia", "astrology"],
];
const aliases = new Map();
for (const family of equivalents) {
  const normalized = family.map(normalize);
  for (const word of normalized) aliases.set(word, normalized);
}

export const wordsOf = (text) => normalize(text).match(/[\p{L}\p{N}]{2,}/gu) || [];
export function prepareItem(item) {
  const title = normalize(item.title || "");
  const creator = normalize(item.creator || "");
  const category = normalize((item.categories || []).join(" "));
  return { ...item, search: title + " " + creator + " " + category, titleSearch: title, categorySearch: category };
}

export function createIndex(items) {
  const words = new Map();
  const byInitial = new Map();
  for (const item of items) {
    for (const word of new Set(wordsOf((item.title || "") + " " + (item.creator || "")))) {
      if (word.length < 4 || word.length > 24) continue;
      words.set(word, (words.get(word) || 0) + 1);
      const key = word[0];
      if (!byInitial.has(key)) byInitial.set(key, new Set());
      byInitial.get(key).add(word);
    }
  }
  return { items, words, byInitial };
}
function matchesWords(item, words) {
  return words.every((word) => item.search.includes(word));
}
function restrictCategory(items, category) {
  const key = normalize(category).trim();
  return key ? items.filter((item) => item.categorySearch.includes(key)) : items;
}
// Distância de uma única inserção, troca, deleção ou transposição adjacente.
export function oneEditAway(source, target) {
  if (source === target) return true;
  if (Math.abs(source.length - target.length) > 1) return false;
  if (source.length === target.length) {
    let differences = [];
    for (let i = 0; i < source.length; i++) if (source[i] !== target[i]) differences.push(i);
    return differences.length === 1 || (differences.length === 2 &&
      differences[1] === differences[0] + 1 &&
      source[differences[0]] === target[differences[1]] &&
      source[differences[1]] === target[differences[0]]);
  }
  const short = source.length < target.length ? source : target;
  const long = source.length < target.length ? target : source;
  let i = 0, j = 0, edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; }
    else { edits++; if (edits > 1) return false; j++; }
  }
  return true;
}
function correctedWord(index, word) {
  if (word.length < 4 || index.words.has(word)) return word;
  const candidates = index.byInitial.get(word[0]) || [];
  let best = word, bestFrequency = 0;
  for (const candidate of candidates) {
    if (!oneEditAway(word, candidate)) continue;
    const frequency = index.words.get(candidate) || 0;
    if (frequency > bestFrequency) { best = candidate; bestFrequency = frequency; }
  }
  return best;
}

export function searchIndex(index, query, category = "") {
  const pool = restrictCategory(index.items, category);
  const tokens = wordsOf(query);
  if (!tokens.length) return { items: pool, interpretation: null };
  const exact = pool.filter((item) => matchesWords(item, tokens));
  if (exact.length) return { items: exact, interpretation: null };

  // Sinônimos controlados só são usados quando não há resultados literais.
  const withAliases = pool.filter((item) => tokens.every((token) => {
    const family = aliases.get(token);
    return family ? family.some((alternative) => item.search.includes(alternative)) : item.search.includes(token);
  }));
  if (withAliases.length) return { items: withAliases, interpretation: "Termos relacionados a " + query };

  const corrected = tokens.map((word) => correctedWord(index, word));
  if (corrected.some((word, n) => word !== tokens[n])) {
    const correctedMatches = pool.filter((item) => matchesWords(item, corrected));
    if (correctedMatches.length) {
      return { items: correctedMatches, interpretation: "Resultados para “" + corrected.join(" ") + "”" };
    }
  }
  return { items: [], interpretation: null };
}

export function suggestions(index, query, limit = 6) {
  const phrase = normalize(query).trim();
  if (phrase.length < 2) return [];
  const ranked = [];
  const seen = new Set();
  for (const item of index.items) {
    const title = item.title || "";
    const normalized = item.titleSearch;
    const start = normalized.startsWith(phrase);
    const startsWord = normalized.includes(" " + phrase);
    if (!start && !startsWord) continue;
    const key = normalize(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const rank = (start ? 10 : 5) + (Math.max(0, 60 - title.length) / 100);
    ranked.push({ title, rank });
    ranked.sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title, "pt-BR"));
    if (ranked.length > limit) ranked.pop();
  }
  return ranked.map((x) => x.title);
}

export function highlightParts(value, query) {
  const text = String(value);
  const terms = wordsOf(query).filter((term) => term.length >= 2);
  if (!terms.length) return [{ text, marked: false }];
  // Mapeia caracteres normalizados para posições no texto original, preservando acentos.
  let flat = "";
  const starts = [], ends = [];
  let offset = 0;
  for (const point of text) {
    const normalized = normalize(point);
    for (let k = 0; k < normalized.length; k++) {
      flat += normalized[k];
      starts.push(offset);
      ends.push(offset + point.length);
    }
    offset += point.length;
  }
  const ranges = [];
  for (const term of terms) {
    let from = 0, index;
    while ((index = flat.indexOf(term, from)) !== -1) {
      ranges.push([starts[index], ends[index + term.length - 1]]);
      from = index + Math.max(1, term.length);
    }
  }
  if (!ranges.length) return [{ text, marked: false }];
  ranges.sort((a,b) => a[0]-b[0]);
  const merged = [];
  for (const range of ranges) {
    if (merged.length && range[0] <= merged[merged.length-1][1]) {
      merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], range[1]);
    } else merged.push([...range]);
  }
  const parts = []; let pos = 0;
  for (const [start,end] of merged) {
    if (start > pos) parts.push({text:text.slice(pos,start),marked:false});
    parts.push({text:text.slice(start,end),marked:true}); pos = end;
  }
  if (pos < text.length) parts.push({text:text.slice(pos),marked:false});
  return parts;
}
