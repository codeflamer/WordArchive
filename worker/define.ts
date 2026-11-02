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

const INFLECTION = /\b(plural|past|participle|third-person|comparative|superlative|gerund)\b/i;
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
  return askDictionaries(word, fetcher, wait, async () => typedPage);
}
