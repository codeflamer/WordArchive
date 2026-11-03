import type { Pronunciation } from "../src/lib/definitions";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type Phonetic = { text?: string; audio?: string };

const TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 300;
const ACCENT_ORDER = ["us", "uk"];

function accentRank(audio: string): number {
  const accent = audio.match(/-([a-z]{2})\.mp3$/i)?.[1]?.toLowerCase() ?? "";
  const rank = ACCENT_ORDER.indexOf(accent);
  return rank === -1 ? ACCENT_ORDER.length : rank;
}

// Only secure links are kept, as a page can't safely play anything else. Some links leave off the "https:".
function secureLink(audio: string | undefined): string | null {
  if (!audio) return null;
  const link = audio.startsWith("//") ? `https:${audio}` : audio;
  return link.startsWith("https://") ? link : null;
}

// Prefers an American recording, then British, then any other. The written form comes from the same entry when it can.
export function choosePronunciation(phonetics: Phonetic[]): Pronunciation {
  const withAudio = phonetics
    .map((phonetic) => ({ ...phonetic, audio: secureLink(phonetic.audio) }))
    .filter((phonetic): phonetic is { text?: string; audio: string } => phonetic.audio !== null);
  const best = withAudio.reduce<(typeof withAudio)[number] | null>(
    (chosen, phonetic) => (!chosen || accentRank(phonetic.audio) < accentRank(chosen.audio) ? phonetic : chosen),
    null,
  );
  const text = best?.text || phonetics.find((phonetic) => phonetic.text)?.text || null;
  return { audio: best?.audio ?? null, text };
}

async function ask(word: string, fetcher: FetchLike): Promise<Pronunciation | "unavailable"> {
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return { audio: null, text: null };
    if (!response.ok) return "unavailable";
    const entries = (await response.json()) as { phonetics?: Phonetic[] }[];
    return choosePronunciation(entries.flatMap((entry) => entry.phonetics ?? []));
  } catch {
    return "unavailable";
  }
}

export async function lookUpPronunciation(
  word: string,
  fetcher: FetchLike,
  wait: (ms: number) => Promise<unknown> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Pronunciation | "unavailable"> {
  const first = await ask(word, fetcher);
  if (first !== "unavailable") return first;
  await wait(RETRY_DELAY_MS);
  return ask(word, fetcher);
}
