import type { Definition, LookupResult, Meaning } from "../src/lib/definitions";
import { checkWord } from "../src/lib/word";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type Wait = (ms: number) => Promise<unknown>;
type Answer = LookupResult | "unavailable";

const MAX_MEANINGS = 6;
const MAX_DEFINITIONS = 8;
const TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 300;

// Wikimedia asks clients to identify themselves and how to find out more.
const USER_AGENT = "WordArchiveBot/0.1 (https://github.com/codeflamer/WordArchive) personal-reading-app";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMeanings(meanings: Meaning[]): Meaning[] {
  return meanings
    .map((meaning) => ({
      partOfSpeech: meaning.partOfSpeech.toLowerCase(),
      definitions: meaning.definitions.filter((item) => item.definition).slice(0, MAX_DEFINITIONS),
    }))
    .filter((meaning) => meaning.definitions.length > 0)
    .slice(0, MAX_MEANINGS);
}

function found(source: string, sourceUrl: string, meanings: Meaning[]): Answer {
  const cleaned = cleanMeanings(meanings);
  return cleaned.length > 0 ? { status: "found", definitions: { source, sourceUrl, meanings: cleaned } } : { status: "not_found" };
}

type FreeDictionaryEntry = {
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[];
};

async function askFreeDictionary(word: string, fetcher: FetchLike): Promise<Answer> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) return "unavailable";
  const entries = (await response.json()) as FreeDictionaryEntry[];
  const meanings = entries.flatMap((entry) => entry.meanings ?? []).map((meaning) => ({
    partOfSpeech: meaning.partOfSpeech ?? "",
    definitions: (meaning.definitions ?? []).map((item): Definition => ({
      definition: item.definition ?? "",
      ...(item.example ? { example: item.example } : {}),
    })),
  }));
  return found("Free Dictionary API, from Wiktionary", `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`, meanings);
}

type WiktionarySense = { definition?: string; examples?: string[] };
type WiktionaryEntry = { partOfSpeech?: string; definitions?: WiktionarySense[] };
type WiktionaryPage = { en?: WiktionaryEntry[] };

async function fetchWiktionary(word: string, fetcher: FetchLike): Promise<WiktionaryPage | "missing" | "unavailable"> {
  try {
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return "missing";
    if (!response.ok) return "unavailable";
    return (await response.json()) as WiktionaryPage;
  } catch {
    return "unavailable";
  }
}

function toMeanings(entries: WiktionaryEntry[], keep: (sense: WiktionarySense) => boolean = () => true): Meaning[] {
  return entries.slice(0, MAX_MEANINGS * 2).map((entry) => ({
    partOfSpeech: entry.partOfSpeech ?? "",
    // Plain text is only worked out for senses that will be shown, as long entries are costly to clean.
    definitions: (entry.definitions ?? []).filter(keep).slice(0, MAX_DEFINITIONS).map((item): Definition => {
      const example = item.examples?.[0] ? plainText(item.examples[0]) : "";
      return { definition: plainText(item.definition ?? ""), ...(example ? { example } : {}) };
    }),
  }));
}

function wiktionaryAnswer(page: WiktionaryPage | "missing" | "unavailable", word: string): Answer {
  if (page === "unavailable") return "unavailable";
  if (page === "missing") return { status: "not_found" };
  return found("Wiktionary", `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`, toMeanings(page.en ?? []));
}

const MAX_SUGGESTIONS = 4;

// How many single-letter changes turn one word into the other.
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row.push(Math.min((row.at(j - 1) ?? 0) + 1, (previous.at(j) ?? 0) + 1, (previous.at(j - 1) ?? 0) + cost));
    }
    previous = row;
  }
  return previous.at(b.length) ?? 0;
}

// Keeps close spellings only, so "ephemral" suggests "ephemeral" but not "ephemerality".
export function closeSpellings(word: string, candidates: string[]): string[] {
  const allowed = Math.max(2, Math.floor(word.length / 3));
  return candidates.filter((candidate) => {
    const check = checkWord(candidate);
    return check.ok && check.word === candidate && candidate !== word && editDistance(word, candidate) <= allowed;
  });
}

// Wiktionary covers every language, so suggestions are checked for an English entry.
async function englishOnly(words: string[], fetcher: FetchLike): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    titles: words.join("|"),
    prop: "categories",
    clcategories: "Category:English lemmas|Category:English non-lemma forms",
    cllimit: "max",
    format: "json",
    formatversion: "2",
  });
  const response = await fetcher(`https://en.wiktionary.org/w/api.php?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { query?: { pages?: { title?: string; categories?: unknown[] }[] } };
  const english = new Set((body.query?.pages ?? []).filter((page) => page.categories?.length).map((page) => page.title));
  return words.filter((word) => english.has(word));
}

// Suggestions are a convenience, so a failure here gives none rather than failing the lookup.
export async function suggestSpellings(word: string, fetcher: FetchLike): Promise<string[]> {
  try {
    const params = new URLSearchParams({ action: "opensearch", search: word, limit: "10", profile: "fuzzy", namespace: "0", format: "json" });
    const response = await fetcher(`https://en.wiktionary.org/w/api.php?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as [string, string[]];
    const close = closeSpellings(word, body[1] ?? []);
    if (close.length === 0) return [];
    return (await englishOnly(close, fetcher)).slice(0, MAX_SUGGESTIONS);
  } catch {
    return [];
  }
}

const INFLECTION = /\b(plural|past|participle|third-person|comparative|superlative|gerund|misspelling)\b/i;
const BASE_LINK = /form-of-definition-link[^>]*>.*?href="\/wiki\/([^"#]+)/s;

// Wiktionary also marks spelling variants as forms, so only grammatical changes count as inflections.
function isInflection(sense: WiktionarySense): boolean {
  const html = sense.definition ?? "";
  if (!html.includes("form-of-definition-link")) return false;
  const start = html.indexOf("form-of-definition-link");
  return INFLECTION.test(plainText(html.slice(0, start).replace(/<span[^>]*$/, "")));
}

function isTypedMeaning(sense: WiktionarySense): boolean {
  return Boolean(sense.definition) && !sense.definition?.includes("form-of-definition");
}

// A word is treated as a changed form when an inflection is listed first, or when it has almost no meaning of its own.
// So "children" becomes "child" and "mitigated" becomes "mitigate", while "news" and "interesting" stay as they are.
export function findBaseForm(page: WiktionaryPage, word: string): string | null {
  const entries = page.en ?? [];
  const senses = entries.flatMap((entry) => entry.definitions ?? []).filter((sense) => sense.definition);
  const firstInflection = senses.find(isInflection);
  if (!firstInflection) return null;

  const listedFirst = isInflection(senses[0]);
  if (!listedFirst && senses.filter(isTypedMeaning).length > 1) return null;

  const link = firstInflection.definition?.match(BASE_LINK)?.[1];
  if (!link) return null;
  let target: string;
  try {
    target = decodeURIComponent(link).replace(/_/g, " ");
  } catch {
    return null;
  }
  const check = checkWord(target);
  return check.ok && check.word !== word ? check.word : null;
}

async function attempt(ask: () => Promise<Answer>): Promise<Answer> {
  try {
    return await ask();
  } catch {
    return "unavailable";
  }
}

async function askDictionaries(
  word: string,
  fetcher: FetchLike,
  wait: Wait,
  wiktionary: () => Promise<WiktionaryPage | "missing" | "unavailable">,
): Promise<Answer> {
  let main = await attempt(() => askFreeDictionary(word, fetcher));
  if (main === "unavailable") {
    await wait(RETRY_DELAY_MS);
    main = await attempt(() => askFreeDictionary(word, fetcher));
  }
  if (main !== "unavailable" && main.status === "found") return main;

  const backup = wiktionaryAnswer(await wiktionary(), word);
  if (backup !== "unavailable" && backup.status === "found") return backup;
  return main === "unavailable" || backup === "unavailable" ? "unavailable" : { status: "not_found" };
}

// Returns "unavailable" only when no service could answer, so a real word is never reported as missing.
export async function lookUp(
  word: string,
  fetcher: FetchLike,
  wait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Answer> {
  const typedPage = await fetchWiktionary(word, fetcher);
  const baseForm = typeof typedPage === "object" ? findBaseForm(typedPage, word) : null;

  if (baseForm && typeof typedPage === "object") {
    const base = await askDictionaries(baseForm, fetcher, wait, () => fetchWiktionary(baseForm, fetcher));
    if (base !== "unavailable" && base.status === "found") {
      const typedMeanings = cleanMeanings(toMeanings(typedPage.en ?? [], isTypedMeaning));
      return {
        status: "found",
        baseForm,
        definitions: { ...base.definitions, ...(typedMeanings.length > 0 ? { typedMeanings } : {}) },
      };
    }
  }
  // Reuses the page already fetched, so Wiktionary is only asked once about the typed word.
  const answer = await askDictionaries(word, fetcher, wait, async () => typedPage);
  if (answer !== "unavailable" && answer.status === "not_found") {
    return { status: "not_found", suggestions: await suggestSpellings(word, fetcher) };
  }
  return answer;
}
