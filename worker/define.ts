import type { Definition, LookupResult, Meaning } from "../src/lib/definitions";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
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

type WiktionaryResponse = {
  en?: { partOfSpeech?: string; definitions?: { definition?: string; examples?: string[] }[] }[];
};

async function askWiktionary(word: string, fetcher: FetchLike): Promise<Answer> {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
  const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) return "unavailable";
  const body = (await response.json()) as WiktionaryResponse;
  const meanings = (body.en ?? []).map((meaning) => ({
    partOfSpeech: meaning.partOfSpeech ?? "",
    definitions: (meaning.definitions ?? []).map((item): Definition => {
      const example = item.examples?.[0] ? plainText(item.examples[0]) : "";
      return { definition: plainText(item.definition ?? ""), ...(example ? { example } : {}) };
    }),
  }));
  return found("Wiktionary", `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`, meanings);
}

async function attempt(ask: () => Promise<Answer>): Promise<Answer> {
  try {
    return await ask();
  } catch {
    return "unavailable";
  }
}

// Returns "unavailable" only when no service could answer, so a real word is never reported as missing.
export async function lookUp(
  word: string,
  fetcher: FetchLike,
  wait: (ms: number) => Promise<unknown> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Answer> {
  let main = await attempt(() => askFreeDictionary(word, fetcher));
  if (main === "unavailable") {
    await wait(RETRY_DELAY_MS);
    main = await attempt(() => askFreeDictionary(word, fetcher));
  }
  if (main !== "unavailable" && main.status === "found") return main;

  const backup = await attempt(() => askWiktionary(word, fetcher));
  if (backup !== "unavailable" && backup.status === "found") return backup;
  return main === "unavailable" || backup === "unavailable" ? "unavailable" : { status: "not_found" };
}
